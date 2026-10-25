// Edge Function `watchdog-observability` — logica (P0-2, docs/P0-2_PG_NET_ARCHITETTURA.md).
//
// STATO: PROTOTIPO LOCALE — MAI DEPLOYATA. Va copiata in walbox-kitchen-mvp/supabase/functions/watchdog-observability/
// e deployata con `npx supabase functions deploy watchdog-observability --no-verify-jwt` SOLO con gate di Eros.
//
// Cosa fa: riceve dal Watchdog una richiesta firmata (HMAC-SHA256, chiave dedicata per installazione), la valida e
// chiama UNA sola RPC, public.watchdog_obs_gateway, con la chiave service_role iniettata dalla piattaforma. Restituisce
// identità, visibilità, attestazione del percorso e i dati tecnici del controllo richiesto, con una firma di risposta
// legata al nonce della richiesta.
//
// Invarianti:
// - nessun SQL, nessun nome di funzione o tabella preso dall'input: il controllo è un valore di un'allow-list fissa;
// - il Watchdog non riceve mai la chiave service_role, né un JWT, né una credenziale Postgres;
// - la venue e l'installazione lette sono quelle dell'identità del database: l'input può solo dichiarare quelle attese
//   (se non coincidono, nessun dato viene restituito);
// - errori senza testo del database (solo codici), log senza segreti, firme o valori dei parametri;
// - nessuna dipendenza esterna (solo Web API: fetch, crypto.subtle): niente supply chain in un codice che vede
//   service_role.
//
// Nessun import: il file gira identico in Deno (Supabase Edge Runtime) e in Node (test).

export const PROTOCOL = 'wdobs-v1';
const FUNCTION_NAME = 'watchdog_obs_gateway';

export const CHECK_PARAMS: Readonly<Record<string, readonly string[]>> = {
  probe: [],
  b01_orders: ['window_minutes', 'items_grace_seconds', 'since'],
  b02_payments: ['events_window_minutes', 'stale_attempt_hours', 'lookback_days', 'since'],
  b03_webhooks: ['window_minutes', 'paid_event_grace_minutes'],
  b04_kitchen: ['pop_max_minutes', 'paid_hidden_grace_seconds', 'window_minutes', 'unresolved_lookback_days'],
  b05_devices: [],
  b06_chain: ['window_minutes', 'pop_max_minutes', 'paid_hidden_grace_seconds'],
  jobs: ['window_hours'],
  app_errors: ['window_minutes'],
};

/** Chiavi mai ammesse nei dati restituiti (difesa in profondità: le funzioni SQL già non le producono). */
const FORBIDDEN_KEYS = new Set([
  'nickname', 'note', 'notes', 'customer_id', 'customer', 'table_id', 'raw_payload', 'raw_last_event', 'actor_id',
  'reason', 'endpoint', 'p256dh', 'auth_key', 'headers', 'body', 'content', 'url', 'email', 'phone', 'secret', 'token',
  'password', 'authorization', 'apikey', 'error_msg',
]);

const MAX_BODY_BYTES = 4096;
const MAX_RESPONSE_BYTES = 512 * 1024;
const CLOCK_TOLERANCE_SEC = 30;
const NONCE_TTL_MS = 2 * (CLOCK_TOLERANCE_SEC + 5) * 1000;

export interface GatewayKey {
  kid: string;
  installation_id: string;
  /** base64url, almeno 32 byte. */
  secret: string;
  status: 'active' | 'revoked';
  /** ISO 8601: oltre questa data la chiave è rifiutata. */
  expires_at?: string;
}

export interface GatewayDeps {
  env(name: string): string | undefined;
  fetch: typeof fetch;
  now(): number;
  log(line: Record<string, unknown>): void;
}

export interface GatewayLimits {
  perKeyPerMinute: number;
  unauthenticatedPerMinute: number;
  upstreamTimeoutMs: number;
}

const DEFAULT_LIMITS: GatewayLimits = { perKeyPerMinute: 60, unauthenticatedPerMinute: 30, upstreamTimeoutMs: 8000 };

// ----------------------------------------------------------------------------------------------------------- utilità

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function requestCanonical(kid: string, ts: string, nonce: string, installationId: string, bodySha256: string): string {
  return [`${PROTOCOL}-req`, kid, ts, nonce, installationId, bodySha256].join('\n');
}

export function responseCanonical(kid: string, nonce: string, status: number, bodySha256: string): string {
  return [`${PROTOCOL}-res`, kid, nonce, String(status), bodySha256].join('\n');
}

/** Token bucket in memoria. Su Supabase vale per singola istanza: è un limite di contenimento, non di quota. */
class Bucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly capacity: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.last = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 60_000) * this.capacity);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// ------------------------------------------------------------------------------------------------ configurazione

interface Config {
  supabaseUrl: string;
  serviceKey: string;
  installationId: string;
  keys: GatewayKey[];
}

function readConfig(deps: GatewayDeps): Config | null {
  const supabaseUrl = deps.env('SUPABASE_URL');
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY') || secretKeyFromDictionary(deps.env('SUPABASE_SECRET_KEYS'));
  const installationId = deps.env('WATCHDOG_INSTALLATION_ID');
  const rawKeys = deps.env('WATCHDOG_OBS_KEYS');
  if (!supabaseUrl || !serviceKey || !installationId || !rawKeys) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(installationId)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeys);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const keys: GatewayKey[] = [];
  for (const k of parsed) {
    if (!k || typeof k !== 'object') return null;
    const g = k as Record<string, unknown>;
    if (typeof g.kid !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(g.kid)) return null;
    if (typeof g.installation_id !== 'string' || typeof g.secret !== 'string') return null;
    const raw = b64urlDecode(g.secret);
    if (!raw || raw.length < 32) return null;
    if (g.status !== 'active' && g.status !== 'revoked') return null;
    if (g.expires_at !== undefined && (typeof g.expires_at !== 'string' || !Number.isFinite(Date.parse(g.expires_at)))) return null;
    keys.push({ kid: g.kid, installation_id: g.installation_id, secret: g.secret, status: g.status, ...(g.expires_at ? { expires_at: g.expires_at as string } : {}) });
  }
  // un kid ripetuto renderebbe ambigua la revoca (vincerebbe la prima voce): configurazione rifiutata
  if (new Set(keys.map((k) => k.kid)).size !== keys.length) return null;
  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ''), serviceKey, installationId, keys };
}

/** Nuove chiavi API di Supabase: dizionario JSON { nome: "sb_secret_…" } iniettato nelle Edge Function. */
function secretKeyFromDictionary(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const v = d.default ?? Object.values(d)[0];
    return typeof v === 'string' && v.startsWith('sb_secret_') ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Header per PostgREST: le chiavi sb_secret_ vanno solo in `apikey` (non sono JWT), quelle legacy anche come Bearer. */
function platformHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

// ------------------------------------------------------------------------------------------- validazione input

interface ParsedRequest {
  installation_id: string;
  venue_id: string;
  check: string;
  params: Record<string, number | string>;
}

function parseBody(text: string): ParsedRequest | string {
  let b: unknown;
  try {
    b = JSON.parse(text);
  } catch {
    return 'json_non_valido';
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'corpo_non_oggetto';
  const o = b as Record<string, unknown>;
  const allowed = new Set(['v', 'installation_id', 'venue_id', 'check', 'params']);
  if (Object.keys(o).some((k) => !allowed.has(k))) return 'campo_non_ammesso';
  if (o.v !== 1) return 'versione_non_supportata';
  if (typeof o.installation_id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(o.installation_id)) return 'installation_id_non_valido';
  if (typeof o.venue_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(o.venue_id)) return 'venue_id_non_valido';
  if (typeof o.check !== 'string' || !Object.prototype.hasOwnProperty.call(CHECK_PARAMS, o.check)) return 'controllo_non_ammesso';
  const params: Record<string, number | string> = {};
  const p = o.params ?? {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'parametri_non_validi';
  const allowedParams = CHECK_PARAMS[o.check] ?? [];
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (!allowedParams.includes(k)) return 'parametro_non_ammesso';
    if (k === 'since') {
      if (typeof v !== 'string' || v.length > 40 || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}(:?\d{2})?)?)?$/.test(v) || !Number.isFinite(Date.parse(v))) {
        return 'parametro_non_valido';
      }
      params[k] = v;
    } else {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1_000_000) return 'parametro_non_valido';
      params[k] = v;
    }
  }
  return { installation_id: o.installation_id, venue_id: o.venue_id, check: o.check, params };
}

/**
 * Rimuove chiavi vietate e limita profondità, lunghezze e array. Un taglio viene segnalato in `state.truncated`: il
 * chiamante non deve mai restituire dati tagliati come completi (un job o un'anomalia oltre il limite sparirebbe e il
 * sensore potrebbe dichiarare OK).
 */
export function scrub(v: unknown, depth = 0, state: { truncated: boolean } = { truncated: false }): unknown {
  if (depth > 8) {
    state.truncated = true;
    return null;
  }
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.length <= 512) return v;
    state.truncated = true;
    return v.slice(0, 512);
  }
  if (Array.isArray(v)) {
    if (v.length > 200) state.truncated = true;
    return v.slice(0, 200).map((x) => scrub(x, depth + 1, state));
  }
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue;
      out[k] = scrub(x, depth + 1, state);
    }
    return out;
  }
  state.truncated = true;
  return null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Corpo della richiesta letto fino a `max` byte; null se più grande (lettura interrotta). */
async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// ------------------------------------------------------------------------------------------------------- handler

export function createHandler(deps: GatewayDeps, overrides: Partial<GatewayLimits> = {}): (req: Request) => Promise<Response> {
  const limits: GatewayLimits = { ...DEFAULT_LIMITS, ...overrides };
  const nonces = new Map<string, number>();
  const perKey = new Map<string, Bucket>();
  const unauth = new Bucket(limits.unauthenticatedPerMinute, deps.now());
  const keyCache = new Map<string, CryptoKey>();

  async function hmacKey(secret: string): Promise<CryptoKey> {
    let k = keyCache.get(secret);
    if (!k) {
      k = await crypto.subtle.importKey('raw', b64urlDecode(secret)!, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
      keyCache.set(secret, k);
    }
    return k;
  }

  function plain(status: number, error: string, extra: Record<string, string> = {}): Response {
    return new Response(JSON.stringify({ v: 1, error }), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
    });
  }

  async function signed(key: GatewayKey, nonce: string, status: number, payload: Record<string, unknown>): Promise<Response> {
    const body = JSON.stringify(payload);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key.secret), enc.encode(responseCanonical(key.kid, nonce, status, await sha256Hex(body)))));
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-watchdog-response-signature': `v1=${b64urlEncode(mac)}` },
    });
  }

  function audit(started: number, fields: Record<string, unknown>): void {
    deps.log({ fn: 'watchdog-observability', at: new Date(deps.now()).toISOString(), ms: Math.round(deps.now() - started), ...fields });
  }

  function pruneNonces(now: number): void {
    if (nonces.size < 1000) return;
    for (const [n, exp] of nonces) if (exp < now) nonces.delete(n);
    // limite duro: in caso di flusso anomalo si scartano i più vecchi (la finestra temporale resta la difesa principale)
    while (nonces.size > 10_000) nonces.delete(nonces.keys().next().value as string);
  }

  async function rpc(cfg: Config, check: string, params: Record<string, unknown>): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string; code?: string }> {
    let res: Response;
    try {
      res = await deps.fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${FUNCTION_NAME}`, {
        method: 'POST',
        headers: {
          ...platformHeaders(cfg.serviceKey),
          'content-type': 'application/json',
          accept: 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify({ p_check: check, p_params: params }),
        redirect: 'manual',
        signal: AbortSignal.timeout(limits.upstreamTimeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      return name === 'TimeoutError' || name === 'AbortError'
        ? { ok: false, status: 504, error: 'upstream_timeout' }
        : { ok: false, status: 502, error: 'upstream_unreachable' };
    }
    const text = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      try {
        const e = JSON.parse(text) as { code?: unknown };
        if (typeof e.code === 'string' && /^[A-Z0-9]{2,10}$/.test(e.code)) code = e.code;
      } catch {
        /* corpo non JSON: nessun dettaglio */
      }
      if (code === 'PGRST202' || code === '42883' || code === '3F000') return { ok: false, status: 503, error: 'gateway_function_missing', code };
      if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: 'upstream_auth', code };
      if (code === '57014') return { ok: false, status: 504, error: 'upstream_timeout', code };
      if (res.status === 503 || res.status === 520 || res.status === 504) return { ok: false, status: 502, error: 'database_unavailable', code };
      return { ok: false, status: 502, error: 'upstream_error', code };
    }
    if (text.length > MAX_RESPONSE_BYTES) return { ok: false, status: 502, error: 'response_too_large' };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, status: 502, error: 'upstream_bad_json' };
    }
  }

  /** Lo schema net NON deve essere esposto dall'API: richiesta di sola descrizione OpenAPI con Accept-Profile: net. */
  async function netApiExposed(cfg: Config): Promise<boolean | null> {
    try {
      const res = await deps.fetch(`${cfg.supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: { ...platformHeaders(cfg.serviceKey), 'accept-profile': 'net', accept: 'application/openapi+json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
      });
      await res.body?.cancel();
      if (res.status === 406) return false;
      if (res.status === 200) return true;
      return null;
    } catch {
      return null;
    }
  }

  return async function handle(req: Request): Promise<Response> {
    const started = deps.now();
    if (req.method !== 'POST') return plain(405, 'method_not_allowed', { allow: 'POST' });

    const kid = req.headers.get('x-watchdog-key-id') ?? '';
    const ts = req.headers.get('x-watchdog-timestamp') ?? '';
    const nonce = req.headers.get('x-watchdog-nonce') ?? '';
    const sigHeader = req.headers.get('x-watchdog-signature') ?? '';

    const reject = (reason: string): Response => {
      // l'IP del chiamante è già nei log di piattaforma della funzione: qui non si duplica
      audit(started, { outcome: 'rejected', reason, kid: /^[a-z0-9._-]{1,64}$/.test(kid) ? kid : null });
      // stesso esito per ogni causa di autenticazione: nessun oracolo su chiavi esistenti, revocate o scadute
      return plain(401, 'unauthenticated');
    };

    if (!kid || !ts || !nonce || !sigHeader) {
      if (!unauth.take(deps.now())) return plain(429, 'rate_limited', { 'retry-after': '60' });
      return reject('missing_credentials');
    }
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(kid) || !/^\d{9,11}$/.test(ts) || !/^[A-Za-z0-9_-]{22,64}$/.test(nonce) || !/^v1=[A-Za-z0-9_-]{43}$/.test(sigHeader)) {
      if (!unauth.take(deps.now())) return plain(429, 'rate_limited', { 'retry-after': '60' });
      return reject('malformed_credentials');
    }

    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return plain(413, 'payload_too_large');
    // lettura a byte contati: senza Content-Length (chunked) req.text() accumulerebbe tutto prima del controllo
    const bodyText = await readCapped(req, MAX_BODY_BYTES);
    if (bodyText === null) return plain(413, 'payload_too_large');

    const cfg = readConfig(deps);
    if (!cfg) {
      audit(started, { outcome: 'error', reason: 'gateway_not_configured' });
      return plain(503, 'gateway_not_configured');
    }

    const key = cfg.keys.find((k) => k.kid === kid);
    const now = deps.now();
    if (!key || key.status !== 'active' || (key.expires_at && Date.parse(key.expires_at) <= now)) {
      if (!unauth.take(now)) return plain(429, 'rate_limited', { 'retry-after': '60' });
      return reject(!key ? 'unknown_key' : key.status !== 'active' ? 'revoked_key' : 'expired_key');
    }
    if (Math.abs(now / 1000 - Number(ts)) > CLOCK_TOLERANCE_SEC) {
      if (!unauth.take(now)) return plain(429, 'rate_limited', { 'retry-after': '60' });
      return reject('stale_timestamp');
    }
    // la firma copre l'installazione dichiarata nel corpo: si estrae solo per costruire il testo da verificare
    let declaredInstallation = '';
    try {
      const b = JSON.parse(bodyText) as { installation_id?: unknown };
      if (typeof b?.installation_id === 'string') declaredInstallation = b.installation_id;
    } catch {
      /* il corpo malformato fallisce la firma o la validazione */
    }
    const sig = b64urlDecode(sigHeader.slice(3));
    const valid =
      sig !== null &&
      (await crypto.subtle.verify('HMAC', await hmacKey(key.secret), sig, enc.encode(requestCanonical(kid, ts, nonce, declaredInstallation, await sha256Hex(bodyText)))));
    if (!valid) {
      if (!unauth.take(now)) return plain(429, 'rate_limited', { 'retry-after': '60' });
      return reject('bad_signature');
    }
    pruneNonces(now);
    if (nonces.has(nonce)) return reject('replayed_nonce');
    nonces.set(nonce, now + NONCE_TTL_MS);

    // ---------------------------------------------------------------- da qui la richiesta è autenticata: risposte firmate
    let bucket = perKey.get(kid);
    if (!bucket) perKey.set(kid, (bucket = new Bucket(limits.perKeyPerMinute, now)));
    if (!bucket.take(now)) {
      audit(started, { outcome: 'rate_limited', kid });
      return signed(key, nonce, 429, { v: 1, error: 'rate_limited', request_nonce: nonce });
    }

    const parsed = parseBody(bodyText);
    if (typeof parsed === 'string') {
      audit(started, { outcome: 'bad_request', kid, reason: parsed });
      return signed(key, nonce, 400, { v: 1, error: 'bad_request', reason: parsed, request_nonce: nonce });
    }
    // identità vincolata: chiave ↔ deployment ↔ richiesta
    if (key.installation_id !== cfg.installationId || parsed.installation_id !== cfg.installationId) {
      audit(started, { outcome: 'forbidden', kid, reason: 'installation_mismatch', check: parsed.check });
      return signed(key, nonce, 403, { v: 1, error: 'installation_forbidden', request_nonce: nonce });
    }

    const r = await rpc(cfg, parsed.check, parsed.params);
    if (!r.ok) {
      audit(started, { outcome: 'upstream_error', kid, check: parsed.check, error: r.error, code: r.code ?? null });
      return signed(key, nonce, r.status, { v: 1, error: r.error, ...(r.code ? { code: r.code } : {}), request_nonce: nonce });
    }
    const result = r.value as { identity?: Record<string, unknown> | null; visibility?: unknown; gateway?: unknown; data?: unknown } | null;
    const identity = result?.identity;
    if (!isObj(result) || !isObj(identity) || !isObj(result.visibility) || !isObj(result.gateway)) {
      audit(started, { outcome: 'upstream_error', kid, check: parsed.check, error: 'incomplete_result' });
      return signed(key, nonce, 502, { v: 1, error: 'incomplete_result', request_nonce: nonce });
    }
    // l'identità del database decide cosa si legge: se non coincide con quella dichiarata, nessun dato esce
    if (identity.installation_id !== cfg.installationId) {
      audit(started, { outcome: 'identity_mismatch', kid, check: parsed.check, reason: 'installation' });
      return signed(key, nonce, 409, { v: 1, error: 'identity_mismatch', reason: 'installation', request_nonce: nonce });
    }
    if (identity.venue_id !== parsed.venue_id) {
      audit(started, { outcome: 'identity_mismatch', kid, check: parsed.check, reason: 'venue' });
      return signed(key, nonce, 409, { v: 1, error: 'identity_mismatch', reason: 'venue', request_nonce: nonce });
    }
    const cut = { truncated: false };
    const clean = {
      identity: scrub(identity, 0, cut),
      visibility: scrub(result.visibility, 0, cut),
      gateway: scrub(result.gateway, 0, cut) as Record<string, unknown>,
      data: scrub(result.data ?? null, 0, cut),
    };
    if (cut.truncated) {
      // dati oltre i limiti: mai restituiti come completi
      audit(started, { outcome: 'upstream_error', kid, check: parsed.check, error: 'result_truncated' });
      return signed(key, nonce, 502, { v: 1, error: 'incomplete_result', reason: 'truncated', request_nonce: nonce });
    }
    const runtime = parsed.check === 'probe' ? { net_api_exposed: await netApiExposed(cfg) } : {};
    const payload = {
      v: 1,
      request_nonce: nonce,
      installation_id: cfg.installationId,
      check: parsed.check,
      served_at: new Date(deps.now()).toISOString(),
      result: { ...clean, gateway: { ...clean.gateway, ...runtime } },
    };
    audit(started, { outcome: 'ok', kid, check: parsed.check });
    return signed(key, nonce, 200, payload);
  };
}
