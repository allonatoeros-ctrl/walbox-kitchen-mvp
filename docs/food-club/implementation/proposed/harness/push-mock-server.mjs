// Endpoint push finto: /ok -> 201 (decifra aes128gcm), /gone -> 410. Registra tutto in received.jsonl.
import http from 'node:http';
import { createECDH, createPrivateKey, createHmac, createDecipheriv, createPublicKey, verify, diffieHellman } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
const dir = process.argv[2];
const ua = JSON.parse(readFileSync(`${dir}/ua.json`, 'utf8'));
const hkdf = (salt, ikm, info, len) => { const prk = createHmac('sha256', salt).update(ikm).digest(); return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len); };
function decrypt(body) {
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
  const uaPriv = createPrivateKey({ key: ua.priv, format: 'jwk' });
  const asKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: asPub.subarray(1, 33).toString('base64url'), y: asPub.subarray(33).toString('base64url') }, format: 'jwk' });
  const ecdh = diffieHellman({ privateKey: uaPriv, publicKey: asKey });
  const uaPub = Buffer.from(ua.p256dh, 'base64url');
  const ikm = hkdf(Buffer.from(ua.auth, 'base64url'), ecdh, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return pt.subarray(0, pt.lastIndexOf(2)).toString('utf8');
}
function checkVapid(h) {
  const m = /vapid t=([^,]+),\s*k=(.+)/.exec(h || ''); if (!m) return 'no_vapid_header';
  const [hd, pl, sg] = m[1].split('.'); const claims = JSON.parse(Buffer.from(pl, 'base64url'));
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(m[2], 'base64url').subarray(1, 33).toString('base64url'), y: Buffer.from(m[2], 'base64url').subarray(33).toString('base64url') }, format: 'jwk' });
  const good = verify('sha256', Buffer.from(`${hd}.${pl}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sg, 'base64url'));
  return good && m[2] === ua.vapidPub ? `vapid_ok aud=${claims.aud}` : 'vapid_bad';
}
http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks); const rec = { path: req.url, ttl: req.headers.ttl, enc: req.headers['content-encoding'], vapid: checkVapid(req.headers.authorization) };
    if (req.url.startsWith('/gone')) { rec.status = 410; } else { try { rec.payload = JSON.parse(decrypt(body)); rec.status = 201; } catch (e) { rec.status = 400; rec.err = e.message; } }
    appendFileSync(`${dir}/received.jsonl`, JSON.stringify(rec) + '\n'); res.writeHead(rec.status); res.end();
  });
}).listen(8899, '0.0.0.0', () => console.log('push mock on 8899'));
