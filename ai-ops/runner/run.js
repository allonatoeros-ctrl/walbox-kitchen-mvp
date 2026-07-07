#!/usr/bin/env node
'use strict';

/**
 * ai-factory-runner V1.5-A — Walbox AI Business Factory
 *
 * Genera un ticket/run log in ai-ops/tickets/ a partire da un task raw.
 * Locale, zero dipendenze esterne, nessuna API, nessun LLM.
 *
 * Uso:
 *   node ai-ops/runner/run.js "Verifica TV Poster sync"
 *   node ai-ops/runner/run.js "Verifica TV Poster sync" --dry-run
 *
 * Fonti di verità (referenziate, mai duplicate):
 *   - CLAUDE.md §2 (routing agenti), §5 (aree protette), §15 (report)
 *   - ai-ops/SECURITY_POLICY.md (regole 1-10 del router)
 *   - CHECKPOINT.md (stato corrente del progetto)
 *
 * Le regole di classificazione sono documentate in rules/task_classifier_rules.md.
 * Se modifichi le keyword qui sotto, aggiorna anche quel file (e viceversa).
 *
 * V1.1: legge CHECKPOINT.md in modalità read-only ed estrae uno snapshot
 * sintetico (STABLE / DONE / OPEN ISSUES / NEXT STEP) nel ticket generato.
 * Non scrive mai su CHECKPOINT.md (SECURITY_POLICY.md regola 8). Se il file
 * non esiste, il ticket riporta "CHECKPOINT.md not found" invece di crashare.
 *
 * V1.2-F: aggiunto flag --dry-run (nessuna scrittura in ai-ops/tickets/, solo
 * riepilogo a console) e corretta la precedenza dell'executor: coding /
 * coding-plan / design vincono su qa quando entrambe le categorie sono
 * presenti nello stesso task (prima vinceva sempre qa).
 *
 * V1.3-A: nuova funzione pura recommendSkillAndMode() — aggiunge al run i
 * campi recommended_skill e prompt_mode con cascata a precedenza esplicita
 * (trigger lessicali diff/context/approval, poi condizioni su categorie,
 * rischio, docRole e confidence). I campi sono passati al template ticket
 * (placeholder aggiunti in V1.3-B) e stampati a console. Non tocca
 * classificazione, rischio o executor esistenti.
 *
 * V1.4.1-C: nuova funzione pura detectQaDomain() — dentro la categoria qa,
 * distingue dominio tooling interno (ai-ops/runner) da dominio app/Jukebox
 * via keyword (TOOLING_QA_KEYWORDS/APP_QA_KEYWORDS). Se il dominio è
 * 'tooling' puro, recommendExecutor() instrada su una label descrittiva
 * invece di walbox-qa-serata (nessun subagente dedicato in CLAUDE.md §2).
 * Dominio 'app'/'mixed'/non rilevato → comportamento invariato. 'mixed'
 * aggiunge un warning invece di cambiare executor. Non tocca categorie,
 * rischio, confidence, recommendSkillAndMode o gli altri rami di
 * recommendExecutor.
 *
 * V1.5-A: CLI flags & output safety. Nuovo parseArgs() che separa i flag noti
 * (--dry-run, --show-prompt, --json, --help/-h, e '--' come fine-flag) dal task
 * raw e RIFIUTA i flag sconosciuti con exit code 2 (prima finivano concatenati
 * nel task). Version label centralizzata in RUNNER_VERSION (prima "V1.3"
 * hardcodata in console, disallineata). I warning ora sono stampati per esteso
 * a console (prima solo il conteggio, invisibili in --dry-run). Nuovi output:
 * --show-prompt (stampa il prompt Claude generato) e --json (payload
 * machine-readable). main() ritorna un exit code e l'invocazione è avvolta in
 * try/catch con exit code espliciti. Puramente additivo: classificazione,
 * rischio, executor, confidence, warnings, skill e prompt_mode INVARIATI —
 * golden set A–P non toccato.
 *
 * V1.5-B: project profiles. Nuovo flag --project=<nome> + loadProfile() legge
 * ai-ops/profiles/<nome>.json (default 'walbox', retrocompatibile). Il
 * profilo parametrizza SOLO buildScope()/buildQualityGate() (code_dir,
 * quality_gates) e detectExplicitAgents() (explicit_agents, ex costante
 * EXPLICIT_AGENTS ora dentro walbox.json) — non tocca CATEGORY_RULES,
 * assessRisk, recommendExecutor (cascata), recommendSkillAndMode o
 * detectQaDomain. Unica eccezione concordata con Eros: con
 * --project=ai-factory, qaDomain è forzato a 'tooling' invece che dedotto dal
 * testo, perché un task lanciato con quel profilo riguarda per definizione il
 * runner stesso. --project con nome esplicito ma file profilo mancante/JSON
 * malformato fallisce con exit code 2, mai fallback silenzioso. Golden set
 * A–P rieseguito senza --project: 16/16 PASS, zero regressioni su
 * categorie/rischio/executor/confidence/skill/prompt_mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Il repo ha "type": "module" in package.json: questo file è ESM.
const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));
const AI_OPS_DIR = path.resolve(RUNNER_DIR, '..');
const REPO_ROOT = path.resolve(AI_OPS_DIR, '..');
const TICKETS_DIR = path.join(AI_OPS_DIR, 'tickets');
const PROFILES_DIR = path.join(AI_OPS_DIR, 'profiles');
const DEFAULT_PROJECT = 'walbox';
const TEMPLATES_DIR = path.join(RUNNER_DIR, 'templates');
const PROMPTS_DIR = path.join(TEMPLATES_DIR, 'prompts');
const BASE_PROMPT_TEMPLATE = path.join(TEMPLATES_DIR, 'claude_prompt_template.md');
const CHECKPOINT_PATH = path.join(REPO_ROOT, 'CHECKPOINT.md');
const CHECKPOINT_SECTION_MAX_LINES = 6;

// Etichetta di versione unica del runner (V1.5-A): usata in console, in --help
// e nel campo "version" dell'output --json. Prima era hardcodata come "V1.3"
// nelle stringhe di console pur essendo il codice a V1.4.1 — disallineamento
// risolto centralizzandola qui.
const RUNNER_VERSION = 'V1.5-B';

// ---------------------------------------------------------------------------
// Regole di classificazione (keyword locali, match per parola intera;
// le keyword con spazi sono cercate come frase). Documentate in
// rules/task_classifier_rules.md — tenere in sync.
// ---------------------------------------------------------------------------

const CATEGORY_RULES = {
  research: [
    'studia', 'ricerca', 'ricerche', 'benchmark', 'analizza mercato',
    'analisi mercato', 'competitor', 'research', 'esplora', 'indaga',
  ],
  product: [
    'roadmap', 'priorità', 'priorita', 'monetizzazione', 'prodotto',
    'strategia', 'sprint', 'backlog', 'vision', 'pricing', 'shuffle night',
    'checklist', 'pilota',
  ],
  'coding-plan': [
    'piano', 'plan', 'prepara piano', 'micro-task', 'spec', 'progetta',
    'prossimo step',
  ],
  checkpoint: [
    'checkpoint',
  ],
  coding: [
    'fix', 'fixa', 'bug', 'implementa', 'codice', 'refactor', 'hook',
    'componente', 'feature', 'funzione', 'errore', 'crash', 'code',
  ],
  qa: [
    'verifica', 'verificare', 'test', 'testa', 'qa', 'stabile', 'controlla',
    'collauda', 'e2e', 'regressione', 'smoke', 'sync', 'stress',
    'shuffle night', 'checklist', 'pilota',
  ],
  design: [
    'visual', 'layout', 'ui', 'poster', 'design', 'grafica', 'stile',
    'css', 'estetica', 'tv', 'schermo', 'mobile',
  ],
  tv: [
    'tv', 'poster', 'tv-poster', 'live tv', 'schermo',
  ],
  spotify: [
    'spotify',
  ],
  supabase: [
    'supabase',
  ],
  docs: [
    'readme', 'documenta', 'documentazione', 'fonte', 'fonti', 'markdown',
    'doc', 'docs', 'changelog', 'appunti',
  ],
  deploy: [
    'deploy', 'vercel', 'produzione', 'hosting', 'release', 'pubblica',
    'rilascio',
  ],
  security: [
    'security', 'sicurezza', 'secrets', 'secret', 'env', 'policy',
    'permissions', 'permessi', 'rls', 'abuso', 'hardening', 'spam',
  ],
};

// Keyword che alzano il rischio a HIGH a prescindere dalla categoria,
// perché toccano aree protette (CLAUDE.md §5).
const HIGH_RISK_KEYWORDS = [
  'supabase', 'spotify', 'auth', 'login', 'routing', 'route', 'env',
  'database', 'db', 'token', 'secret', 'secrets', 'deploy', 'vercel',
  'produzione', 'package.json', 'migrazione', 'rls',
];

// Sottoinsieme di HIGH_RISK_KEYWORDS che resta sempre high a prescindere dal
// verbo: sono azioni intrinsecamente di scrittura/rilascio, non hanno una
// forma "di sola lettura" sensata.
const ALWAYS_HIGH_KEYWORDS = [
  'deploy', 'vercel', 'produzione', 'package.json', 'migrazione',
];

// Verbi che indicano un'azione di scrittura sul task. Se compaiono insieme a
// una keyword di area protetta, l'escalation resta high; altrimenti (sola
// lettura/verifica) scende a medium + warning (vedi assessRisk).
const WRITE_VERBS = [
  'aggiorna', 'scrivi', 'crea', 'modifica', 'cambia', 'elimina', 'cancella',
  'installa', 'sovrascrivi', 'sposta', 'rinomina', 'implementa', 'fix',
  'fixa', 'aggiungi', 'rimuovi',
];

// Nomi di subagente citabili esplicitamente nel task raw. Se uno solo compare
// nel testo, vince sull'esecutore calcolato dalla cascata (tranne risk
// high/deploy). V1.5-B: la lista non è più hardcoded qui, vive in
// profile.explicit_agents (vedi ai-ops/profiles/*.json), sincronizzata a mano
// con CLAUDE.md §2.

// Trigger lessicali V1.3 per recommended_skill / prompt_mode
// (recommendSkillAndMode). Come le altre keyword: match per parola intera,
// frasi con spazi cercate come frase contenuta, accenti normalizzati.
const SKILL_DIFF_TRIGGERS = [
  'diff', 'review diff', 'rivedi diff', 'diff risk', 'rischi prima del commit',
  'pre-commit', 'prima del commit', 'valuta rischi', 'git diff',
];
const SKILL_CONTEXT_TRIGGERS = [
  'clear conversation', 'nuova chat', 'ripartiamo puliti', 'contesto sporco',
  'fonti stale', 'fonti non aggiornate', 'handoff', 'riallinea contesto',
  'context reset',
];
const SKILL_APPROVAL_TRIGGERS = [
  'approvato', 'già approvato', 'piano approvato', 'procedi con il piano',
  'procedi con', 'vai con', 'continua da', 'implementa il piano',
  'fase già approvata',
];
const MICRO_FIX_TRIGGERS = [
  'typo', 'testo', 'label', 'titolo', 'copy', 'micro-fix', 'piccolo fix',
  'fix piccolo', 'classe css', 'spacing', 'margin', 'padding', 'colore',
];
const MICRO_FIX_EXCLUDERS = [
  'refactor', 'feature', 'implementa', 'piano', 'più file', 'multipli file',
];

// V1.6: segnali forti che dichiarano il task come audit/verifica di sola
// lettura (Reality Sprint 2026-07-07). Prima di questo fix, task con queste
// frasi potevano comunque finire su micro_fix_prompt/phase_plan_prompt con
// executor walbox-dev, perché keyword generiche come "fix" (categoria
// coding) matchano anche dentro "non fare fix" — non esiste per "fix" una
// negazione mirata come isNegatedCodice per "codice". Frasi scelte
// deliberatamente multi-parola/esplicite (non la singola "non modificare",
// troppo generica: rischierebbe di declassare un task di coding legittimo
// che esclude solo un dettaglio, es. "implementa X ma non modificare Y").
const READ_ONLY_OVERRIDE_TRIGGERS = [
  'read-only', 'audit read-only', 'solo report', 'solo audit',
  'non modificare nulla', 'non fare fix', 'no fix', 'nessuna modifica',
  'sola lettura',
];

function detectReadOnlyOverride(rawTask) {
  const text = normalize(rawTask);
  return READ_ONLY_OVERRIDE_TRIGGERS.some((kw) => matchesKeyword(text, kw));
}

// V1.4.1-C: keyword per distinguere, dentro la categoria qa, se il task
// riguarda il tooling interno (ai-ops/runner stesso) o l'app Walbox/Jukebox.
// Usate solo da detectQaDomain, nessun effetto su CATEGORY_RULES/assessRisk.
const TOOLING_QA_KEYWORDS = [
  'runner', 'ai-ops', 'ai-factory-runner', 'ai-factory', 'classificatore',
  'golden set', 'run.js', 'task_classifier', 'ticket', 'origin/main',
  'push', 'branch', 'repo', 'commit',
];
const APP_QA_KEYWORDS = [
  'jukebox', 'cliente', 'customer', 'staff', 'pub', 'locale', 'tavolo',
  'richiesta', 'dedica', 'nickname', 'coda', 'queue',
];
const APP_QA_CATEGORIES = ['tv', 'spotify', 'supabase', 'design'];

// Categorie che indicano un dominio protetto (TV/Spotify/Supabase) senza
// dire di per sé cosa farci: usate solo per il warning "dominio senza azione".
const DOMAIN_ONLY_CATEGORIES = ['tv', 'spotify', 'supabase'];
const ACTION_CATEGORIES = ['coding', 'coding-plan', 'qa', 'security', 'deploy'];

const RISK_BY_CATEGORY = {
  research: 'low',
  product: 'low',
  design: 'low',
  docs: 'low',
  'coding-plan': 'low',
  checkpoint: 'low',
  tv: 'low',
  spotify: 'low',
  supabase: 'low',
  coding: 'medium',
  qa: 'medium',
  deploy: 'high',
  security: 'high',
};

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove accenti
    .toLowerCase();
}

function slugify(text) {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'task';
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function matchesKeyword(normalizedText, keyword) {
  const kw = normalize(keyword);
  if (kw.includes(' ')) {
    return normalizedText.includes(kw);
  }
  const re = new RegExp(`(^|[^a-z0-9])${kw}($|[^a-z0-9])`);
  return re.test(normalizedText);
}

// Trigger che precedono un riferimento a docs/ o .md nel task raw.
// docs-as-source: il file è materiale di partenza (non assegna categoria docs).
// docs-as-target: il file è ciò che va scritto/modificato.
const DOC_SOURCE_TRIGGERS = ['basato su', 'leggendo', 'da', 'secondo', 'usando'];
const DOC_TARGET_TRIGGERS = ['aggiorna', 'scrivi', 'crea', 'documenta', 'modifica'];
const DOC_PATH_PATTERN = /(docs\/|\.md\b)/;

function findLastTriggerIndex(text, triggers) {
  let best = -1;
  for (const trigger of triggers) {
    const kw = normalize(trigger);
    let idx;
    if (kw.includes(' ')) {
      idx = text.lastIndexOf(kw);
    } else {
      const re = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'g');
      let m;
      idx = -1;
      while ((m = re.exec(text)) !== null) {
        idx = m.index;
      }
    }
    if (idx > best) best = idx;
  }
  return best;
}

// Determina se un riferimento a docs/*.md nel task è materiale di partenza
// (docs-as-source) o l'oggetto da scrivere (docs-as-target), guardando le
// parole che lo precedono. Ritorna null se non c'è nessun riferimento a doc.
function detectDocRole(rawText) {
  const text = normalize(rawText);
  const pathMatch = text.match(DOC_PATH_PATTERN);
  if (!pathMatch) return null;

  const before = text.slice(0, pathMatch.index);
  const targetIdx = findLastTriggerIndex(before, DOC_TARGET_TRIGGERS);
  const sourceIdx = findLastTriggerIndex(before, DOC_SOURCE_TRIGGERS);

  if (targetIdx === -1 && sourceIdx === -1) return null;
  return targetIdx >= sourceIdx ? 'docs-as-target' : 'docs-as-source';
}

// Ritorna la lista di nomi di agente citati esplicitamente nel task raw
// (può essere 0, 1 o più — l'override in recommendExecutor si applica solo
// se è esattamente 1).
function detectExplicitAgents(rawTask, profile) {
  const text = normalize(rawTask);
  return profile.explicit_agents.filter((agent) => matchesKeyword(text, agent));
}

// V1.4.1-C: dentro la categoria qa, distingue se il task riguarda il tooling
// interno (ai-ops/runner) o l'app Walbox/Jukebox, per scegliere l'executor
// corretto in recommendExecutor. Puramente additivo: non tocca categorie,
// rischio o le altre funzioni di classificazione. Ritorna 'tooling' | 'app' |
// 'mixed' | null (nessun segnale di dominio in nessuna delle due liste).
function detectQaDomain(rawTask, categories) {
  const text = normalize(rawTask);
  const hasAppCategory = categories.some((c) => APP_QA_CATEGORIES.includes(c));
  const hasAppKeyword = APP_QA_KEYWORDS.some((kw) => matchesKeyword(text, kw));
  const hasToolingKeyword = TOOLING_QA_KEYWORDS.some((kw) => matchesKeyword(text, kw));
  const isApp = hasAppCategory || hasAppKeyword;

  if (isApp && hasToolingKeyword) return 'mixed';
  if (hasToolingKeyword) return 'tooling';
  if (isApp) return 'app';
  return null;
}

// V1.4.1-B: negazione mirata, SOLO per la keyword 'codice' della categoria
// 'coding' (es. "aggiorna CHECKPOINT.md senza toccare codice" non deve
// assegnare 'coding'). Non generalizzato ad altre keyword/categorie, e non
// tocca HIGH_RISK_KEYWORDS/assessRisk: "non toccare Spotify" deve restare un
// segnale protetto a prescindere dalla negazione (scelta di sicurezza,
// vedi CLAUDE.md §5 e commento su HIGH_RISK_KEYWORDS più sotto).
const NEGATED_CODICE_TRIGGERS = [
  'senza toccare', 'senza modificare', 'senza cambiare',
  'non toccare', 'non modificare',
];
const CODICE_RE = /(^|[^a-z0-9])codice($|[^a-z0-9])/g;

// True solo se OGNI occorrenza di "codice" nel testo è preceduta a breve
// distanza da una delle frasi di negazione sopra. Se anche una sola
// occorrenza non è negata, la keyword conta normalmente.
function isNegatedCodice(text) {
  let sawMatch = false;
  let sawUnnegated = false;
  let m;
  CODICE_RE.lastIndex = 0;
  while ((m = CODICE_RE.exec(text)) !== null) {
    sawMatch = true;
    const start = m.index + m[1].length;
    const before = text.slice(Math.max(0, start - 30), start);
    if (!NEGATED_CODICE_TRIGGERS.some((trig) => before.includes(trig))) {
      sawUnnegated = true;
    }
  }
  return sawMatch && !sawUnnegated;
}

function classify(rawTask) {
  const text = normalize(rawTask);
  const categories = [];
  const matchedKeywords = {};

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    const hits = keywords.filter((kw) => {
      if (category === 'coding' && kw === 'codice' && isNegatedCodice(text)) {
        return false;
      }
      return matchesKeyword(text, kw);
    });
    if (hits.length > 0) {
      categories.push(category);
      matchedKeywords[category] = hits;
    }
  }

  return { categories, matchedKeywords };
}

function assessRisk(rawTask, categories) {
  const text = normalize(rawTask);
  let risk = 'low';
  const reasons = [];

  for (const cat of categories) {
    const catRisk = RISK_BY_CATEGORY[cat] || 'low';
    if (RISK_ORDER[catRisk] > RISK_ORDER[risk]) {
      risk = catRisk;
      reasons.push(`categoria "${cat}" → ${catRisk}`);
    }
  }

  const protectedHits = HIGH_RISK_KEYWORDS.filter((kw) => matchesKeyword(text, kw));
  if (protectedHits.length > 0) {
    const alwaysHigh = protectedHits.some((kw) => ALWAYS_HIGH_KEYWORDS.includes(kw));
    const hasWriteVerb = WRITE_VERBS.some((v) => matchesKeyword(text, v));
    if (alwaysHigh || hasWriteVerb) {
      risk = 'high';
      reasons.push(`keyword area protetta con azione di scrittura: ${protectedHits.join(', ')} (CLAUDE.md §5)`);
    } else if (RISK_ORDER.medium > RISK_ORDER[risk]) {
      risk = 'medium';
      reasons.push(`keyword area protetta in sola lettura: ${protectedHits.join(', ')} → medium + warning, nessun verbo di scrittura rilevato (CLAUDE.md §5)`);
    } else {
      reasons.push(`keyword area protetta in sola lettura: ${protectedHits.join(', ')} → warning, categoria già a rischio ${risk} (CLAUDE.md §5)`);
    }
  }

  if (categories.length === 0) {
    risk = RISK_ORDER[risk] > RISK_ORDER.medium ? risk : 'medium';
    reasons.push('nessuna categoria riconosciuta → rischio minimo medium, richiede revisione umana');
  }

  return { risk, reasons };
}

function recommendExecutor(categories, risk, explicitAgents, docRole, qaDomain, readOnlyOverride) {
  const has = (c) => categories.includes(c);

  if (risk === 'high' || has('deploy')) {
    return {
      executor: 'manual approval required',
      why: 'Rischio high o deploy: nessun esecutore automatico. Eros decide come e se procedere (SECURITY_POLICY.md regole 3, 4, 5, 6).',
    };
  }
  if (explicitAgents.length === 1) {
    return {
      executor: explicitAgents[0],
      why: `Agente citato esplicitamente nel task → ${explicitAgents[0]}, vedi CLAUDE.md §2.`,
    };
  }
  if (has('security')) {
    return {
      executor: 'walbox-hardening',
      why: 'Task di sicurezza → agente walbox-hardening (read-only), vedi CLAUDE.md §2.',
    };
  }
  if (has('coding') || has('coding-plan') || has('design')) {
    if (readOnlyOverride) {
      return {
        executor: 'Claude Code (audit read-only — nessuna implementazione)',
        why: 'Il task dichiara esplicitamente audit/read-only (V1.6): la cascata avrebbe instradato su walbox-dev per keyword tipo "fix"/"piano", ma nessun esecutore deve implementare o modificare file. Override di sicurezza.',
      };
    }
    return {
      executor: 'walbox-dev',
      why: 'Task di implementazione/piano/visual sul repo → agente walbox-dev (o Antigravity se visual-browser, vedi CLAUDE.md §2), sempre dopo Gate 1. Vince su qa quando entrambe le categorie sono presenti nello stesso task (V1.2-F).',
    };
  }
  if (has('qa')) {
    if (qaDomain === 'tooling') {
      return {
        executor: 'Claude Code (verifica manuale ai-ops/runner, nessun subagente dedicato)',
        why: 'Task QA su dominio tooling/runner interno (ai-ops), non app/Jukebox: walbox-qa-serata è pensato per il collaudo runtime della app (QR/staff/TV/Spotify), non per validare ai-ops/run.js. Nessun subagente dedicato oggi in CLAUDE.md §2 (V1.4.1-C).',
      };
    }
    return {
      executor: 'walbox-qa-serata',
      why: 'Task di verifica/collaudo → agente walbox-qa-serata, vedi CLAUDE.md §2. Si applica solo se non è presente anche coding/coding-plan/design, che vince (V1.2-F). Dominio app/Jukebox, misto o non rilevato → default prudente (V1.4.1-C).',
    };
  }
  if (has('checkpoint') || docRole === 'docs-as-target') {
    return {
      executor: 'docs/checkpoint operator',
      why: 'Aggiornamento CHECKPOINT.md o documento da scrivere → operatore docs/checkpoint, patch suggerita non diretta (SECURITY_POLICY.md regola 8).',
    };
  }
  if (has('research') || has('product') || has('docs')) {
    return {
      executor: 'ChatGPT research/product/review',
      why: 'Task di ricerca/prodotto/documentazione → strategia e framing al GPT Operator, vedi CLAUDE.md §2.',
    };
  }
  return {
    executor: 'manual approval required',
    why: 'Categoria non riconosciuta dal classificatore V1: serve triage umano di Eros.',
  };
}

// Cascata recommended_skill / prompt_mode (V1.3-A), precedenza dall'alto:
// prima i trigger lessicali (regole 1-3), poi le condizioni su rischio,
// categorie, docRole e confidence (regole 4-11). Assunzione approvata sulla
// regola 5: coding-plan esclude qa/security come coding, coerente con la
// precedenza executor V1.2-F (un task di piano non è un audit read-only).
function recommendSkillAndMode(categories, risk, docRole, confidence, rawTask) {
  const text = normalize(rawTask);
  const has = (c) => categories.includes(c);
  const hit = (triggers) => triggers.some((kw) => matchesKeyword(text, kw));

  if (hit(SKILL_DIFF_TRIGGERS)) {
    return {
      skill: 'diff-risk-reviewer',
      promptMode: 'review_prompt',
      why: 'Trigger diff/rischio/pre-commit nel task → revisione del diff prima del commit (cascata V1.3 regola 1).',
    };
  }
  if (hit(SKILL_CONTEXT_TRIGGERS)) {
    return {
      skill: 'context-health-reset',
      promptMode: 'handoff_prompt',
      why: 'Trigger di context reset/handoff/fonti stale nel task (cascata V1.3 regola 2).',
    };
  }
  if (hit(SKILL_APPROVAL_TRIGGERS)) {
    return {
      skill: 'none',
      promptMode: 'approval_prompt',
      why: 'Il task dichiara un piano già approvato: nessuna skill aggiuntiva, si procede su scope approvato (cascata V1.3 regola 3).',
    };
  }
  if (risk === 'high' || has('deploy')) {
    return {
      skill: 'none',
      promptMode: 'approval_prompt',
      why: 'Rischio high o deploy: serve approvazione esplicita di Eros, nessuna skill automatica (cascata V1.3 regola 4).',
    };
  }
  if (hit(READ_ONLY_OVERRIDE_TRIGGERS)) {
    return {
      skill: 'quality-gate-verifier',
      promptMode: 'audit_prompt',
      why: 'Il task dichiara esplicitamente audit/read-only (es. "solo report", "non fare fix"): nessuna implementazione, solo verifica — vince su qa/coding/coding-plan sottostanti (cascata V1.6 regola 4b).',
    };
  }
  if ((has('qa') || has('security')) && !has('coding') && !has('coding-plan')) {
    return {
      skill: 'quality-gate-verifier',
      promptMode: 'review_prompt',
      why: 'QA/audit read-only senza coding/coding-plan → verifica quality gate (cascata V1.3 regola 5).',
    };
  }
  if (has('checkpoint') || docRole === 'docs-as-target') {
    return {
      skill: 'none',
      promptMode: 'checkpoint_prompt',
      why: 'Aggiornamento checkpoint o doc target → prompt checkpoint, patch suggerita (cascata V1.3 regola 6).',
    };
  }
  if (hit(MICRO_FIX_TRIGGERS) && !hit(MICRO_FIX_EXCLUDERS)) {
    return {
      skill: 'none',
      promptMode: 'micro_fix_prompt',
      why: 'Trigger di micro-fix localizzato senza segnali multi-file/refactor (cascata V1.3 regola 7).',
    };
  }
  if (has('coding-plan') || (has('coding') && (categories.length > 1 || confidence !== 'high'))) {
    return {
      skill: '/phase-plan',
      promptMode: 'phase_plan_prompt',
      why: 'Piano esplicito o coding multi-segnale/incerto → spezzare in micro-fasi con /phase-plan (cascata V1.3 regola 8).',
    };
  }
  if (has('coding')) {
    return {
      skill: 'none',
      promptMode: 'micro_fix_prompt',
      why: 'Coding a categoria singola con confidence high → micro-fix diretto (cascata V1.3 regola 9).',
    };
  }
  if (categories.length === 0) {
    return {
      skill: 'context-health-reset',
      promptMode: 'handoff_prompt',
      why: 'Task non classificato: contesto incerto, reset/handoff e triage umano (cascata V1.3 regola 10).',
    };
  }
  return {
    skill: 'none',
    promptMode: 'handoff_prompt',
    why: 'Task research/product/docs/design puro: handoff standard, nessuna skill dedicata (cascata V1.3 regola 11).',
  };
}

// Confidence e warning[] sono deterministici: nessun punteggio "morbido",
// solo condizioni esplicite (V1.2-B).
function buildWarnings({ categories, docRole, explicitAgents, executor, qaDomain, readOnlyOverride }) {
  const warnings = [];

  if (readOnlyOverride) {
    warnings.push(
      'task dichiara esplicitamente audit/read-only: NON modificare alcun file, executor non deve implementare (V1.6)',
    );
  }
  if (categories.length > 1) {
    warnings.push(
      `segnali misti: più categorie rilevate insieme (${categories.join(', ')}) — verificare che il classificatore non abbia sovrastimato`,
    );
  }
  if (docRole === 'docs-as-source') {
    warnings.push(
      'riferimento a doc rilevato come docs-as-source (materiale di partenza, non oggetto della modifica)',
    );
  }
  if (explicitAgents.length === 1 && executor !== explicitAgents[0]) {
    warnings.push(
      `agente esplicito "${explicitAgents[0]}" citato nel task ma executor calcolato è "${executor}" (probabile override per risk high/deploy)`,
    );
  }
  if (explicitAgents.length > 1) {
    warnings.push(
      `più agenti espliciti citati nel task (${explicitAgents.join(', ')}): nessun override automatico, serve triage umano`,
    );
  }
  const hasDomainOnly =
    categories.some((c) => DOMAIN_ONLY_CATEGORIES.includes(c)) &&
    !categories.some((c) => ACTION_CATEGORIES.includes(c));
  if (hasDomainOnly) {
    warnings.push(
      'dominio protetto citato (tv/spotify/supabase) senza categoria di azione chiara — verificare intento del task',
    );
  }
  if (qaDomain === 'mixed') {
    warnings.push('dominio qa misto app+tooling: verificare a mano l\'executor nel ticket');
  }

  return warnings;
}

function computeConfidence(categories, warnings) {
  let level = categories.length === 0 ? 'low' : categories.length === 1 ? 'high' : 'medium';
  if (warnings.length > 0 && RISK_ORDER[level] > RISK_ORDER.medium) {
    level = 'medium';
  }
  return level;
}

function requiresApproval(categories, risk) {
  const readOnlyOnly =
    risk === 'low' &&
    categories.length > 0 &&
    categories.every((c) => ['research', 'product', 'docs', 'design'].includes(c));
  // Anche i run read-only passano da Gate 1 se producono file: default prudente.
  return readOnlyOnly ? 'yes (Gate 1 comunque, run atteso read-only)' : 'yes';
}

function buildScope(categories, profile, readOnlyOverride) {
  const has = (c) => categories.includes(c);
  const allowed = [];
  const forbidden = [
    '.env / .env.local / secrets (SECURITY_POLICY.md regola 6)',
    'package.json / package-lock.json / config deploy (CLAUDE.md §5)',
    'CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)',
    'Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)',
  ];
  const outOfScope = [];

  if (readOnlyOverride) {
    forbidden.unshift(
      'QUALSIASI modifica o scrittura di file: il task dichiara esplicitamente audit/read-only — nessun fix va applicato, anche se una keyword nel testo (es. "fix" in "non fare fix") suggerirebbe altrimenti (V1.6)',
    );
    outOfScope.push('qualsiasi implementazione o fix, anche minimo: questo run produce solo un report/audit');
  }

  if (has('research') || has('product') || has('docs') || has('checkpoint')) {
    allowed.push('ai-ops/ (ticket, report, knowledge)');
    allowed.push('docs/ solo se esplicitamente approvato nel plan');
    outOfScope.push(`codice app (${profile.code_dir})`);
  }
  if (has('coding') || has('coding-plan') || has('design')) {
    allowed.push(
      readOnlyOverride
        ? 'lettura repo (nessuna scrittura consentita): il task dichiara esplicitamente audit/read-only'
        : `SOLO i file ${profile.code_dir} elencati e approvati nel Plan (Gate 1) — preferire 1 file`,
    );
    outOfScope.push('refactor non richiesti, file non elencati nel Plan');
  }
  if (has('qa') || has('security')) {
    allowed.push('lettura repo + esecuzione test in scope dichiarato (run read-only)');
    allowed.push('report di verdetto in ai-ops/reports/ se richiesto');
    outOfScope.push('modifiche al codice di prodotto (i fix passano da un ticket separato)');
  }
  if (has('deploy')) {
    allowed.push('nessun file: il deploy è decisione manuale di Eros');
    outOfScope.push('qualsiasi comando di deploy automatico');
  }
  if (allowed.length === 0) {
    allowed.push('nessuno finché Eros non definisce lo scope nel Plan');
    outOfScope.push('tutto, in attesa di triage umano');
  }

  return { allowed, forbidden, outOfScope };
}

function buildQualityGate(categories, profile, readOnlyOverride) {
  const has = (c) => categories.includes(c);
  const checks = [];

  if (has('research') || has('product') || has('docs') || has('checkpoint') || categories.length === 0) {
    checks.push('git diff --stat ai-ops/   # run docs/ai-ops only');
    checks.push('git status --short ai-ops/   # include file nuovi non tracciati');
  }
  // V1.5-B: i check build/test non sono più hardcoded, vengono dal profilo
  // (profile.quality_gates) — spinti una sola volta anche se un task matcha
  // sia coding/design che qa/security, per evitare righe duplicate.
  if (has('coding') || has('coding-plan') || has('design') || has('qa') || has('security')) {
    for (const check of profile.quality_gates) {
      checks.push(check);
    }
  }
  if (has('coding') || has('coding-plan') || has('design')) {
    checks.push(
      readOnlyOverride
        ? `nessuna scrittura di file: git status deve restare pulito su ${profile.code_dir} (audit read-only, V1.6)`
        : 'git diff --stat   # verificare che compaiano SOLO i file approvati',
    );
  }
  if (has('qa') || has('security')) {
    checks.push(`nessuna scrittura su codice di prodotto: git status deve restare pulito su ${profile.code_dir}`);
  }
  if (has('deploy')) {
    checks.push('NESSUN comando automatico: checklist manuale di Eros prima di qualsiasi deploy');
  }
  return checks;
}

// V1.4-A: risolve il template del prompt Claude in base al prompt_mode.
// Cerca templates/prompts/claude_prompt_<mode>.md (dove <mode> è il
// promptMode senza il suffisso "_prompt"); se non esiste, fallback totale
// al template base claude_prompt_template.md — finché non esistono template
// per-modo (V1.4-B/C), l'output resta identico a V1.3. Stessi placeholder,
// renderTemplate invariato.
function resolvePromptTemplate(promptMode) {
  const mode = String(promptMode || '').replace(/_prompt$/, '');
  if (mode) {
    const candidate = path.join(PROMPTS_DIR, `claude_prompt_${mode}.md`);
    if (fs.existsSync(candidate)) {
      return { templatePath: candidate, templateLabel: mode };
    }
    // V1.6: "audit" non ha ancora un template dedicato — fallback a
    // phase_plan (stessa struttura "solo piano/audit, nessuna modifica"),
    // ma etichettato per non confonderlo con un vero phase_plan_prompt.
    if (mode === 'audit') {
      const phasePlanCandidate = path.join(PROMPTS_DIR, 'claude_prompt_phase_plan.md');
      if (fs.existsSync(phasePlanCandidate)) {
        return { templatePath: phasePlanCandidate, templateLabel: 'phase_plan (fallback audit)' };
      }
    }
  }
  return { templatePath: BASE_PROMPT_TEMPLATE, templateLabel: 'base (fallback)' };
}

function renderTemplate(templatePath, vars) {
  let out = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function bulletList(items, indent = '') {
  return items.map((i) => `${indent}- ${i}`).join('\n');
}

// Le righe estratte da CHECKPOINT.md hanno spesso già un "- " proprio (bullet
// markdown originali): le indentiamo senza aggiungerne un secondo.
function indentLines(items, indent = '') {
  return items.map((i) => `${indent}${i}`).join('\n');
}

// ---------------------------------------------------------------------------
// CHECKPOINT.md snapshot (read-only, parsing semplice, no dipendenze)
// ---------------------------------------------------------------------------

function extractMarkdownSections(content) {
  const headingRegex = /^##\s+(.+)$/;
  const sections = [];
  let current = null;
  for (const line of content.split('\n')) {
    const match = line.match(headingRegex);
    if (match) {
      current = { title: match[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections;
}

function findSectionByKeyword(sections, keyword) {
  const kw = keyword.toLowerCase();
  return sections.find((s) => s.title.toLowerCase().startsWith(kw));
}

function summarizeSection(section, maxLines = CHECKPOINT_SECTION_MAX_LINES) {
  if (!section) return ['(sezione non trovata in CHECKPOINT.md)'];
  const nonEmpty = section.body.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return ['(sezione vuota in CHECKPOINT.md)'];
  const truncated = nonEmpty.slice(0, maxLines);
  if (nonEmpty.length > maxLines) {
    truncated.push(`... (${nonEmpty.length - maxLines} righe omesse, vedi CHECKPOINT.md)`);
  }
  return truncated;
}

// Lettura read-only: nessuna scrittura, nessun crash se il file manca
// (SECURITY_POLICY.md regola 8 — CHECKPOINT.md mai modificato dal router).
function readCheckpointSnapshot() {
  let content;
  try {
    content = fs.readFileSync(CHECKPOINT_PATH, 'utf8');
  } catch {
    const notFound = ['CHECKPOINT.md not found'];
    return { stable: notFound, done: notFound, openIssues: notFound, nextStep: notFound };
  }
  const sections = extractMarkdownSections(content);
  return {
    stable: summarizeSection(findSectionByKeyword(sections, 'STABLE')),
    done: summarizeSection(findSectionByKeyword(sections, 'DONE')),
    openIssues: summarizeSection(findSectionByKeyword(sections, 'OPEN ISSUES')),
    nextStep: summarizeSection(findSectionByKeyword(sections, 'NEXT STEP')),
  };
}

function uniqueTicketPath(date, slug) {
  let candidate = path.join(TICKETS_DIR, `${date}_${slug}.md`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(TICKETS_DIR, `${date}_${slug}-${n}.md`);
    n += 1;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// CLI: parsing argomenti, help, exit code (V1.5-A)
// ---------------------------------------------------------------------------

const EXIT_OK = 0;
const EXIT_RUNTIME = 1;
const EXIT_USAGE = 2;

// Separa i flag conosciuti dal task raw. Tutto ciò che segue '--' è task
// verbatim. Un token che sembra un flag ('-...') ma non è riconosciuto fa
// fallire il run con exit code EXIT_USAGE, invece di finire silenziosamente
// concatenato nel task raw come accadeva fino a V1.4.1.
function parseArgs(argv) {
  const flags = { dryRun: false, showPrompt: false, json: false, help: false, project: undefined };
  const taskParts = [];
  let endOfFlags = false;
  for (const arg of argv) {
    if (!endOfFlags && arg === '--') {
      endOfFlags = true;
      continue;
    }
    if (!endOfFlags && arg.startsWith('-') && arg !== '-') {
      if (arg.startsWith('--project=')) {
        flags.project = arg.slice('--project='.length);
        continue;
      }
      switch (arg) {
        case '--dry-run': flags.dryRun = true; break;
        case '--show-prompt': flags.showPrompt = true; break;
        case '--json': flags.json = true; break;
        case '--help':
        case '-h': flags.help = true; break;
        default: {
          const err = new Error(`Flag sconosciuto: "${arg}"`);
          err.exitCode = EXIT_USAGE;
          throw err;
        }
      }
      continue;
    }
    taskParts.push(arg);
  }
  return { flags, rawTask: taskParts.join(' ').trim() };
}

// V1.5-B: carica il profilo di progetto da ai-ops/profiles/<name>.json.
// Default 'walbox' se --project non è specificato (retrocompatibile con
// V1.5-A). Se il nome è esplicito ma il file manca o il JSON è malformato,
// fallisce con EXIT_USAGE — MAI fallback silenzioso su walbox in quel caso,
// per non far girare un run con lo scope/quality-gate sbagliato senza che
// nessuno se ne accorga.
function loadProfile(name) {
  const explicit = Boolean(name);
  const projectName = name || DEFAULT_PROJECT;
  const profilePath = path.join(PROFILES_DIR, `${projectName}.json`);
  let raw;
  try {
    raw = fs.readFileSync(profilePath, 'utf8');
  } catch (err) {
    const e = new Error(`Profilo "${projectName}" non trovato: ${profilePath}`);
    e.exitCode = explicit ? EXIT_USAGE : EXIT_RUNTIME;
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const e = new Error(`Profilo "${projectName}" non è JSON valido: ${err.message}`);
    e.exitCode = EXIT_USAGE;
    throw e;
  }
}

const HELP_TEXT = `ai-factory-runner ${RUNNER_VERSION} — Walbox AI Business Factory

Genera un ticket/run log in ai-ops/tickets/ a partire da un task raw.
Classificazione locale per keyword: zero dipendenze, zero API, zero LLM.

USO:
  node ai-ops/runner/run.js "<task raw>" [opzioni]

OPZIONI:
  --dry-run        Classifica e stampa il riepilogo senza scrivere alcun ticket.
  --show-prompt    Stampa anche il prompt Claude Code generato (sezione 9 del ticket).
  --json           Output machine-readable su stdout (nessun riepilogo umano).
  --project=<nome> Profilo di progetto da ai-ops/profiles/<nome>.json (default: walbox).
                    Cambia solo scope/quality_gate/explicit_agents, non la
                    classificazione testuale (categorie/rischio/skill/prompt_mode
                    restano identici a prescindere dal profilo).
  --help, -h       Mostra questo aiuto ed esce.
  --               Fine dei flag: tutto ciò che segue è trattato come task raw.

ESEMPI:
  node ai-ops/runner/run.js "Verifica TV Poster sync"
  node ai-ops/runner/run.js "Verifica TV Poster sync" --dry-run
  node ai-ops/runner/run.js "Fixa il bug della coda" --dry-run --show-prompt
  node ai-ops/runner/run.js "Prepara piano V1.6" --dry-run --json
  node ai-ops/runner/run.js "Verifica golden set" --project=ai-factory --dry-run --json

EXIT CODE:
  0  ok
  1  errore a runtime (es. template mancante, scrittura ticket fallita)
  2  errore d'uso (flag sconosciuto, task mancante, o --project=<nome> con
     profilo mancante/malformato)
`;

function printHelp() {
  process.stdout.write(HELP_TEXT);
}

// Scansione leggera di argv per sapere se l'utente ha richiesto --json anche
// quando parseArgs fallisce prima di restituire i flag (es. flag sconosciuto):
// stessa regola di fine-flag di parseArgs ('--' interrompe la scansione), solo
// per decidere il formato dell'errore, non per validare argomenti.
function hasJsonIntent(argv) {
  for (const arg of argv) {
    if (arg === '--') return false;
    if (arg === '--json') return true;
  }
  return false;
}

// Errori in formato --json: stesso stream (stdout) e stessa forma del payload
// di successo, mai mischiato a testo umano. Vedi V1.5-A "JSON error path fix".
function emitJsonError(message, exitCode) {
  const payload = { version: RUNNER_VERSION, ok: false, error: message, exit_code: exitCode };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);

  let flags;
  let rawTask;
  try {
    ({ flags, rawTask } = parseArgs(argv));
  } catch (err) {
    const exitCode = err.exitCode || EXIT_USAGE;
    if (hasJsonIntent(argv)) {
      emitJsonError(err.message, exitCode);
    } else {
      console.error(err.message);
      console.error("Vedi 'node ai-ops/runner/run.js --help' per l'uso.");
    }
    return exitCode;
  }

  const dryRun = flags.dryRun;
  const showPrompt = flags.showPrompt;
  const json = flags.json;

  if (flags.help) {
    printHelp();
    return EXIT_OK;
  }

  if (!rawTask) {
    if (json) {
      emitJsonError('Nessun task fornito.', EXIT_USAGE);
    } else {
      console.error('Errore: nessun task fornito.');
      console.error('Uso: node ai-ops/runner/run.js "<task raw>" [--dry-run] [--show-prompt] [--json]');
      console.error("Vedi 'node ai-ops/runner/run.js --help' per i dettagli.");
    }
    return EXIT_USAGE;
  }

  let profile;
  try {
    profile = loadProfile(flags.project);
  } catch (err) {
    const exitCode = err.exitCode || EXIT_RUNTIME;
    if (json) {
      emitJsonError(err.message, exitCode);
    } else {
      console.error(err.message);
    }
    return exitCode;
  }

  try {
  const date = todayISO();
  const slug = slugify(rawTask);
  const { categories, matchedKeywords } = classify(rawTask);
  const docRole = detectDocRole(rawTask);
  if (docRole === 'docs-as-source') {
    const docsIdx = categories.indexOf('docs');
    if (docsIdx !== -1) {
      categories.splice(docsIdx, 1);
      delete matchedKeywords.docs;
    }
  }
  const { risk, reasons: riskReasons } = assessRisk(rawTask, categories);
  const explicitAgents = detectExplicitAgents(rawTask, profile);
  // V1.5-B: il profilo ai-factory forza il dominio qa a 'tooling' (un task
  // lanciato con questo profilo riguarda per definizione il runner stesso,
  // non l'app Walbox) — decisione presa con Eros, vedi
  // project_v15b_project_profiles.md. Per ogni altro profilo la detection
  // testuale di detectQaDomain() resta invariata.
  let qaDomain;
  if (profile.project === 'ai-factory') {
    qaDomain = 'tooling';
  } else {
    qaDomain = detectQaDomain(rawTask, categories);
  }
  const readOnlyOverride = detectReadOnlyOverride(rawTask);
  const { executor, why: routingWhy } = recommendExecutor(categories, risk, explicitAgents, docRole, qaDomain, readOnlyOverride);
  const warnings = buildWarnings({ categories, docRole, explicitAgents, executor, qaDomain, readOnlyOverride });
  const confidence = computeConfidence(categories, warnings);
  const {
    skill: recommendedSkill,
    promptMode,
    why: skillWhy,
  } = recommendSkillAndMode(categories, risk, docRole, confidence, rawTask);
  const approval = requiresApproval(categories, risk);
  const scope = buildScope(categories, profile, readOnlyOverride);
  const qualityGate = buildQualityGate(categories, profile, readOnlyOverride);
  const checkpointSnapshot = readCheckpointSnapshot();

  const categoriesLabel = categories.length > 0 ? categories.join(', ') : 'unclassified (triage umano)';
  const keywordsLabel =
    Object.entries(matchedKeywords)
      .map(([cat, kws]) => `${cat}: ${kws.join(', ')}`)
      .join(' · ') || 'nessuna keyword riconosciuta';

  const { templatePath: promptTemplatePath, templateLabel: promptTemplateLabel } =
    resolvePromptTemplate(promptMode);
  const claudePrompt = renderTemplate(promptTemplatePath, {
    RAW_TASK: rawTask,
    CATEGORIES: categoriesLabel,
    RISK: risk,
    SCOPE_ALLOWED: bulletList(scope.allowed),
    SCOPE_FORBIDDEN: bulletList(scope.forbidden),
    QUALITY_GATE: bulletList(qualityGate),
  });

  const warningsBlock = warnings.length > 0 ? `- Warnings:\n${bulletList(warnings, '  ')}` : '';
  const docRoleLine = docRole ? `- Doc role: ${docRole}` : '';

  const ticket = renderTemplate(path.join(TEMPLATES_DIR, 'ticket_template.md'), {
    TITLE: rawTask,
    RAW_TASK: rawTask,
    DATE: date,
    SLUG: slug,
    CATEGORIES: categoriesLabel,
    MATCHED_KEYWORDS: keywordsLabel,
    RISK: risk,
    RISK_REASONS: bulletList(riskReasons),
    EXECUTOR: executor,
    CONFIDENCE: confidence,
    RECOMMENDED_SKILL: recommendedSkill,
    PROMPT_MODE: promptMode,
    RECOMMENDED_SKILL_WHY: skillWhy,
    WARNINGS_BLOCK: warningsBlock,
    DOC_ROLE_LINE: docRoleLine,
    ROUTING_WHY: routingWhy,
    REQUIRES_APPROVAL: approval,
    SCOPE_ALLOWED: bulletList(scope.allowed),
    SCOPE_FORBIDDEN: bulletList(scope.forbidden),
    SCOPE_OUT: bulletList(scope.outOfScope),
    QUALITY_GATE: bulletList(qualityGate),
    CLAUDE_PROMPT: claudePrompt.trim(),
    CHECKPOINT_STABLE: indentLines(checkpointSnapshot.stable, '  '),
    CHECKPOINT_DONE: indentLines(checkpointSnapshot.done, '  '),
    CHECKPOINT_OPEN_ISSUES: indentLines(checkpointSnapshot.openIssues, '  '),
    CHECKPOINT_NEXT_STEP: indentLines(checkpointSnapshot.nextStep, '  '),
  });

  let relPath = null;
  if (!dryRun) {
    if (!fs.existsSync(TICKETS_DIR)) {
      fs.mkdirSync(TICKETS_DIR, { recursive: true });
    }
    const ticketPath = uniqueTicketPath(date, slug);
    fs.writeFileSync(ticketPath, ticket, 'utf8');
    relPath = path.relative(process.cwd(), ticketPath);
  }

  if (json) {
    const payload = {
      version: RUNNER_VERSION,
      project: profile.project,
      dry_run: dryRun,
      task: rawTask,
      date,
      slug,
      categories,
      matched_keywords: matchedKeywords,
      risk,
      risk_reasons: riskReasons,
      executor,
      routing_why: routingWhy,
      confidence,
      recommended_skill: recommendedSkill,
      prompt_mode: promptMode,
      prompt_template: promptTemplateLabel,
      skill_why: skillWhy,
      warnings,
      doc_role: docRole,
      qa_domain: qaDomain,
      read_only_override: readOnlyOverride,
      requires_approval: approval,
      scope,
      quality_gate: qualityGate,
      ticket_path: relPath,
      prompt: showPrompt ? claudePrompt.trim() : null,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return EXIT_OK;
  }

  console.log(
    dryRun
      ? `AI FACTORY RUNNER ${RUNNER_VERSION} — dry-run (nessun ticket scritto su disco)`
      : `AI FACTORY RUNNER ${RUNNER_VERSION} — ticket generato`,
  );
  if (profile.project !== DEFAULT_PROJECT) {
    console.log(`  Progetto:   ${profile.project}`);
  }
  console.log(`  Task:       ${rawTask}`);
  console.log(`  Categorie:  ${categoriesLabel}`);
  console.log(`  Rischio:    ${risk}`);
  console.log(`  Executor:   ${executor}`);
  console.log(`  Confidence: ${confidence}`);
  console.log(`  Recommended skill: ${recommendedSkill}`);
  console.log(`  Prompt mode:       ${promptMode}`);
  console.log(`  Prompt template:   ${promptTemplateLabel}`);
  console.log(`  Skill/mode reason: ${skillWhy}`);
  if (warnings.length > 0) {
    console.log(`  Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`    - ${w}`);
    }
  }
  if (docRole) {
    console.log(`  Doc role:   ${docRole}`);
  }
  if (!dryRun) {
    console.log(`  Ticket:     ${relPath}`);
  }
  if (showPrompt) {
    console.log('');
    console.log(`  --- Claude prompt (${promptTemplateLabel}) ---`);
    console.log(claudePrompt.trim());
  }

  return EXIT_OK;
  } catch (err) {
    if (json) {
      emitJsonError(err.message, EXIT_RUNTIME);
    } else {
      console.error(`Errore runner: ${err.message}`);
    }
    return EXIT_RUNTIME;
  }
}

// Ultimo fallback, non json-aware: copre solo errori inattesi al di fuori del
// try/catch interno di main() (es. bug in hasJsonIntent/parseArgs stesse),
// non un path testato dai quality gate --json.
try {
  process.exit(main());
} catch (err) {
  console.error(`Errore runner inatteso: ${err.message}`);
  process.exit(EXIT_RUNTIME);
}
