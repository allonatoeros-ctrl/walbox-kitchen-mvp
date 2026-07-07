# Audit read-only — Ottimizzazione CLAUDE.md

**Data:** 2026-07-07
**Tipo:** Audit read-only (nessuna modifica applicata in questo audit)
**Oggetto:** valutare se CLAUDE.md è troppo lungo, ridondante o contraddittorio, e proporre una versione più efficace.

---

## 1. Word count e sezioni più pesanti

| File | Parole | Note |
|---|---|---|
| CLAUDE.md | **3668** | 21 sezioni, caricato ogni sessione |
| ai-ops/SECURITY_POLICY.md | 519 | 10 regole router |
| ai-ops/runner/README.md | 3212 | changelog V1.1→V1.6.1 (non caricato in sessione) |
| skill diff-risk-reviewer | 3896 | duplica CLAUDE.md §14 |
| skill quality-gate-verifier | 2934 | duplica CLAUDE.md §13 |
| skill silent-report | 374 | duplica CLAUDE.md §0.5 |

Sezioni CLAUDE.md più pesanti:
1. **§5 Protected Areas** — liste lunghe per Supabase/Spotify/Env/Auth/Routing/package.json/Deploy.
2. **§3 Mandatory Workflow** — 9 step per esteso con blocchi comando.
3. **§15 Final Report Format** — template completo inline (10 voci).
4. **§13 Quality Gates** — checklist completa inline (già una skill).
5. **§14 Diff Risk Review** — formato completo inline (già una skill).
6. **§8 UI Rules + §9 File-Specific + §20 Poster TV** — tre blocchi UI parzialmente sovrapposti.

---

## 2. Regole duplicate tra i file

| Regola | In CLAUDE.md | Duplicata in |
|---|---|---|
| Quality Gates checklist | §13 (inline completo) | skill `quality-gate-verifier` (CLAUDE.md dice già "prefer the skill; below is fallback") |
| Diff Risk Review format | §14 (inline completo) | skill `diff-risk-reviewer` (idem "fallback") |
| Silent Report + Terminal Silent Mode | §0.5 | skill `silent-report` **+** ogni template prompt Runner → **tripla** duplicazione |
| Final Report Format §15 | §15 | `result_template.md` + rimando in ogni template prompt |
| Workflow 9-step §3 | §3 | template prompt (righe 13-16) |
| Aree protette / security | §5 | SECURITY_POLICY.md regole 1-10 **+** "SECURITY REMINDERS" nei template prompt |
| Comandi che richiedono approvazione | §10 + §11 | SECURITY_POLICY.md §7 allowlist |
| Regola Poster TV | §9 + §20 | duplicate tra loro |

Debito di sync già **dichiarato** dal Runner README ("Limiti V1.4"): i 6 template per-modo sono
"testo statico da tenere manualmente coerente con CLAUDE.md §3/§5/§15 e SECURITY_POLICY.md".

---

## 3. Istruzioni che dovrebbero stare in skill, non in CLAUDE.md

- **§13 Quality Gates** → vive già in `quality-gate-verifier`. In CLAUDE.md resta 1 riga di rimando.
- **§14 Diff Risk Review** → vive già in `diff-risk-reviewer`. Resta 1 riga di rimando.
- **§0.5 meccanica Silent/Terminal Silent** → vive già in `silent-report`. In Core resta principio + rimando.
- **§15 template report** → skill `silent-report` / `result_template.md`; in Core resta il nome del formato.

## 4. Istruzioni che dovrebbero stare in SECURITY_POLICY.md

- **§10 Allowed commands** + **§11 Commands requiring approval** → allowlist SECURITY_POLICY.md §7 (già esistente). CLAUDE.md tiene 1 riga di rimando.
- **§16 Commit** + **§17 Restore** → coerenti con SECURITY_POLICY.md §3 (no push automatico).

## 5. Contraddizioni / ambiguità

1. **Allowlist comandi divergenti**: SECURITY_POLICY.md §7 elenca `npm test`/`npx playwright test`;
   CLAUDE.md §10 elenca `npm run build`/`npm run dev`; §13 chiede solo "npm run build". Tre liste diverse.
2. **§20 Poster TV vs §7 priorità dinamica**: §7 dice "priorità NON hardcoded, leggi CHECKPOINT";
   §20 hardcoda "Poster first" + file target come default. Con Kitchen completa (2026-06-23) e track su
   Shuffle Night/Jukebox, il default §20 è **stale** e contraddice §7.
3. **§9 vs §20**: stesse regole Poster TV ripetute.
4. **Due directory template**: `ai-ops/templates/` (pipeline manuale) vs `ai-ops/runner/templates/`.
5. **Lingua mista**: §15 impone report in italiano; CLAUDE.md in inglese; skill in italiano.

## 6. Rischio Context Bloat / Skill Leakage / Conflicting Instructions

- **Context Bloat — ALTO**: 3668 parole caricate ogni sessione, di cui §13/§14/§15 esistono già come skill.
- **Skill Leakage — MEDIO/ALTO**: CLAUDE.md inlina versioni "fallback" abbreviate di quality-gate/diff-risk →
  il modello può seguire la versione corta invece della skill → drift quando una delle due cambia.
- **Conflicting Instructions — MEDIO**: allowlist comandi divergenti su 3 file; §20 stale vs §7 vs stato reale.

---

## 7. Proposta CLAUDE.md Core — decisione di implementazione

Nota chiave emersa in fase di applicazione: i numeri di sezione di CLAUDE.md sono **anchor caricanti**
referenziati in tutto ai-ops (86 rimandi a §5, decine a §2/§15/§0.5 in skill, template Runner,
SECURITY_POLICY.md e run log storici). **Rinumerare romperebbe il vincolo "non perdere/rompere riferimenti".**

Decisione: il Core slim **mantiene gli stessi numeri di sezione** come anchor stabili e taglia solo il
*contenuto* — ogni sezione diventa un puntatore breve a skill / SECURITY_POLICY.md / CHECKPOINT.md.
Risultato: word count ~600 parole a parità di regole effettive, zero riferimenti rotti.

## 8. Moved rules map

| Regola attuale | Destinazione | Azione |
|---|---|---|
| §0 / §21 Principio | CLAUDE.md (2 righe) | condensare |
| §0.5 Silent Report (meccanica) | skill `silent-report` | Core: principio + rimando |
| §1 Identity | 1 riga | condensare |
| §2 Roles + subagenti | Core (tabella compressa) | mantenere anchor §2 |
| §3 Workflow | Core (catena 9-step, 3 righe) | mantenere anchor §3 |
| §4 Scope Control (16 punti) | Core (4 righe) | comprimere |
| §5 Protected Areas | Core (elenco) + SECURITY_POLICY.md (dettaglio) | mantenere anchor §5 |
| §6 Save-Token / §18 Ambiguità | Core (1 riga) | comprimere |
| §7 Priorità | CHECKPOINT.md | Core: "priorità solo in CHECKPOINT" |
| §8 UI / §9 File-Specific / §20 Poster | Core §8-§9, §20 → CHECKPOINT | unire, rimuovere priorità stale |
| §10 + §11 Comandi | SECURITY_POLICY.md §7 | Core: rimando |
| §12 Stop Conditions | Core (formato STOP) | mantenere anchor §12 |
| §13 Quality Gates | skill `quality-gate-verifier` | Core: 1 riga rimando |
| §14 Diff Risk Review | skill `diff-risk-reviewer` | Core: 1 riga rimando |
| §15 Report Format | skill `silent-report` / `result_template.md` | Core: nome formato |
| §16 Commit / §17 Restore | Core (2 righe) + SECURITY_POLICY.md | comprimere |
| §19 Large Requests | Core (2 righe) | mantenere |
| §20 Poster TV rule | CHECKPOINT NEXT STEP | rimuovere priorità hardcoded |

**Riduzione stimata**: da 3668 a ~600 parole (−83%), a parità di regole effettive (spostate in
skill/policy/CHECKPOINT già esistenti e caricati on-demand).
