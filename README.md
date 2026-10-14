# Walbox Kitchen

Ordini e pagamenti dal telefono (QR) per The Walrus Pub: il cliente ordina e paga, lo staff gestisce ordini e
cassa, la TV mostra la cucina.

> **Attenzione: la produzione gestisce pagamenti reali (SumUp).** Non applicare migration, non fare deploy e non
> lanciare script "live" senza l'approvazione del product owner. Le regole del repo sono in `CLAUDE.md`.

## Stack

React 19 + Vite 8 (SPA, JavaScript) · funzioni Vercel in `api/` · Supabase (Postgres, RLS, Realtime, Auth,
Edge Functions) · SumUp · Web Push.

## Comandi

```bash
npm run dev      # server di sviluppo
npm run lint     # ESLint
npm run build    # build di produzione (scrive dist/)
node --test src/lib/*.test.js api/_lib/*.test.js   # test unitari (rete mockata)
node --test tests/unit/*.test.mjs                  # test unitari aggiuntivi
npm run test:e2e # Playwright (dev server con bypass auth)
```

`npm test` non esiste. Se `.env.local` punta alla produzione, il guard blocca `dev` e `build`: per una build
locale usa un override.

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build
```

## Dove leggere

- `CLAUDE.md`: regole permanenti, aree protette, flusso di lavoro.
- `CHECKPOINT.md`: stato corrente e prossimo passo.
- `docs/ARCHITECTURE_KITCHEN.md`: architettura (route, hook, API, database).
