// Lint "senza peggiorare" per la CI Kitchen pagamenti.
// Il repo ha problemi di lint gia' presenti su main (es. `process` non definito in api/, config ESLint solo browser):
// `npm run lint` intero fallirebbe per motivi estranei alla PR. Qui, per ogni file .js/.jsx toccato tra BASE e HEAD,
// si confrontano i problemi per regola sulla versione BASE e su quella HEAD (stessa config ESLint, lintText con lo
// stesso percorso). Fallisce se una regola ha piu' problemi in HEAD che in BASE, o se un file nuovo ha problemi.
// Uso: node tests/ci/lint-no-new-problems.mjs <BASE_SHA>
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';
import globals from 'globals';

const base = process.argv[2];
if (!base || !/^[0-9a-f]{7,40}$/.test(base)) {
  console.error('uso: lint-no-new-problems.mjs <sha base>');
  process.exit(2);
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const files = git('diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD')
  .split('\n').filter((f) => /\.(js|jsx)$/.test(f) && !f.startsWith('dist/'));

// eslint.config.js dichiara solo i globali del browser: nei file che girano su Node (funzioni Vercel, script, test)
// ogni `process` diventa un falso no-undef. Solo qui, per base e HEAD allo stesso modo, si aggiungono i globali Node
// a quei percorsi; la config del repo non cambia e il lint completo (informativo) resta quello di sempre.
const eslint = new ESLint({
  overrideConfig: [{
    files: ['api/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', 'supabase/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  }],
});
const count = (msgs) => msgs.reduce((m, x) => m.set(x.ruleId ?? 'fatal', (m.get(x.ruleId ?? 'fatal') ?? 0) + 1), new Map());
let worse = 0;
for (const f of files) {
  if (await eslint.isPathIgnored(f)) continue;
  let baseSrc = null;
  try { baseSrc = git('show', `${base}:${f}`); } catch { /* file nuovo nella PR */ }
  const [head] = await eslint.lintFiles([f]);
  const before = baseSrc === null ? new Map() : count((await eslint.lintText(baseSrc, { filePath: f }))[0].messages);
  const after = count(head.messages);
  const nuovi = [...after].filter(([r, n]) => n > (before.get(r) ?? 0));
  const tot = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`${nuovi.length ? 'PEGGIORA' : 'ok      '} ${f}  base=${baseSrc === null ? 'nuovo' : tot(before)} head=${tot(after)}`);
  for (const [r, n] of nuovi) {
    worse += 1;
    console.log(`    regola ${r}: ${before.get(r) ?? 0} -> ${n}`);
    for (const m of head.messages.filter((x) => (x.ruleId ?? 'fatal') === r)) console.log(`      ${f}:${m.line}:${m.column} ${m.message}`);
  }
}
console.log(`Lint file della PR: ${files.length} file .js/.jsx confrontati con ${base.slice(0, 12)}, regole peggiorate: ${worse}`);
process.exit(worse ? 1 : 0);
