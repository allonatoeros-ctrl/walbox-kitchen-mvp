// POST locale (solo 127.0.0.1) senza curl: node post.cjs <url> [bearer] -> "<status> <body>"
const [, , url, bearer] = process.argv;
if (!/^http:\/\/127\.0\.0\.1:\d+/.test(url)) { console.log('rifiuto: solo 127.0.0.1'); process.exit(2); }
const headers = { 'Content-Type': 'application/json' }; if (bearer) headers.Authorization = `Bearer ${bearer}`;
fetch(url, { method: 'POST', headers, body: '{}' }).then(async (r) => console.log(r.status, (await r.text()).slice(0, 40)))
  .catch((e) => { console.log('ERR', e.cause?.code || e.message); process.exit(1); });
