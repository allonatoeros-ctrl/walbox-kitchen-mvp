// Prova locale: push service finto (HTTPS, decifra aes128gcm) + PostgREST finto (RPC -> psql sul DB clone).
// Nessuna rete esterna. Uso: NODE_PATH=<tools>/node_modules node fakes.cjs <db> <outdir> (outdir con key.pem/cert.pem)
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const ece = require('http_ece');

const [, , DB, OUT] = process.argv;
const keys = JSON.parse(fs.readFileSync(`${OUT}/subkeys.json`, 'utf8')); // { name: { priv(base64url), pub, auth } }
const received = [];

https.createServer({ key: fs.readFileSync(`${OUT}/key.pem`), cert: fs.readFileSync(`${OUT}/cert.pem`) }, (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const name = req.url.split('/').pop();
    const rec = { name, path: req.url, encoding: req.headers['content-encoding'], ttl: req.headers.ttl,
      vapid: /^vapid t=.+, k=.+/.test(req.headers.authorization || '') };
    try {
      const k = keys[name];
      const ecdh = require('node:crypto').createECDH('prime256v1');
      ecdh.setPrivateKey(Buffer.from(k.priv, 'base64url'));
      rec.payload = JSON.parse(ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: ecdh,
        authSecret: k.auth }).toString('utf8'));
    } catch (e) { rec.decryptError = String(e.message || e); }
    received.push(rec);
    fs.writeFileSync(`${OUT}/received.json`, JSON.stringify(received, null, 2));
    if (req.url.startsWith('/gone/')) { res.writeHead(410); res.end(); return; }
    if (req.url.startsWith('/hang/')) return; // mai risposta: deve scattare il timeout della funzione
    res.writeHead(201); res.end();
  });
}).listen(8443, '127.0.0.1');

const psql = (sqlText) => {
  const r = spawnSync('psql', ['-h', '127.0.0.1', '-p', '54329', '-U', 'postgres', '-d', DB, '-qAtX', '-v', 'ON_ERROR_STOP=1', '-c', sqlText], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim().split('\n').pop();
};
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const service = `SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);`;

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    fs.appendFileSync(`${OUT}/rpc.log`, `${req.method} ${req.url} ${JSON.stringify(body)}\n`);
    try {
      let out;
      if (req.url.startsWith('/rest/v1/rpc/food_club_push_claim_batch')) {
        out = psql(`${service} SELECT COALESCE(jsonb_agg(t), '[]')::text FROM public.food_club_push_claim_batch(${Number(body.p_limit) || 50}) t;`);
      } else if (req.url.startsWith('/rest/v1/rpc/food_club_push_report')) {
        const gone = `ARRAY[${(body.p_gone_endpoints || []).map(lit).join(',')}]::text[]`;
        psql(`${service} SELECT public.food_club_push_report(${lit(body.p_message_id)}::uuid, ${Number(body.p_delivered) || 0}, ${gone}, ${lit(body.p_error)});`);
        out = 'null';
      } else { res.writeHead(404); res.end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'P0001', message: String(e.message) }));
    }
  });
}).listen(54321, '127.0.0.1');
console.log('fakes ready');
