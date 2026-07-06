#!/usr/bin/env node
'use strict';

/**
 * ai-factory-runner V1.3 — Walbox AI Business Factory
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
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Il repo ha "type": "module" in package.json: questo file è ESM.
const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));
const AI_OPS_DIR = path.resolve(RUNNER_DIR, '..');
const REPO_ROOT = path.resolve(AI_OPS_DIR, '..');
const TICKETS_DIR = path.join(AI_OPS_DIR, 'tickets');
const TEMPLATES_DIR = path.join(RUNNER_DIR, 'templates');
const PROMPTS_DIR = path.join(TEMPLATES_DIR, 'prompts');
const BASE_PROMPT_TEMPLATE = path.join(TEMPLATES_DIR, 'claude_prompt_template.md');
const CHECKPOINT_PATH = path.join(REPO_ROOT, 'CHECKPOINT.md');
const CHECKPOINT_SECTION_MAX_LINES = 6;

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
// high/deploy). Lista sincronizzata a mano con CLAUDE.md §2.
const EXPLICIT_AGENTS = [
  'walbox-dev', 'walbox-qa-serata', 'walbox-hardening', 'walbox-product-owner',
];

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
function detectExplicitAgents(rawTask) {
  const text = normalize(rawTask);
  return EXPLICIT_AGENTS.filter((agent) => matchesKeyword(text, agent));
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

function recommendExecutor(categories, risk, explicitAgents, docRole) {
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
    return {
      executor: 'walbox-dev',
      why: 'Task di implementazione/piano/visual sul repo → agente walbox-dev (o Antigravity se visual-browser, vedi CLAUDE.md §2), sempre dopo Gate 1. Vince su qa quando entrambe le categorie sono presenti nello stesso task (V1.2-F).',
    };
  }
  if (has('qa')) {
    return {
      executor: 'walbox-qa-serata',
      why: 'Task di verifica/collaudo → agente walbox-qa-serata, vedi CLAUDE.md §2. Si applica solo se non è presente anche coding/coding-plan/design, che vince (V1.2-F).',
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
function buildWarnings({ categories, docRole, explicitAgents, executor }) {
  const warnings = [];

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

function buildScope(categories) {
  const has = (c) => categories.includes(c);
  const allowed = [];
  const forbidden = [
    '.env / .env.local / secrets (SECURITY_POLICY.md regola 6)',
    'package.json / package-lock.json / config deploy (CLAUDE.md §5)',
    'CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)',
    'Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)',
  ];
  const outOfScope = [];

  if (has('research') || has('product') || has('docs') || has('checkpoint')) {
    allowed.push('ai-ops/ (ticket, report, knowledge)');
    allowed.push('docs/ solo se esplicitamente approvato nel plan');
    outOfScope.push('codice app (src/)');
  }
  if (has('coding') || has('coding-plan') || has('design')) {
    allowed.push('SOLO i file src/ elencati e approvati nel Plan (Gate 1) — preferire 1 file');
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

function buildQualityGate(categories) {
  const has = (c) => categories.includes(c);
  const checks = [];

  if (has('research') || has('product') || has('docs') || has('checkpoint') || categories.length === 0) {
    checks.push('git diff --stat ai-ops/   # run docs/ai-ops only');
    checks.push('git status --short ai-ops/   # include file nuovi non tracciati');
  }
  if (has('coding') || has('coding-plan') || has('design')) {
    checks.push('npm run build   # solo se il run tocca davvero codice app');
    checks.push('git diff --stat   # verificare che compaiano SOLO i file approvati');
  }
  if (has('qa') || has('security')) {
    checks.push('test pertinenti con scope dichiarato (es. npx playwright test <spec in scope>)');
    checks.push('nessuna scrittura su codice di prodotto: git status deve restare pulito su src/');
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
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const rawTask = argv.filter((a) => a !== '--dry-run').join(' ').trim();

  if (!rawTask) {
    console.error('Uso: node ai-ops/runner/run.js "<task raw>" [--dry-run]');
    console.error('Esempio: node ai-ops/runner/run.js "Verifica TV Poster sync" --dry-run');
    process.exit(1);
  }

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
  const explicitAgents = detectExplicitAgents(rawTask);
  const { executor, why: routingWhy } = recommendExecutor(categories, risk, explicitAgents, docRole);
  const warnings = buildWarnings({ categories, docRole, explicitAgents, executor });
  const confidence = computeConfidence(categories, warnings);
  const {
    skill: recommendedSkill,
    promptMode,
    why: skillWhy,
  } = recommendSkillAndMode(categories, risk, docRole, confidence, rawTask);
  const approval = requiresApproval(categories, risk);
  const scope = buildScope(categories);
  const qualityGate = buildQualityGate(categories);
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

  console.log(
    dryRun
      ? 'AI FACTORY RUNNER V1.3 — dry-run (nessun ticket scritto su disco)'
      : 'AI FACTORY RUNNER V1.3 — ticket generato',
  );
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
    console.log(`  Warnings:   ${warnings.length}`);
  }
  if (docRole) {
    console.log(`  Doc role:   ${docRole}`);
  }
  if (!dryRun) {
    console.log(`  Ticket:     ${relPath}`);
  }
}

main();
