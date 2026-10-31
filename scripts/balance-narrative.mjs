import {
  chooseUpgrade,
  createNarrativeGame,
  openingChoices,
  performAction,
  previewAction,
  rest,
} from '../src/narrative/engine.js';
import { LIMITS, TEMPLATES } from '../src/narrative/rules.js';
import { projectNarrativeView } from '../src/narrative/view.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const COMPLETED = new Set(['E01', 'E02', 'E03', 'E04', 'E06']);
const POLICIES = ['clarify-first', 'prototype-first'];
const SEEDS = Array.from({ length: 200 }, (_, index) => `balance-${String(index).padStart(3, '0')}`);

const cardPreference = {
  'clarify-first': ['C6', 'C1', 'C3', 'C4', 'C5', 'C2'],
  'prototype-first': ['C2', 'C5', 'C6', 'C4', 'C3', 'C1'],
};

function hasAction(view, id) {
  return [...view.primaryActions, ...view.secondaryActions].some((action) => action.id === id && action.canStart);
}

function toolLevel(view, id) {
  return view.tools.find((tool) => tool.id === id)?.level ?? 0;
}

function chooseCard(state, policy, rewardWorkCounts) {
  const view = projectNarrativeView(state);
  const choices = view.pendingUpgrade.choices;
  const picked = cardPreference[policy].find((id) => choices.includes(id)) ?? choices[0];
  rewardWorkCounts.push(state.workCount);
  return chooseUpgrade(state, picked);
}

function checkStatus(view, label) {
  return view.progress.checks.find((check) => check.label === label)?.status;
}

function needsAny(view, labels) {
  return labels.some((label) => checkStatus(view, label) !== '已驗證');
}

export function createPolicyMemory() {
  return {
    actionCounts: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`A${String(index + 1).padStart(2, '0')}`, 0])),
    targetCounts: { core: 0, persistence: 0, delete: 0 },
    requirementAttempts: 0,
    prototypeAttempted: false,
    prototypeQuestioned: false,
  };
}

// This policy is intentionally limited to projectNarrativeView plus its own
// action history.  It never reads functionState, evidence internals, artifact
// kind, hidden issues, event IDs, or RNG values.
export function decidePublicAction(view, policy, memory) {
  if (view.progress.delivery.formal === '已滿足正式交付條件') return ['A12', { intent: 'formal' }];
  if (view.knownIssues.length && hasAction(view, 'A11')) return ['A11', { mode: 'fix', repairDraft: memory.actionCounts.A11 > 0 }];

  if (policy === 'prototype-first' && hasAction(view, 'A05') && !memory.prototypeAttempted) {
    return ['A05', { useC2: toolLevel(view, 'C2') > 0 }];
  }
  if (policy === 'prototype-first' && hasAction(view, 'A06') && !memory.prototypeQuestioned) return ['A06', {}];
  if (hasAction(view, 'A01') && memory.requirementAttempts < (policy === 'clarify-first' ? 3 : 2)) return ['A01', {}];
  if (hasAction(view, 'A04') && memory.actionCounts.A04 < 2) {
    return ['A04', { repairDraft: memory.actionCounts.A04 > 0 }];
  }
  if (hasAction(view, 'A05') && !memory.prototypeAttempted) return ['A05', { useC2: toolLevel(view, 'C2') > 0 && policy === 'prototype-first' }];

  const coreLabels = ['新增項目', '完成與未完成切換', '單筆刪除正確'];
  const persistenceLabels = ['重新整理後保留', '關閉再開後保留'];
  if (hasAction(view, 'A07') && memory.targetCounts.core === 0) {
    return ['A07', { target: 'core', useC2: toolLevel(view, 'C2') > 0 && policy === 'prototype-first', checkDelete: policy === 'clarify-first' }];
  }
  if (hasAction(view, 'A07') && memory.targetCounts.persistence === 0) {
    return ['A07', { target: 'persistence', useC2: toolLevel(view, 'C2') > 0 && policy === 'prototype-first', checkDelete: policy === 'clarify-first' }];
  }
  if (hasAction(view, 'A09') && memory.actionCounts.A09 === 0) return ['A09', { useC3: toolLevel(view, 'C3') > 0 }];
  if (hasAction(view, 'A08')) return ['A08', { useC3: toolLevel(view, 'C3') > 0 }];
  if (hasAction(view, 'A09') && memory.actionCounts.A09 < 2 && (needsAny(view, coreLabels) || needsAny(view, persistenceLabels))) {
    return ['A09', { useC3: toolLevel(view, 'C3') > 0 }];
  }
  if (hasAction(view, 'A03')) return ['A03', {}];
  if (hasAction(view, 'A06') && memory.actionCounts.A06 < 2) return ['A06', { newRevision: memory.actionCounts.A06 > 0 }];
  if (hasAction(view, 'A02') && memory.actionCounts.A02 < 2) return ['A02', {}];
  return ['A12', { intent: fallbackIntent(view) }];
}

export function fallbackIntent(view) {
  if (view.canLimitedTrial) return 'limited';
  if (view.progress.artifactText.startsWith('可展示原型')) return 'showcase';
  if (view.resources.time === 0) return 'progress';
  return 'stop';
}

function recordAction(memory, actionId, options) {
  memory.actionCounts[actionId] += 1;
  if (actionId === 'A01') memory.requirementAttempts += 1;
  if (actionId === 'A05') memory.prototypeAttempted = true;
  if (actionId === 'A06') memory.prototypeQuestioned = true;
  if (actionId === 'A07') memory.targetCounts[options.target ?? 'persistence'] += 1;
}

export function simulate(seed, templateId, policy) {
  const draw = openingChoices(seed);
  const openingCard = cardPreference[policy].find((id) => draw.includes(id)) ?? draw[0];
  let state = createNarrativeGame({ seed, templateId, selectedCards: [openingCard] });
  const memory = createPolicyMemory();
  const rewardWorkCounts = [];
  let operation = 0;
  let stalled = 0;
  const actionLog = [];

  while (state.phase === 'playing' && operation < 60) {
    while (state.pendingUpgrades.length) state = chooseCard(state, policy, rewardWorkCounts);
    const view = projectNarrativeView(state);
    if (state.workCount >= LIMITS.hardWork || (view.resources.time === 0 && view.resources.overtime >= 2)) {
      state = performAction(state, 'A12', { operationId: `${seed}-${policy}-${++operation}`, stateVersion: state.stateVersion, intent: fallbackIntent(view) }).state;
      if (state.phase === 'playing') state = performAction(state, 'A12', { operationId: `${seed}-${policy}-cap-stop-${++operation}`, stateVersion: state.stateVersion, intent: 'stop' }).state;
      break;
    }
    const [actionId, options] = decidePublicAction(view, policy, memory);
    const preview = previewAction(state, actionId, options);
    if (actionId !== 'A12' && !preview.cached && view.resources.token < preview.cost) {
      const restCost = view.resources.time === 0 ? 1 : 0;
      if (view.resources.token >= restCost && view.canRest) {
        actionLog.push({ type: 'rest' });
        state = rest(state, { operationId: `${seed}-${policy}-rest-${++operation}`, stateVersion: state.stateVersion }).state;
        continue;
      }
      state = performAction(state, 'A12', { operationId: `${seed}-${policy}-funds-${++operation}`, stateVersion: state.stateVersion, intent: fallbackIntent(view) }).state;
      if (state.phase === 'playing') state = performAction(state, 'A12', { operationId: `${seed}-${policy}-funds-stop-${++operation}`, stateVersion: state.stateVersion, intent: 'stop' }).state;
      continue;
    }
    const beforeVersion = state.stateVersion;
    actionLog.push({ type: 'action', actionId, options: structuredClone(options) });
    const out = performAction(state, actionId, { ...options, operationId: `${seed}-${policy}-${++operation}`, stateVersion: state.stateVersion });
    state = out.state;
    recordAction(memory, actionId, options);
    if (state.phase !== 'playing') break;
    stalled = state.stateVersion === beforeVersion ? stalled + 1 : 0;
    if (stalled >= 2) {
      const currentView = projectNarrativeView(state);
      state = performAction(state, 'A12', { operationId: `${seed}-${policy}-stalled-${++operation}`, stateVersion: state.stateVersion, intent: fallbackIntent(currentView) }).state;
      if (state.phase === 'playing') state = performAction(state, 'A12', { operationId: `${seed}-${policy}-stalled-stop-${++operation}`, stateVersion: state.stateVersion, intent: 'stop' }).state;
      break;
    }
  }
  while (state.phase === 'playing' && state.pendingUpgrades.length) state = chooseCard(state, policy, rewardWorkCounts);
  if (state.phase === 'playing') {
    const view = projectNarrativeView(state);
    state = performAction(state, 'A12', { operationId: `${seed}-${policy}-final`, stateVersion: state.stateVersion, intent: fallbackIntent(view) }).state;
    if (state.phase === 'playing') state = performAction(state, 'A12', { operationId: `${seed}-${policy}-stop`, stateVersion: state.stateVersion, intent: 'stop' }).state;
  }
  return {
    seed, templateId, policy,
    ending: state.ending?.id ?? null,
    completed: COMPLETED.has(state.ending?.id),
    perfect: state.ending?.id === 'E01',
    workCount: state.workCount,
    xp: state.xp,
    distinctCards: state.equipped.length,
    cardLevels: structuredClone(state.cards),
    selections: 1 + state.claimedThresholds.length,
    rewardWorkCounts,
    phase: state.phase,
    claimedThresholds: [...state.claimedThresholds],
    pendingUpgrades: [...state.pendingUpgrades],
    actionLog,
  };
}

export function runCohort() {
  const rows = [];
  for (const templateId of Object.keys(TEMPLATES)) {
    for (const policy of POLICIES) {
      for (const seed of SEEDS) rows.push(simulate(seed, templateId, policy));
    }
  }
  const summary = {};
  for (const templateId of Object.keys(TEMPLATES)) {
    summary[templateId] = {};
    for (const policy of [...POLICIES, 'combined']) {
      const subset = rows.filter((row) => row.templateId === templateId && (policy === 'combined' || row.policy === policy));
      summary[templateId][policy] = {
        runs: subset.length,
        completed: subset.filter((row) => row.completed).length,
        completionRate: subset.filter((row) => row.completed).length / subset.length,
        perfect: subset.filter((row) => row.perfect).length,
        perfectRate: subset.filter((row) => row.perfect).length / subset.length,
        threeSelectionRuns: subset.filter((row) => row.selections === 3).length,
        successfulSeeds: subset.filter((row) => row.completed).slice(0, 5).map((row) => `${row.seed}/${row.policy}`),
      };
    }
  }
  return {
    cohort: { seeds: SEEDS.length, policies: POLICIES },
    policyEvidence: 'Decisions use projectNarrativeView fields and the policy own action history only; hidden engine truth is not available to decidePublicAction.',
    summary,
    rows,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runCohort();
  const outputIndex = process.argv.indexOf('--out');
  if (outputIndex >= 0) {
    const output = path.resolve(process.argv[outputIndex + 1]);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${report.rows.length} public-policy balance rows to ${output}`);
  } else {
    console.log(JSON.stringify({ cohort: report.cohort, policyEvidence: report.policyEvidence, summary: report.summary }, null, 2));
  }
}
