# Audit sicurezza Walbox Kitchen

## ORA
- Data: 2026-10-30 · Branch `feat/restyling-hero` · Fase: **Fase 1 (F01) committata e verificata in Preview; produzione non ancora**.
- Fase 1 fatta: `vercel.json` blocco `headers` su `/(.*)`: X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (enforced) + CSP in **Report-Only** (self + Supabase prod https/wss, img data:/blob:, style 'unsafe-inline'). Verifica: JSON valido, cron intatto, build ok, `dist/index.html` senza script/style inline, bundle senza origini esterne da caricare. NON verificato: header live (serve deploy).
- Fase 1 commit `77194f7`, push su `feat/restyling-hero` (30/10). Preview https://walbox-from-zero-v2-2uhqbq070-allonatoeros-ctrls-projects.vercel.app: header tutti presenti (verificato curl). Console su /kitchen, /kitchen/tv, /kitchen/login: unica violazione CSP = toolbar `vercel.live` (iniettata solo nelle Preview, non in produzione). Supabase https caricato senza violazioni. Non provati: wss Realtime con staff loggato, flusso pagamento SumUp.
- Nota F14 confermato: la Preview e' pubblica senza login Vercel e usa Supabase di PRODUZIONE.
- Prossimo passo Fase 1: merge su `main` (deploy produzione, gate Eros) → una serata in Report-Only → CSP enforced.
- Report: `ai-ops/reports/security-audit-20261030.md` (finding F01–F15 + sezione "Verifica a campione").
- Esito: 0 P0. P1 confermati: F01 header HTTP mancanti, F02 ordini falsi senza limite. F03 smentito. F04 declassato a difesa in profondità.
- Piano proposto (da approvare, una fase alla volta, tutte aree protette):
  1. Header HTTP in `vercel.json` (F01): X-Frame-Options/frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, CSP prima in Report-Only. Gate: deploy.
  2. Migration anti-abuso (F02, F05, F12, promo_pass_issue, F04 REVOKE anon, F15, F06): limite ordini aperti per utente anonimo, limiti lunghezza/quantità. Gate: db push.
  3. `api/` + `src/` (F07, F08, F09, F10, F11): confronto secret a tempo costante, errori generici, bypass e2e solo in DEV, validazione endpoint push.
  4. Controlli manuali Eros: Vercel Deployment Protection sulle Preview (F14); Supabase Auth: signup email disattivato.
- Fuori audit (30/10): repo GitHub `walbox-kitchen-mvp` e' PUBBLICO (secret scanning attivo, 0 alert) → NON committare questo file ne' report di sicurezza finche' resta pubblico; NEEDS_DECISION renderlo privato. Da fare a mano: 2FA su GitHub/Vercel/Supabase/SumUp; backup Supabase (piano/PITR); Supabase Auth leaked-password protection.
- Decisioni aperte: ordine delle fasi; soglia ordini aperti per cliente (NEEDS_DECISION).
- Pendente privacy: verificare 31/10 esito job `kitchen-privacy-retention` (vedi `PRIVACY_GDPR.md`).
