// Guardia di rete per la CI Kitchen pagamenti (tests/ci/kitchen-payments-ci.sh).
// Caricata in OGNI processo Node delle fasi di test/build tramite NODE_OPTIONS=--import=<questo file>.
// Blocca qualunque connessione TCP/TLS verso host che non siano loopback (localhost, 127.x, ::1):
// nessun test, build o lint puo' raggiungere Supabase, SumUp, Vercel o altro, nemmeno per errore.
// Ogni tentativo bloccato viene scritto in KP_CI_NET_LOG: il runner fa fallire la fase se il file non e' vuoto,
// anche quando un test ha intercettato l'errore e sarebbe risultato verde.
import net from 'node:net';
import fs from 'node:fs';

const LOG = process.env.KP_CI_NET_LOG;
const LOOPBACK = new Set(['localhost', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1']);
const isLoopback = (h) => LOOPBACK.has(h) || /^127\.\d+\.\d+\.\d+$/.test(h);

const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  // net.connect/tls.connect passano un array normalizzato [options, cb]; le chiamate dirette (options|port, host).
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  let host;
  let port;
  let path;
  if (first && typeof first === 'object') {
    ({ host, port, path } = first);
  } else if (typeof first === 'string' && Number.isNaN(Number(first))) {
    path = first;
  } else {
    port = first;
    host = typeof args[1] === 'string' ? args[1] : undefined;
  }
  const h = String(host ?? 'localhost').toLowerCase().replace(/^\[|\]$/g, '');
  if (!path && !isLoopback(h)) {
    const err = Object.assign(new Error(`[ci-no-remote] connessione bloccata verso ${h}:${port}`), {
      code: 'ERR_CI_REMOTE_BLOCKED',
    });
    if (LOG) {
      try { fs.appendFileSync(LOG, `${new Date().toISOString()} pid=${process.pid} ${h}:${port}\n`); } catch { /* il log e' best effort */ }
    }
    process.stderr.write(`${err.message}\n`);
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return original.apply(this, args);
};
