import { starterChoicesForCareer } from '../src/career/progression.js';
import { createCase02Game, performCase02Action, chooseCase02Reward } from '../src/case-02/engine-v2.js';
import { createCase03Game, performCase03Action, chooseCase03Reward } from '../src/case-03/engine.js';
import { createCase04Game, performCase04Action, chooseCase04Reward } from '../src/case-04/engine.js';

const preferences = {
  'case-02': ['C3', 'C6', 'C2', 'C4', 'C1', 'C5'],
  'case-03': ['C3', 'C6', 'C2', 'C1', 'C4', 'C5'],
  'case-04': ['C5', 'C3', 'C6', 'C2', 'C4', 'C1'],
};

function starter(caseId, seed, templateId) {
  const offered = starterChoicesForCareer(`qa-${caseId.slice(-2)}-${templateId}-${seed}`);
  return preferences[caseId].find((id) => offered.includes(id)) ?? offered[0];
}

function mistake(seed, tolerant) {
  if (!tolerant || seed % 10 < 7) return null;
  return ['first', 'second', 'third'][seed % 3];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

function summarize(rows) {
  const full = rows.filter((row) => row.category === 'verified');
  const limited = rows.filter((row) => row.category === 'limited');
  const failed = rows.filter((row) => row.category === 'failed');
  return {
    runs: rows.length,
    full: full.length,
    fullRate: full.length / rows.length,
    limited: limited.length,
    limitedRate: limited.length / rows.length,
    failed: failed.length,
    failedRate: failed.length / rows.length,
    medianRemainingFull: {
      token: median(full.map((row) => row.token)),
      time: median(full.map((row) => row.time)),
      stress: median(full.map((row) => row.stress)),
    },
  };
}

function run02(seed, templateId, tolerant, variant = 'standard') {
  const selected = starter('case-02', seed, templateId);
  let state = createCase02Game({ templateId, progressionV2: true, seed, cards: { [selected]: 1 }, equipped: [selected] });
  const m = templateId === 'ultimate' ? mistake(seed, tolerant) : null;
  let operation = 0;
  const act = (id, options = {}) => {
    const out = performCase02Action(state, id, { ...options, operationId: `b02-${seed}-${++operation}`, stateVersion: state.stateVersion });
    state = out.state;
    while (state.pendingReward) {
      const pick = ['C9', 'C12', 'C7', 'C4', 'C3', 'C1', 'C6'].find((id) => state.pendingReward.choices.includes(id)) ?? state.pendingReward.choices[0];
      state = chooseCase02Reward(state, pick).state;
    }
  };
  try {
    act('B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' });
    act('B02', { strategy: m === 'first' || (templateId === 'beginner' && variant === 'alternate') ? 'one' : 'solo' });
    act('B03');
    act('B04', { response: m === 'second' ? 'patch' : 'contract' });
    if (!state.contract?.clarity || state.integration?.unresolvedDebt || !state.change?.contractUpdated) {
      try { act('B05', { mode: 'repair' }); } catch { /* public recovery can be unavailable */ }
    }
    act('B07');
    act('B06', { scope: m === 'third' ? 'focused' : 'full' });
    if (m === 'third' && state.timeLeft >= 2 && state.token >= 3) act('B06', { scope: 'full' });
    const ready = state.contract?.clarity && state.integration?.unresolvedDebt === 0 && state.change?.contractUpdated
      && state.tests?.coverage >= 4 && !state.tests?.failed?.length && state.provenance;
    act('B09', { intent: ready ? 'verified' : 'limited' });
  } catch {
    try { if (state.phase === 'playing') act('B09', { intent: 'risk' }); } catch { /* terminal classification below */ }
  }
  const ending = state.ending?.baseId ?? 'NO-END';
  return { seed, templateId, starter: selected, mistake: m, ending, category: ending === 'C02-VERIFIED' ? 'verified' : ending === 'C02-LIMITED' ? 'limited' : 'failed', token: state.token, time: state.timeLeft, stress: state.stress };
}

function run03(seed, templateId, tolerant, variant = 'standard') {
  const selected = starter('case-03', seed, templateId);
  let state = createCase03Game({ templateId, progressionV2: true, seed, cards: { [selected]: 1 }, equipped: [selected] });
  const m = templateId === 'ultimate' ? mistake(seed, tolerant) : null;
  let operation = 0;
  const act = (id, options = {}) => {
    const out = performCase03Action(state, id, { ...options, operationId: `b03-${seed}-${++operation}`, stateVersion: state.stateVersion });
    state = out.state;
    while (state.pendingReward) {
      const pick = ['C9', 'C12', 'C11', 'C10', 'C7', 'C3', 'C2'].find((id) => state.pendingReward.choices.includes(id)) ?? state.pendingReward.choices[0];
      state = chooseCase03Reward(state, pick).state;
    }
  };
  try {
    act('C01', { scope: 'full' });
    if (!state.requirements?.clear && state.story?.openRecovery) try { act('C09', { route: 'prototype' }); } catch { /* optional */ }
    act('C02', { policy: 'explicit' });
    if (!state.contract?.approved && state.token >= 2 && state.timeLeft >= 1) act('C02', { policy: 'explicit' });
    if (!state.contract?.approved) act('C07', { intent: 'stop' });
    else {
      act('C03', { strategy: m === 'first' ? 'agent' : templateId === 'beginner' && variant === 'alternate' ? 'pair' : 'solo' });
      act('C04', { mergeMode: m === 'second' ? 'fast' : 'strict' });
      act('C05', { response: m === 'third' ? 'accept' : 'negotiate' });
      act('C06', { scope: 'full' });
      if ((state.integrationDebt || !state.change?.handled || state.evidence?.failed?.length) && state.token >= 3 && state.timeLeft >= 2) try { act('C08'); } catch { /* optional */ }
      if ((state.evidence?.revision !== state.artifactRevision || state.evidence?.failed?.length) && state.token >= 3 && state.timeLeft >= 2) try { act('C06', { scope: 'full' }); } catch { /* optional */ }
      const ready = state.requirements?.clear && state.contract?.approved && state.implementation?.complete && state.integrationDebt === 0
        && state.change?.handled && state.evidence?.revision === state.artifactRevision && state.evidence?.coverage >= 4
        && state.evidence?.trace && !state.evidence?.failed?.length;
      act('C07', { intent: ready ? 'verified' : 'limited' });
    }
  } catch {
    try { if (state.phase === 'playing') act('C07', { intent: 'stop' }); } catch { /* terminal classification below */ }
  }
  const ending = state.ending?.baseId ?? 'NO-END';
  return { seed, templateId, starter: selected, mistake: m, ending, category: ending === 'C03-VERIFIED' ? 'verified' : ending === 'C03-LIMITED' ? 'limited' : 'failed', token: state.token, time: state.timeLeft, stress: state.stress };
}

function run04(seed, templateId, tolerant, variant = 'standard') {
  const selected = starter('case-04', seed, templateId);
  let state = createCase04Game({ templateId, seed, cards: { [selected]: 1 }, equipped: [selected] });
  const m = templateId === 'ultimate' ? mistake(seed, tolerant) : null;
  let operation = 0;
  const act = (id, options = {}) => {
    const out = performCase04Action(state, id, { ...options, operationId: `b04-${seed}-${++operation}`, stateVersion: state.stateVersion });
    state = out.state;
    while (state.pendingReward) {
      const pick = ['C7', 'C3', 'C6', 'C2', 'C4', 'C9', 'C12', 'C1'].find((id) => state.pendingReward.choices.includes(id)) ?? state.pendingReward.choices[0];
      state = chooseCase04Reward(state, pick).state;
    }
    return out.result;
  };
  const stop = () => { try { if (state.phase === 'playing') act('D09', { intent: 'stop' }); } catch { /* classified below */ } };
  try {
    act('D01', { method: templateId === 'beginner' && variant === 'alternate' ? 'reproduce' : 'logs' });
    act('D02', { strategy: 'investigate' });
    if (state.lastAttempt?.outcome !== 'success') stop();
    else {
      act('D03', { agentMode: m === 'first' ? 'parallel' : 'sequential' });
      if (state.lastAttempt?.outcome !== 'success') stop();
      else {
        act('D04', { route: m === 'second' ? 'improve' : selected === 'C5' ? 'pace' : 'freeze' });
        act('D05', { cause: 'code' });
        if (state.lastAttempt?.outcome !== 'success') stop();
        else {
          act('D07', { scope: m === 'third' ? 'focused' : 'full' });
          if (state.lastAttempt?.outcome !== 'success') stop();
          else {
            if (m === 'third') act('D07', { scope: 'full' });
            if (state.phase === 'playing') act('D06', { response: 'repair' });
            if (state.phase === 'playing') act('D07', { scope: 'full' });
            if (state.phase === 'playing') act('D08', { depth: 'complete' });
            if (state.phase === 'playing') {
              act('D11', { proposal: 'verified' });
              if (state.approval?.status === 'approved') act('D09', { intent: 'verified' }); else stop();
            }
          }
        }
      }
    }
  } catch { stop(); }
  const ending = state.ending?.baseId ?? 'NO-END';
  return { seed, templateId, starter: selected, mistake: m, ending, category: ending === 'C04-VERIFIED' ? 'verified' : ending === 'C04-LIMITED' ? 'limited' : 'failed', token: state.token, time: state.timeLeft, stress: state.stress };
}

export function runCareerBalance({ start = 1, count = 200 } = {}) {
  const runners = { case02: run02, case03: run03, case04: run04 };
  const summary = {};
  const rows = {};
  for (const [caseId, runner] of Object.entries(runners)) {
    rows[caseId] = [];
    summary[caseId] = {};
    for (const [label, templateId, tolerant, variant] of [['ultimateTolerant', 'ultimate', true, 'standard'], ['ultimateStrict', 'ultimate', false, 'standard'], ['beginner', 'beginner', false, 'standard'], ['beginnerAlternate', 'beginner', false, 'alternate']]) {
      const cohort = Array.from({ length: count }, (_, index) => runner(start + index, templateId, tolerant, variant));
      rows[caseId].push(...cohort.map((row) => ({ ...row, policy: label })));
      summary[caseId][label] = summarize(cohort);
    }
  }
  return { method: { start, count }, summary, rows };
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  const start = Number(process.argv[2] ?? 1);
  const count = Number(process.argv[3] ?? 200);
  console.log(JSON.stringify(runCareerBalance({ start, count }).summary, null, 2));
}
