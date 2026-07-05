#!/usr/bin/env node
'use strict';

/**
 * ai-factory-runner V1.1 — Walbox AI Business Factory
 *
 * Genera un ticket/run log in ai-ops/tickets/ a partire da un task raw.
 * Locale, zero dipendenze esterne, nessuna API, nessun LLM.
 *
 * Uso:
 *   node ai-ops/runner/run.js "Verifica TV Poster sync"
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
    'strategia', 'sprint', 'backlog', 'vision', 'pricing',
  ],
  coding: [
    'fix', 'fixa', 'bug', 'implementa', 'codice', 'refactor', 'hook',
    'componente', 'feature', 'funzione', 'errore', 'crash', 'code',
  ],
  qa: [
    'verifica', 'verificare', 'test', 'testa', 'qa', 'stabile', 'controlla',
    'collauda', 'e2e', 'regressione', 'smoke', 'sync', 'stress',
  ],
  design: [
    'visual', 'layout', 'ui', 'poster', 'design', 'grafica', 'stile',
    'css', 'estetica', 'tv', 'schermo', 'mobile',
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

const RISK_BY_CATEGORY = {
  research: 'low',
  product: 'low',
  design: 'low',
  docs: 'low',
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

function classify(rawTask) {
  const text = normalize(rawTask);
  const categories = [];
  const matchedKeywords = {};

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    const hits = keywords.filter((kw) => matchesKeyword(text, kw));
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
    risk = 'high';
    reasons.push(`keyword area protetta: ${protectedHits.join(', ')} (CLAUDE.md §5)`);
  }

  if (categories.length === 0) {
    risk = RISK_ORDER[risk] > RISK_ORDER.medium ? risk : 'medium';
    reasons.push('nessuna categoria riconosciuta → rischio minimo medium, richiede revisione umana');
  }

  return { risk, reasons };
}

function recommendExecutor(categories, risk) {
  const has = (c) => categories.includes(c);

  if (risk === 'high' || has('deploy')) {
    return {
      executor: 'manual approval required',
      why: 'Rischio high o deploy: nessun esecutore automatico. Eros decide come e se procedere (SECURITY_POLICY.md regole 3, 4, 5, 6).',
    };
  }
  if (has('security')) {
    return {
      executor: 'Claude QA/hardening',
      why: 'Task di sicurezza → agente walbox-hardening (read-only), vedi CLAUDE.md §2.',
    };
  }
  if (has('qa')) {
    return {
      executor: 'Claude QA/hardening',
      why: 'Task di verifica/collaudo → agente walbox-qa-serata o QA read-only, vedi CLAUDE.md §2.',
    };
  }
  if (has('coding') || has('design')) {
    return {
      executor: 'Claude Code execution',
      why: 'Task di implementazione/visual sul repo → Claude Code (o Antigravity se visual-browser, vedi CLAUDE.md §2), sempre dopo Gate 1.',
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

  if (has('research') || has('product') || has('docs')) {
    allowed.push('ai-ops/ (ticket, report, knowledge)');
    allowed.push('docs/ solo se esplicitamente approvato nel plan');
    outOfScope.push('codice app (src/)');
  }
  if (has('coding') || has('design')) {
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

  if (has('research') || has('product') || has('docs') || categories.length === 0) {
    checks.push('git diff --stat ai-ops/   # run docs/ai-ops only');
    checks.push('git status --short ai-ops/   # include file nuovi non tracciati');
  }
  if (has('coding') || has('design')) {
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
  const rawTask = process.argv.slice(2).join(' ').trim();

  if (!rawTask) {
    console.error('Uso: node ai-ops/runner/run.js "<task raw>"');
    console.error('Esempio: node ai-ops/runner/run.js "Verifica TV Poster sync"');
    process.exit(1);
  }

  const date = todayISO();
  const slug = slugify(rawTask);
  const { categories, matchedKeywords } = classify(rawTask);
  const { risk, reasons: riskReasons } = assessRisk(rawTask, categories);
  const { executor, why: routingWhy } = recommendExecutor(categories, risk);
  const approval = requiresApproval(categories, risk);
  const scope = buildScope(categories);
  const qualityGate = buildQualityGate(categories);
  const checkpointSnapshot = readCheckpointSnapshot();

  const categoriesLabel = categories.length > 0 ? categories.join(', ') : 'unclassified (triage umano)';
  const keywordsLabel =
    Object.entries(matchedKeywords)
      .map(([cat, kws]) => `${cat}: ${kws.join(', ')}`)
      .join(' · ') || 'nessuna keyword riconosciuta';

  const claudePrompt = renderTemplate(path.join(TEMPLATES_DIR, 'claude_prompt_template.md'), {
    RAW_TASK: rawTask,
    CATEGORIES: categoriesLabel,
    RISK: risk,
    SCOPE_ALLOWED: bulletList(scope.allowed),
    SCOPE_FORBIDDEN: bulletList(scope.forbidden),
    QUALITY_GATE: bulletList(qualityGate),
  });

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

  if (!fs.existsSync(TICKETS_DIR)) {
    fs.mkdirSync(TICKETS_DIR, { recursive: true });
  }

  const ticketPath = uniqueTicketPath(date, slug);
  fs.writeFileSync(ticketPath, ticket, 'utf8');

  const relPath = path.relative(process.cwd(), ticketPath);
  console.log('AI FACTORY RUNNER V1 — ticket generato');
  console.log(`  Task:       ${rawTask}`);
  console.log(`  Categorie:  ${categoriesLabel}`);
  console.log(`  Rischio:    ${risk}`);
  console.log(`  Executor:   ${executor}`);
  console.log(`  Ticket:     ${relPath}`);
}

main();
