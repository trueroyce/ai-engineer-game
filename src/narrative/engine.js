import { ACTIONS, CARDS, CASE01_CARD_IDS, LIMITS, RULE_VERSION, TEMPLATES, assertAttributes, cardLevel } from './rules.js';
import { ENDINGS, EVENTS } from './content.js';
import { unitFor, weightedPick } from './rng.js';
import { buildProcess } from './process-story.js';
import { case01StoryChoices, normalizeCase01Story, observeCase01Story, performCase01StoryAction, previewCase01StoryAction } from './story.js';

const BASE = Object.freeze({
  A01: [40, 25, 20, 15], A02: [55, 25, 20], A03: [50, 25, 25], A04: [55, 25, 20],
  A05: [55, 25, 20], A06: [55, 25, 20], A07: [55, 25, 20], A10: [55, 25, 20], A11: [55, 25, 20],
});

const clone = (v) => structuredClone(v);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const usesCase01Story = (state) => state.ruleVersion === RULE_VERSION;

function initialTruth() {
  return { R1: 'not_implemented', R2: 'not_implemented', R3: 'not_implemented', R4: 'not_implemented', R5: 'not_implemented', R6: 'correct' };
}

function draw(seed, key, ids, count) {
  // Efraimidis-Spirakis style deterministic weighted ordering.  All current cards
  // are common/equal weight; metadata keeps later rare cards extensible without
  // hard-coding a fixed offer.
  return [...ids].sort((a, b) => {
    const score = (id) => -Math.log(Math.max(Number.EPSILON, unitFor(seed, `${key}:${id}`))) / (CARDS[id].drawWeight ?? 1);
    return score(a) - score(b);
  }).slice(0, count);
}

export function createNarrativeGame({ seed = `case-${Date.now()}`, templateId = 'balanced', attrs, selectedCards, careerCards, careerEquipped, skipOpeningReward = false } = {}) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error('未知模板');
  const abilities = attrs ?? template.attrs;
  assertAttributes(abilities);
  const careerMode = careerCards !== undefined || careerEquipped !== undefined;
  const openingDraw = openingChoices(seed, careerMode ? careerCards : undefined);
  const picked = selectedCards?.length ? selectedCards : openingDraw.slice(0, 1);
  if (picked.length !== 1 || picked.some((id) => !openingDraw.includes(id))) throw new Error('必須從開局三張卡選一張');
  let cards;
  let equipped;
  if (careerMode) {
    if (!careerCards || typeof careerCards !== 'object' || Array.isArray(careerCards)) throw new Error('職涯卡庫格式不合法');
    cards = {};
    for (const [id, level] of Object.entries(careerCards)) {
      if (!CARDS[id] || !Number.isInteger(level) || level < 1 || level > CARDS[id].maxLevel) throw new Error('職涯卡庫格式不合法');
      cards[id] = level;
    }
    equipped = [...new Set(careerEquipped ?? [])].filter((id) => CASE01_CARD_IDS.includes(id));
    if (equipped.length > 3 || equipped.some((id) => !cards[id])) throw new Error('職涯啟用卡格式不合法');
    const rewardId = picked[0];
    if (!skipOpeningReward) {
      cards[rewardId] = Math.min(CARDS[rewardId].maxLevel, (cards[rewardId] ?? 0) + 1);
      if (!equipped.includes(rewardId) && equipped.length < 3) equipped.push(rewardId);
    }
  } else {
    equipped = [...picked];
    cards = Object.fromEntries(equipped.map((id) => [id, 1]));
  }
  return {
    ruleVersion: RULE_VERSION,
    caseId: 'case-01', seed, phase: 'playing', stateVersion: 0,
    templateId, abilities: clone(abilities), openingDraw, equipped: [...equipped], cards,
    careerEquippedSnapshot: careerMode ? [...new Set(careerEquipped ?? [])] : null,
    careerCardsSnapshot: careerMode ? clone(careerCards) : null,
    token: LIMITS.token, stress: 0, timeLeft: LIMITS.deadline, workCount: 0, overtimeUsed: 0,
    requirement: { clarity: 'unknown', pendingQuestions: ['完成後怎麼處理？', '刪除哪一條？', '明天還要用如何驗收？'], scope: 'bounded' },
    documents: { draft: false, confirmed: false, wrongCompletionRule: false, summaryRevision: 0 },
    artifact: { kind: null, revision: 0, visualDetour: false, assumptions: [], affectedRequirements: [] },
    functionState: initialTruth(), evidence: {}, knownIssues: [], reviews: [], historyTags: [],
    context: { factsSaved: false, sessionLabel: null, jobsSinceSummary: 0, summaryRevision: 0 },
    revisions: Object.fromEntries(Object.keys(ACTIONS).map((id) => [id, 1])), answerRevision: 0,
    applicationRevisions: Object.fromEntries(Object.keys(ACTIONS).map((id) => [id, 0])),
    eventDecisions: {}, resolved: {}, resolvedKeyByAction: {}, lastOptionsByAction: {}, operationResults: {}, operationPayloads: {}, ledger: [], xp: 0, pendingUpgrades: [], claimedThresholds: [], careerRewards: [], rewardClaims: [],
    analysisPrep: 0, firstVerifyUsed: false, extraWishSeen: false, scopeNegotiated: false,
    repairHistory: false, rollbackAvailable: false, checkpoint: null, lastEvent: null, eventCounts: {}, retryUnderstanding: {}, retryCounts: {}, cardUsage: {}, log: [], ending: null,
    story: normalizeCase01Story(),
  };
}

export function openingChoices(seed = 'preview', cardLevels) {
  // Direct classic play keeps the original six-card draw. Career runs can
  // collect the shared Case 01 cards without silently changing v1 behavior.
  const ids = cardLevels ? [...CASE01_CARD_IDS] : ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  if (!cardLevels) return draw(seed, 'opening-cards', ids, 3);
  const useful = ids.filter((id) => (cardLevels[id] ?? 0) < CARDS[id].maxLevel);
  const usefulDraw = draw(seed, 'opening-cards', useful, Math.min(3, useful.length));
  if (usefulDraw.length === 3) return usefulDraw;
  const filler = draw(seed, 'opening-cards:filler', ids.filter((id) => !usefulDraw.includes(id)), 3 - usefulDraw.length);
  return [...usefulDraw, ...filler];
}

function milestone(state, id, value = 1) {
  if (state.ledger.includes(id)) return;
  state.ledger.push(id);
  state.xp += value;
  if (state.phase !== 'playing') return;
  const thresholds = state.careerCardsSnapshot ? [2, 4] : LIMITS.cardRewardThresholds;
  for (const threshold of thresholds) {
    if (state.xp >= threshold && !state.claimedThresholds.includes(threshold) && !state.pendingUpgrades.includes(threshold)) {
      state.pendingUpgrades.push(threshold);
    }
  }
}

function awardImplementationMilestones(state) {
  if (['R1', 'R2', 'R3'].every((id) => state.functionState[id] === 'correct')) milestone(state, 'working_core');
  if (['R4', 'R5'].every((id) => state.functionState[id] === 'correct')) milestone(state, 'persistence_correct');
}

function invalidateForAcceptanceChange(state) {
  if (!state.artifact.kind || !Object.keys(state.evidence).length) return;
  invalidate(state, Object.keys(state.functionState));
}

function evidenceCurrent(state, requirementId) {
  const e = state.evidence[requirementId];
  return e?.result === 'pass' && e.artifactRevision === state.artifact.revision;
}

function invalidate(state, ids) {
  for (const id of ids) {
    if (state.evidence[id]) state.evidence[id] = { ...state.evidence[id], result: 'not_run', invalidatedBy: state.artifact.revision };
  }
}

function advanceArtifact(state, affected, { preserveUnrelated = false } = {}) {
  const previousRevision = state.artifact.revision;
  state.artifact.revision += 1;
  if (preserveUnrelated) {
    for (const [requirementId, evidence] of Object.entries(state.evidence)) {
      if (!affected.includes(requirementId) && evidence.artifactRevision === previousRevision && evidence.result === 'pass') {
        state.evidence[requirementId] = { ...evidence, artifactRevision: state.artifact.revision, carriedForward: true };
      }
    }
  }
  invalidate(state, affected);
}

function setEvidence(state, id, result, detail) {
  state.evidence[id] = { requirementId: id, artifactRevision: state.artifact.revision, result, source: '操作驗證', detail };
}

function issue(state, code, text, requirements) {
  const existing = state.knownIssues.find((x) => x.code === code && x.status !== 'fixed');
  if (!existing) state.knownIssues.push({ code, text, requirements, status: 'known', introducedAt: state.artifact.revision });
}

function eligible(state, actionId, options) {
  if (['A13', 'A14'].includes(actionId)) {
    return usesCase01Story(state) && case01StoryChoices(state, actionId).length ? [`${actionId}-story`] : [];
  }
  const ids = EVENTS[actionId]?.map((x) => x.id) ?? [];
  if (actionId === 'A01') {
    if (state.requirement.clarity === 'clear' && state.requirement.scope !== 'pending_change' && !options?.newRevision) return [];
    return ids.filter((id) => id !== 'A01-D' || !state.extraWishSeen);
  }
  if (actionId === 'A02') return state.documents.draft && state.requirement.clarity !== 'clear' ? ids : [];
  if (actionId === 'A03') return state.requirement.scope === 'pending_change' ? ids : [];
  if (actionId === 'A04') return state.documents.draft ? ids : [];
  if (actionId === 'A05') return ids;
  if (actionId === 'A06') return state.artifact.kind ? ids : [];
  if (actionId === 'A07') {
    if (!state.artifact.kind && state.requirement.clarity === 'unknown') return [];
    return ids.filter((id) => id !== 'A07-B' || ((options?.target ?? 'persistence') === 'core' && (state.requirement.clarity !== 'clear' || state.documents.wrongCompletionRule)));
  }
  if (actionId === 'A08') return state.artifact.kind ? ids : [];
  if (actionId === 'A09') return state.artifact.kind ? ids.filter((id) => id !== 'A09-A' || state.functionState.R3 === 'defective') : [];
  if (actionId === 'A10') return state.context.jobsSinceSummary >= 3 || options?.repairDraft ? ids : [];
  if (actionId === 'A11') {
    const hasOpenIssue = state.knownIssues.some((x) => x.status !== 'fixed');
    const canRollback = state.rollbackAvailable && state.checkpoint;
    const mode = options?.mode ?? (hasOpenIssue ? 'fix' : 'rollback');
    if (mode === 'rollback') return canRollback ? ['A11-C'] : [];
    return hasOpenIssue ? ids.filter((id) => id !== 'A11-C') : [];
  }
  return ids;
}

export function reviewCoveragePercent(state, options = {}) {
  const c3 = options.useC3 ? cardLevel(state, 'C3') : 0;
  const cardBonus = c3 === 2 ? 35 : c3 === 1 ? 20 : 0;
  return clamp(35 + 5.5 * state.abilities.V - 3 * Math.max(0, state.stress - 4) + cardBonus, 20, 95);
}

function pickEvent(state, actionId, options, eventKey) {
  if (options?.designate) {
    if (!eligible(state, actionId, options).includes(options.designate)) throw new Error('指定事件不合法');
    return EVENTS[actionId].find((e) => e.id === options.designate);
  }
  if (actionId === 'A08') {
    const core = ['R1', 'R2', 'R3'].every((id) => state.functionState[id] === 'correct');
    const full = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].every((id) => state.functionState[id] === 'correct');
    return EVENTS.A08.find((e) => e.id === (full ? 'A08-A' : core ? 'A08-B' : 'A08-C'));
  }
  if (actionId === 'A09') {
    const targetedDefect = state.functionState.R3 === 'defective';
    const knownTargetedDefect = targetedDefect && state.knownIssues.some((issue) => issue.status !== 'fixed' && issue.requirements.includes('R3'));
    const covered = unitFor(state.seed, `${eventKey}:review`) < reviewCoveragePercent(state, options) / 100;
    const id = knownTargetedDefect ? 'A09-A' : targetedDefect && covered ? 'A09-A' : covered ? 'A09-B' : 'A09-C';
    return EVENTS.A09.find((e) => e.id === id);
  }
  const legalIds = eligible(state, actionId, options);
  const items = legalIds.map((id) => EVENTS[actionId].find((e) => e.id === id));
  const base = BASE[actionId];
  const ability = ACTIONS[actionId].ability;
  const weights = items.map((item) => {
    const index = EVENTS[actionId].findIndex((e) => e.id === item.id);
    let value = base[index];
    if (index === 0 && ability) {
      value += 9.5 * (state.abilities[ability] - 5.5) - 3 * Math.max(0, state.stress - 4);
      if (actionId === 'A07' && state.requirement.clarity === 'clear') value += 10;
      if (actionId === 'A07' && state.requirement.clarity !== 'clear') value -= 12;
      if (actionId === 'A07' && state.documents.confirmed) value += 5;
      if (actionId === 'A07' && state.analysisPrep > 0) value += 10;
      if (actionId === 'A11' && cardLevel(state, 'C4')) value += 10 * cardLevel(state, 'C4');
      if (state.careerCardsSnapshot) value += state.retryUnderstanding?.[actionId] ?? 0;
      value = Math.max(1, value);
    }
    if (options?.useC2 && ['A05', 'A07'].includes(actionId) && index > 0) value += 5;
    if (state.careerCardsSnapshot && index > 0 && state.lastEvent?.actionId === actionId && state.lastEvent?.event?.id === item.id) value *= 0.25;
    return value;
  });
  return weightedPick(items, weights, unitFor(state.seed, eventKey));
}

function eventForPresentation(chosen, options) {
  const target = options?.target ?? 'persistence';
  if (chosen.id === 'A07-A' && target === 'core') {
    return {
      ...chosen,
      story: 'Claude 把新增、完成與取消完成的核心操作接好，終端裡的待辦開始像待辦，不再像一排只會坐著的字。\n\n這次工作範圍只碰核心操作，沒有假裝順便完成保存或重新開啟。diff 收在玩家選定的邊界內，受影響的核心證據仍要在這個新版本重新驗證。\n\nClaude：「新增、完成、取消都接好了。」你：「很好，沒有順手蓋一座資料庫，值得記一筆。」',
      summary: '新增、完成與取消完成已依選定範圍完成；核心證據因版本變更而待重驗。',
    };
  }
  if (chosen.id === 'A07-A' && target === 'delete') {
    return {
      ...chosen,
      story: 'Claude 只處理刪除單一項目的範圍，沒有趁機翻修整間待辦工廠。\n\n刪除路徑已接上，但是否能在兩筆同名待辦中只刪指定那筆，仍以你這次是否勾選實際檢查為準。其他核心與保存功能沒有被冒稱一起完成。\n\nClaude：「這次真的只動刪除。」你：「我先截圖，這句話很稀有。」',
      summary: '刪除單一項目的工作已完成；刪除證據依本次實際檢查更新。',
    };
  }
  if (chosen.id !== 'A07-C') return chosen;
  if (options?.checkDelete) {
    if (target === 'persistence') return chosen;
    const checkedStory = target === 'core'
      ? '你要補核心操作，它順手碰到刪除邏輯。新增與完成能動，但你實際執行「兩筆同名待辦只刪一筆」時，第二條牛奶被刪，第一條也跟著離職。\n\n這次檢查已確認刪除真的認錯人；它是已知缺陷，不是假設，也沒有被誤寫成保存工作已完成。\n\nClaude：「這可能與識別方式有關。」你：「很好，至少它們不是因為感情好。」'
      : '你要處理單筆刪除，它改了相鄰的列表結構。你實際建立兩筆同名待辦再刪第二筆，第一筆也一起消失；單筆刪除正式變成集體離職。\n\n這次檢查已確認缺陷只屬於選定的刪除範圍，沒有冒稱核心或保存工作也一起完成。\n\nClaude：「兩筆資料用了同一種找人方式。」你：「那不是找人，是點名時全班一起走。」';
    return {
      ...chosen,
      story: checkedStory,
      summary: target === 'core'
        ? '核心操作與刪除證據失效，建立已知問題。'
        : '刪除證據失效，建立已知問題。',
    };
  }
  const targetCopy = target === 'core'
    ? '你要補核心操作，它順手碰到刪除邏輯。'
    : target === 'delete'
      ? '你要處理單筆刪除，它改了相鄰的列表結構。'
      : '你要保存，它順手改了列表結構。';
  const summary = target === 'core'
    ? '核心操作與刪除證據失效；刪除行為尚未檢查，留待後續驗證或審查。'
    : target === 'delete'
      ? '刪除證據失效；刪除行為尚未檢查，留待後續驗證或審查。'
      : '刪除與保存證據失效；刪除行為尚未檢查，留待後續驗證或審查。';
  return {
    ...chosen,
    title: '改動碰到隔壁功能，但還沒驗明正身',
    story: `${targetCopy}diff 像搬家紙箱一路堆到刪除邏輯門口。\n\n這次沒有真的跑「兩筆同名待辦只刪一筆」的檢查。刪除行為因此被誠實標成待驗，不宣稱正常，也還沒有足夠證據把它列成已知缺陷。\n\nClaude：「這一帶可能受影響。」你：「很好，先貼封條，別假裝我們巡過樓。」`,
    summary,
  };
}

function applyEvent(state, actionId, chosen, options) {
  const id = chosen.id;
  state.stress = clamp(state.stress + chosen.stress, 0, LIMITS.stressCap);
  state.historyTags.push(id);
  if (actionId === 'A05') milestone(state, 'prototype_attempted');
  if (actionId === 'A07') milestone(state, 'implementation_started');
  if (['A05', 'A07'].includes(actionId) || (actionId === 'A11' && id !== 'A11-C')) {
    state.checkpoint = {
      artifact: clone(state.artifact),
      functionState: clone(state.functionState),
      evidence: clone(state.evidence),
      knownIssues: clone(state.knownIssues),
      sourceActionId: actionId,
    };
    state.rollbackAvailable = true;
  }
  if (id === 'A01-A') {
    invalidateForAcceptanceChange(state);
    state.requirement.clarity = 'clear'; state.requirement.scope = 'bounded'; state.requirement.pendingQuestions = []; state.answerRevision += 1; state.documents.draft = true;
    milestone(state, 'requirements_clear');
  } else if (id === 'A01-B') { state.requirement.clarity = 'ambiguous'; state.documents.draft = true; }
  else if (id === 'A01-C') { state.requirement.clarity = 'ambiguous'; state.documents.draft = true; state.answerRevision += 1; }
  else if (id === 'A01-D') { state.extraWishSeen = true; state.requirement.scope = 'pending_change'; state.documents.draft = true; }
  else if (id === 'A02-A') { state.documents.draft = true; }
  else if (id === 'A02-B') { state.documents.wrongCompletionRule = true; }
  else if (id === 'A03-A' || id === 'A03-C') { state.requirement.scope = 'bounded'; state.scopeNegotiated = true; }
  else if (id === 'A04-A') { invalidateForAcceptanceChange(state); state.documents.confirmed = true; state.documents.wrongCompletionRule = false; milestone(state, 'confirmed_spec'); }
  else if (id === 'A04-B') { state.documents.wrongCompletionRule = true; }
  else if (id === 'A05-A') {
    state.artifact.kind ||= 'prototype'; state.artifact.revision += 1;
    Object.assign(state.functionState, { R1: 'correct', R2: 'correct', R3: 'correct' });
    invalidate(state, ['R1', 'R2', 'R3']); awardImplementationMilestones(state); state.rollbackAvailable = true;
  } else if (id === 'A05-B') {
    state.artifact.kind ||= 'prototype'; state.artifact.revision += 1; state.functionState.R1 = 'defective';
    issue(state, 'ui-not-updating', '畫面沒有顯示新增項目', ['R1']); state.rollbackAvailable = true;
  } else if (id === 'A05-C') {
    state.artifact.kind ||= 'prototype'; state.artifact.visualDetour = true; state.artifact.revision += 1; state.rollbackAvailable = true;
  } else if (id === 'A06-A' || id === 'A06-B') {
    invalidateForAcceptanceChange(state);
    state.requirement.clarity = 'clear'; state.requirement.pendingQuestions = []; state.answerRevision += 1; state.documents.draft = true; milestone(state, 'requirements_clear');
  } else if (id === 'A06-C') { state.requirement.scope = 'pending_change'; state.answerRevision += 1; }
  else if (id === 'A07-A') {
    state.artifact.kind = 'implementation';
    const target = options?.target ?? 'persistence';
    const affected = target === 'core' ? ['R1', 'R2', 'R3'] : target === 'delete' ? ['R3'] : ['R4', 'R5'];
    for (const req of affected) state.functionState[req] = 'correct';
    advanceArtifact(state, affected, { preserveUnrelated: true }); state.artifact.affectedRequirements = affected; state.rollbackAvailable = true;
    awardImplementationMilestones(state);
    if (state.analysisPrep > 0) state.analysisPrep -= 1;
  } else if (id === 'A07-B') {
    state.artifact.kind = 'implementation'; state.functionState.R2 = 'defective';
    advanceArtifact(state, ['R2'], { preserveUnrelated: true }); issue(state, 'completion-removes-item', '完成後項目被刪除', ['R2']); state.rollbackAvailable = true;
  } else if (id === 'A07-C') {
    state.artifact.kind = 'implementation';
    const target = options?.target ?? 'persistence';
    const affected = target === 'persistence' ? ['R3', 'R4', 'R5'] : target === 'delete' ? ['R3'] : ['R1', 'R2', 'R3'];
    if (target === 'persistence') { state.functionState.R4 = 'correct'; state.functionState.R5 = 'correct'; }
    if (target === 'core') { state.functionState.R1 = 'correct'; state.functionState.R2 = 'correct'; }
    state.functionState.R3 = 'defective';
    advanceArtifact(state, affected, { preserveUnrelated: true });
    awardImplementationMilestones(state);
    if (options?.checkDelete) issue(state, 'duplicate-delete', '刪除一條可能誤刪另一條', ['R3']);
    state.rollbackAvailable = true;
  } else if (id === 'A08-A') {
    for (const req of Object.keys(state.functionState)) setEvidence(state, req, state.functionState[req] === 'correct' ? 'pass' : 'fail', '本版操作檢查');
    if (Object.keys(state.functionState).every((r) => evidenceCurrent(state, r))) milestone(state, 'full_verification', 0);
  } else if (id === 'A08-B') {
    for (const req of ['R1', 'R2', 'R3', 'R6']) setEvidence(state, req, state.functionState[req] === 'correct' ? 'pass' : 'fail', '本版操作檢查');
    setEvidence(state, 'R4', 'fail', '重新整理後資料消失'); setEvidence(state, 'R5', 'not_run', '關閉重開未執行');
    issue(state, 'persistence-missing', '重新整理後資料消失', ['R4', 'R5']);
  } else if (id === 'A08-C') {
    for (const req of Object.keys(state.functionState)) setEvidence(state, req, state.functionState[req] === 'not_implemented' ? 'not_run' : state.functionState[req] === 'correct' ? 'pass' : 'fail', '本版操作檢查');
  } else if (id === 'A09-A') {
    setEvidence(state, 'R3', 'fail', '重現同名項目誤刪');
    issue(state, 'duplicate-delete', '同名項目使用文字作為識別，會誤刪', ['R3']); state.reviews.push({ status: 'reproduced', code: 'duplicate-delete' });
  } else if (id === 'A09-B') state.reviews.push({ status: 'not_applicable', code: 'persistence-suspicion' });
  else if (id === 'A09-C') state.reviews.push({ status: 'unverified', code: 'naming-only' });
  else if (id === 'A10-A') { state.context.factsSaved = true; state.context.summaryRevision += 1; }
  else if (id === 'A10-B') { state.context.factsSaved = false; }
  else if (id === 'A10-C') { state.context.summaryRevision += 1; }
  else if (id === 'A11-A') {
    const broken = Object.entries(state.functionState).filter(([, value]) => value === 'defective').map(([key]) => key);
    state.artifact.revision += 1;
    for (const req of broken) { state.functionState[req] = 'correct'; setEvidence(state, req, 'pass', '修復後重驗'); }
    state.knownIssues.forEach((x) => { if (x.status !== 'fixed') x.status = 'fixed'; });
    awardImplementationMilestones(state);
    state.reviews.push({ status: 'rechecked', code: broken.join('+') || 'targeted-fix' }); state.repairHistory = true;
  } else if (id === 'A11-B') {
    state.artifact.revision += 1; state.functionState.R3 = 'correct'; state.functionState.R2 = 'defective';
    state.knownIssues.forEach((x) => { if (x.code === 'duplicate-delete') x.status = 'fixed'; });
    issue(state, 'completion-state-not-saved', '完成狀態沒有跟著識別方式保存', ['R2', 'R4']); invalidate(state, ['R2', 'R4']);
  } else if (id === 'A11-C') {
    const checkpoint = state.checkpoint;
    if (!checkpoint) throw new Error('沒有可用回退點');
    const nextRevision = state.artifact.revision + 1;
    state.artifact = clone(checkpoint.artifact); state.artifact.revision = nextRevision;
    state.functionState = clone(checkpoint.functionState);
    state.evidence = clone(checkpoint.evidence);
    state.knownIssues = clone(checkpoint.knownIssues);
    invalidate(state, Object.keys(state.functionState));
    if (checkpoint.sourceActionId) state.applicationRevisions[checkpoint.sourceActionId] += 1;
    state.checkpoint = null; state.rollbackAvailable = false;
  }

  if (['A01', 'A02', 'A04', 'A06'].includes(actionId) && cardLevel(state, 'C1')) {
    state.analysisPrep = Math.min(2, state.analysisPrep + (cardLevel(state, 'C1') === 2 ? 2 : 1));
  }
}

function subjectOptions(actionId, options = {}) {
  const stable = {};
  if (actionId === 'A07') stable.target = options.target ?? 'persistence';
  if (actionId === 'A11') stable.mode = options.mode ?? 'fix';
  if (actionId === 'A12' && options.intent) stable.intent = options.intent;
  if (['A13', 'A14'].includes(actionId) && options.route) stable.route = options.route;
  return stable;
}

function executionOptions(actionId, options = {}) {
  const stable = subjectOptions(actionId, options);
  for (const key of ['useC2', 'useC3']) {
    if (options[key] === true) stable[key] = true;
  }
  if (actionId === 'A07' && options.checkDelete === true) stable.checkDelete = true;
  return stable;
}

function operationKey(actionId, options) {
  const submission = executionOptions(actionId, options);
  for (const key of ['newRevision', 'repairDraft']) {
    if (options[key] === true) submission[key] = true;
  }
  return JSON.stringify([actionId, submission]);
}

function semanticKey(actionId, options) {
  return JSON.stringify([actionId, subjectOptions(actionId, options)]);
}

function decisionKeyFor(state, actionId, options) {
  return `${actionId}:${state.revisions[actionId]}:${semanticKey(actionId, options)}`;
}

function eventKeyFor(state, actionId, options) {
  return `${decisionKeyFor(state, actionId, options)}:apply-${state.applicationRevisions[actionId]}`;
}

function bumpInputs(state, actionIds) {
  for (const id of actionIds) state.revisions[id] += 1;
}

function updateDependentInputs(state, actionId) {
  const dependencies = {
    A01: ['A02', 'A04', 'A05', 'A07', 'A08'],
    A02: ['A04', 'A05', 'A07'],
    A03: ['A05', 'A07'],
    A04: ['A05', 'A07', 'A08'],
    A05: ['A06', 'A08', 'A09', 'A11'],
    A06: ['A02', 'A04', 'A05', 'A07', 'A08'],
    A07: ['A06', 'A08', 'A09', 'A11'],
    A08: [],
    A09: ['A11'],
    A10: [],
    A11: ['A08', 'A09'],
  };
  bumpInputs(state, dependencies[actionId] ?? []);
  if (actionId !== 'A10') state.revisions.A10 += 1;
}

function actionCost(state, actionId, options = {}, retryOverride = null) {
  state.retryUnderstanding ??= {};
  state.retryCounts ??= {};
  state.cardUsage ??= {};
  state.eventCounts ??= {};
  let cost = ACTIONS[actionId].cost;
  const retry = retryOverride ?? Boolean(state.careerCardsSnapshot && (options.newRevision || options.repairDraft) && state.resolvedKeyByAction[actionId]);
  const c13 = retry ? cardLevel(state, 'C13') : 0;
  if (options.useC2 && cardLevel(state, 'C2') && ['A05', 'A07'].includes(actionId)) cost = Math.max(1, cost - cardLevel(state, 'C2'));
  if (actionId === 'A08' && cardLevel(state, 'C6') && (!state.firstVerifyUsed || cardLevel(state, 'C6') === 2)) cost = Math.max(0, cost - 1);
  if (c13) cost = Math.max(1, cost - 1);
  const overtime = state.timeLeft === 0;
  const totalCost = cost + (overtime ? 1 : 0) + (options.useC3 && cardLevel(state, 'C3') && ['A08', 'A09'].includes(actionId) ? 1 : 0);
  return { cost: totalCost, overtime, timeCost: retry && c13 >= 2 ? 0 : 1, retry, retryLearningGain: retry ? Math.min(26 - (state.retryUnderstanding[actionId] ?? 0), [12, 8, 4, 2][Math.min(state.retryCounts[actionId] ?? 0, 3)] + (c13 ? (c13 >= 2 ? 6 : 4) : 0)) : 0 };
}

export function previewAction(original, actionId, options = {}) {
  if (actionId === 'A12') return { cached: false, cost: 0, overtime: false };
  if (['A13', 'A14'].includes(actionId)) {
    if (!usesCase01Story(original)) throw new Error('此舊局沿用原規則，請完成後再開新局體驗新路線');
    return previewCase01StoryAction(original, actionId, options);
  }
  const state = clone(original);
  if (options.newRevision || options.repairDraft) state.revisions[actionId] += 1;
  if (state.resolved[eventKeyFor(state, actionId, options)]) return { cached: true, cost: 0, overtime: false };
  const cost = actionCost(state, actionId, options);
  if (!state.careerCardsSnapshot) return { cached: false, cost: cost.cost, overtime: cost.overtime };
  return { cached: false, ...cost, refund: cost.cost >= 3 && cardLevel(state, 'C16') && (state.cardUsage.C16 ?? 0) < cardLevel(state, 'C16') ? 1 : 0 };
}

function resourceSnapshot(state) {
  return {
    token: state.token,
    stress: state.stress,
    timeLeft: state.timeLeft,
    overtimeUsed: state.overtimeUsed,
    workCount: state.workCount,
  };
}

function fullVerified(state) {
  return ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].every((id) => evidenceCurrent(state, id));
}

function formalReady(state) {
  return state.artifact.kind === 'implementation'
    && state.requirement.clarity === 'clear'
    && state.requirement.scope === 'bounded'
    && state.requirement.pendingQuestions.length === 0
    && state.documents.confirmed
    && !state.documents.wrongCompletionRule
    && fullVerified(state)
    && !state.knownIssues.some((issue) => issue.status !== 'fixed');
}

export function safeForTrial(state) {
  const core = ['R1', 'R2', 'R3'].every((id) => evidenceCurrent(state, id));
  const dangerous = state.knownIssues.some((x) => x.status !== 'fixed' && x.requirements.some((r) => ['R1', 'R2', 'R3'].includes(r)));
  return core && evidenceCurrent(state, 'R6') && !dangerous;
}

export function decideEnding(state, intent) {
  if (intent === 'stop') return 'E08';
  if (intent === 'showcase' && state.artifact.visualDetour) return 'E05';
  if (intent === 'limited') return safeForTrial(state) ? 'E04' : null;
  if (intent === 'formal') {
    if (!formalReady(state)) return null;
    if (state.overtimeUsed > 0) return 'E06';
    if (state.repairHistory) return 'E03';
    if (state.scopeNegotiated) return 'E02';
    return 'E01';
  }
  if (intent === 'progress' && (state.timeLeft === 0 || state.workCount >= LIMITS.hardWork)) return 'E07';
  if (intent === 'showcase') return null;
  return null;
}

export function previewDelivery(state, intent) {
  const endingId = decideEnding(state, intent);
  if (endingId) return { intent, allowed: true, endingId, message: '' };
  const messages = {
    formal: '目前證據不足以正式交付；請先補齊實作、需求、驗證與已知問題。',
    limited: '目前核心操作或安全證據不足，還不能誠實標成有限試用。',
    showcase: '目前成果不是外觀偏題的展示原型；若期限已到，請改成交接目前進度。',
    progress: '交接目前進度只在時間用完或工作達上限後開放；現在仍可繼續工作。',
  };
  return { intent, allowed: false, endingId: null, message: messages[intent] ?? '請選擇一個可用的結案方式。' };
}

const SUCCESS_ENDINGS = new Set(['E01', 'E02', 'E03', 'E04', 'E06']);

export function composeEnding(state, baseId) {
  const base = ENDINGS[baseId];
  if (!base) return null;
  const successful = SUCCESS_ENDINGS.has(baseId);
  const candidates = [];
  const a07Key = state.resolvedKeyByAction?.A07;
  const a07Result = a07Key ? state.resolved?.[a07Key] : null;
  if (a07Result?.event) {
    const target = state.lastOptionsByAction?.A07?.target ?? 'persistence';
    const failed = a07Result.event.id === 'A07-C';
    const routeFacet = failed
      ? { id: `implementation-${target}-scar`, title: '功能送進去，兩個坑跟著搬家', text: '你沒有把這次實作說成完成：選定範圍真的改了，但刪除與相鄰行為的風險也被帶到結案限制裡。' }
      : {
          core: { id: 'implementation-core', title: '核心先站穩，順便先排隊', text: '你把新增、完成與取消守在核心範圍；沒有把「順便」當免費，也沒有把未承諾功能寫成已交付。' },
          delete: { id: 'implementation-delete', title: '刪除鍵繫上安全帶', text: '你只改動刪除路徑並保留受影響證據；沒有順手重寫保存與核心操作，後續驗證也知道該看哪裡。' },
          persistence: { id: 'implementation-persistence', title: '資料留下來，責任也留下來', text: '你選擇保存與重開路線，並讓相應證據跟著版本前進；這個選擇在結案時仍可追溯。' },
        }[target];
    if (routeFacet) candidates.push(routeFacet);
  }
  const storyRoute = state.story?.commitment;
  if (storyRoute) {
    const resolved = Boolean(state.story?.pendingConsequence?.resolved);
    const storyFacet = {
      steady: {
        id: 'route-steady',
        title: '先穩住，再讓明天有得改',
        text: resolved
          ? '你選擇鎖住已驗證範圍，後來的承諾追問也用紀錄接住；沒有多炫，但沒有把今天的成功拿去賭明天。'
          : '你選擇鎖住已驗證範圍；這份承諾仍會在後續追問中回來，結案沒有假裝它已經消失。',
      },
      expand: {
        id: 'route-expand',
        title: '順手多做一點，差點順手多做一案',
        text: resolved
          ? '你曾把成功拿去擴張，後來也真的付成本收回或補驗；結局記得這次貪心，不把它藏在漂亮成果後面。'
          : '你把成功拿去追加範圍，但新增承諾尚未完整收尾；主要交付結果不會替這筆風險美化。',
      },
      prototype: {
        id: 'route-prototype',
        title: '先做能丟的，才沒把正式版一起丟掉',
        text: resolved
          ? '你用原型換到理解，再把原型留下的承諾邊界處理完；它幫忙學習，沒有冒充正式交付。'
          : '你用原型換到理解，但原型造成的承諾邊界仍待處理；結局把這個限制留在檯面上。',
      },
      trim: {
        id: 'route-trim',
        title: '砍的是範圍，不是事實',
        text: resolved
          ? '你把失敗轉成可核准的小範圍，後續也依新邊界補齊證據；少做一些，但每一項都說得清楚。'
          : '你縮小範圍救回可交付核心，但新的邊界還需要後續確認；結局不把有限版叫成完整版。',
      },
      force: {
        id: 'route-force',
        title: '硬做有做完，技術債也有打卡',
        text: resolved
          ? '你曾選擇硬做，後來也付出修補與驗證成本；債沒有靠一句「先上再說」自動蒸發。'
          : '你選擇硬做留下公開風險；即使主流程能跑，這筆未解問題仍會跟著交付說明。',
      },
    }[storyRoute];
    if (storyFacet) candidates.push(storyFacet);
  }
  if (successful && state.repairHistory) {
    candidates.push({ id: 'recovered', title: '從火場帶著測試報告走出來', text: '你真的遇過問題、修過問題，也重新驗證過；這不是沒摔倒，是摔倒後把坑畫進地圖。' });
  }
  if (successful && state.stress >= LIMITS.highStress) {
    candidates.push({ id: 'high-stress', title: '案子活了，你沒了', text: '交付成功，但你的壓力表看起來像準備申請獨立戶籍。' });
  }
  if (successful && state.overtimeUsed === 0 && state.timeLeft > 0) {
    candidates.push({ id: 'on-time', title: '準時下班的都市傳說', text: '你在期限前交出能說明、能驗證的成果；同業群組暫時不相信這是真的。' });
  }
  if (state.token >= LIMITS.richToken) {
    candidates.push(successful
      ? { id: 'token-rich', title: 'Token 守財奴', text: '成果是真的，剩下的 Token 也是真的；你沒有把省下來的額度誤認成完成度。' }
      : { id: 'token-gravekeeper', title: '額度的守墓人', text: 'Token 留得很漂亮，可惜工作沒有跟著完成；額度全身而退，案件沒有。' });
  }
  const facets = candidates.slice(0, 2);
  return {
    id: baseId,
    baseId,
    title: facets[0]?.title ?? base.title,
    text: [base.text, ...facets.map((facet) => facet.text)].join('\n\n'),
    facets: facets.map((facet) => facet.id),
  };
}

function settleEnding(state, endingId) {
  if (!endingId) return null;
  state.pendingUpgrades = [];
  state.ending = composeEnding(state, endingId);
  state.phase = 'ended';
  if (['E01', 'E02', 'E03', 'E06'].includes(endingId)) milestone(state, 'final_delivery', 2);
  else if (endingId === 'E04') milestone(state, 'limited_trial', 1);
  return state.ending;
}

export function performAction(original, actionId, options = {}) {
  const state = clone(original);
  if (state.phase !== 'playing') throw new Error('本案已結束');
  if (!ACTIONS[actionId]) throw new Error('未知工作');
  const operationId = options.operationId;
  if (!operationId) throw new Error('operationId 必填');
  const payload = operationKey(actionId, options);
  if (state.operationResults[operationId]) {
    if (state.operationPayloads[operationId] !== payload) throw new Error('operationId 內容衝突');
    return { state, result: clone(state.operationResults[operationId]), cached: true };
  }
  if (options.stateVersion !== original.stateVersion) throw new Error('stateVersion 已過期');

  if (actionId === 'A12') {
    const delivery = previewDelivery(state, options.intent);
    const result = delivery.allowed
      ? { type: 'ending', ending: settleEnding(state, delivery.endingId) }
      : { type: 'gap', message: delivery.message, safeTrial: safeForTrial(state), intent: options.intent };
    state.stateVersion += 1; state.operationResults[operationId] = result; state.operationPayloads[operationId] = payload;
    state.log.push({ actionId, intent: options.intent, result: result.type, options: { intent: options.intent }, resourcesAfter: resourceSnapshot(state) });
    return { state, result, cached: false };
  }

  if (['A13', 'A14'].includes(actionId)) {
    if (!usesCase01Story(state)) throw new Error('此舊局沿用原規則，請完成後再開新局體驗新路線');
    if (state.pendingUpgrades.length) throw new Error('請先處理目前的職涯獎勵');
    if (state.workCount >= LIMITS.hardWork) throw new Error('工作上限已到，只能交付或止損');
    if (!eligible(state, actionId, options).length) return { state: original, result: { type: 'not-applicable', message: '目前沒有待處理的路線決策。' }, cached: false };
    const preview = previewCase01StoryAction(state, actionId, options);
    if (preview.overtime && state.overtimeUsed >= 2) throw new Error('加班次數已用完，只能交付或止損');
    if (state.token < preview.cost) throw new Error('Token 不夠了；請休息、交付或止損');
    state.token -= preview.cost;
    state.workCount += 1;
    state.timeLeft = Math.max(0, state.timeLeft - preview.timeCost);
    state.stress = clamp(state.stress + preview.stress + (preview.overtime ? 2 : 0), 0, LIMITS.stressCap);
    if (preview.overtime) state.overtimeUsed += 1;
    const output = performCase01StoryAction(state, actionId, options);
    const result = {
      ...output.result,
      cost: preview.cost,
      timeCost: preview.timeCost,
      overtime: preview.overtime,
      key: eventKeyFor(state, actionId, options),
      recordId: `${state.caseId}-result-${state.workCount}-${state.stateVersion + 1}`,
      resourcesAfter: resourceSnapshot(state),
      artifactRevisionAfter: state.artifact.revision,
    };
    state.context.jobsSinceSummary += 1;
    state.lastEvent = clone(result);
    state.resolved[result.key] = clone(result);
    state.resolvedKeyByAction[actionId] = result.key;
    state.lastOptionsByAction[actionId] = executionOptions(actionId, options);
    state.operationResults[operationId] = clone(result);
    state.operationPayloads[operationId] = payload;
    state.stateVersion += 1;
    state.log.push({ actionId, eventId: result.event.id, cost: preview.cost, work: state.workCount, options: { route: options.route } });
    return { state, result, cached: false };
  }

  const retryForExecution = Boolean(state.careerCardsSnapshot && (options.newRevision || options.repairDraft) && state.resolvedKeyByAction[actionId]);
  if (options.newRevision || options.repairDraft) {
    state.revisions[actionId] += 1;
    delete state.resolvedKeyByAction[actionId];
  } else {
    const currentKey = eventKeyFor(state, actionId, options);
    if (state.resolved[currentKey]) return { state: original, result: clone(state.resolved[currentKey]), cached: true };
  }

  if (state.workCount >= LIMITS.hardWork) throw new Error('工作上限已到，只能交付或停止');
  const legal = eligible(state, actionId, options);
  if (options.designate && !legal.includes(options.designate)) throw new Error('指定事件不合法');
  if (!legal.length) return { state: original, result: { type: 'not-applicable', message: '這個問題已解決，或目前沒有適用內容。' }, cached: false };

  state.retryUnderstanding ??= {};
  state.retryCounts ??= {};
  state.cardUsage ??= {};
  const costPreview = actionCost(state, actionId, options, retryForExecution);
  const { cost: totalCost, overtime, timeCost, retry, retryLearningGain } = costPreview;
  if (overtime && state.overtimeUsed >= 2) throw new Error('加班次數已用完，只能交付或停止');
  if (state.token < totalCost) throw new Error('Token 不足；請休息、交付或停止');

  const key = eventKeyFor(state, actionId, options);
  if (state.resolved[key]) return { state: original, result: clone(state.resolved[key]), cached: true };
  if (retry) {
    state.retryUnderstanding[actionId] = Math.min(26, (state.retryUnderstanding[actionId] ?? 0) + retryLearningGain);
    state.retryCounts[actionId] = (state.retryCounts[actionId] ?? 0) + 1;
  }
  state.token -= totalCost; state.workCount += 1; state.timeLeft = Math.max(0, state.timeLeft - timeCost);
  let tokenRefund = 0;
  if (totalCost >= 3 && cardLevel(state, 'C16') && (state.cardUsage.C16 ?? 0) < cardLevel(state, 'C16')) {
    state.cardUsage.C16 = (state.cardUsage.C16 ?? 0) + 1;
    state.token = Math.min(LIMITS.tokenCap, state.token + 1);
    tokenRefund = 1;
  }
  if (overtime) { state.overtimeUsed += 1; state.stress = clamp(state.stress + 2, 0, LIMITS.stressCap); }
  const decisionKey = decisionKeyFor(state, actionId, options);
  const decidedId = state.eventDecisions[decisionKey];
  let chosen = decidedId ? EVENTS[actionId].find((event) => event.id === decidedId) : pickEvent(state, actionId, options, decisionKey);
  if (!decidedId) state.eventDecisions[decisionKey] = chosen.id;
  const pickedIndex = EVENTS[actionId].findIndex((event) => event.id === chosen.id);
  const c14Uses = cardLevel(state, 'C14');
  const partialFrom = pickedIndex === 1 && c14Uses > (state.cardUsage.C14 ?? 0) ? chosen.id : null;
  if (partialFrom) {
    state.cardUsage.C14 = (state.cardUsage.C14 ?? 0) + 1;
    chosen = EVENTS[actionId][0];
  }
  applyEvent(state, actionId, chosen, options);
  let presentedEvent = eventForPresentation(chosen, options);
  const eventCount = (state.eventCounts[presentedEvent.id] ?? 0) + 1;
  state.eventCounts[presentedEvent.id] = eventCount;
  if (eventCount > 1) presentedEvent = { ...presentedEvent, summary: `${presentedEvent.summary}（續篇 ${eventCount}：前次理解有承接，剛出現的同事件權重已降低。）` };
  if (actionId === 'A01' && chosen.id !== 'A01-A') {
    state.revisions.A01 += 1;
    for (const affected of ['A04', 'A05', 'A07', 'A08', 'A09']) {
      state.retryUnderstanding[affected] = Math.floor((state.retryUnderstanding[affected] ?? 0) / 2);
      state.retryCounts[affected] = Math.floor((state.retryCounts[affected] ?? 0) / 2);
    }
  }
  updateDependentInputs(state, actionId);
  if (actionId === 'A08') state.firstVerifyUsed = true;
  state.context.jobsSinceSummary = actionId === 'A10' ? 0 : state.context.jobsSinceSummary + 1;
  const result = {
    type: 'event',
    actionId,
    event: clone(presentedEvent),
    process: buildProcess({ actionId, event: presentedEvent, options, stateBefore: original, stateAfter: state }),
    cost: totalCost,
    timeCost,
    overtime,
    retry: retry ? { learningGain: retryLearningGain, total: state.retryUnderstanding[actionId] } : null,
    partial: Boolean(partialFrom),
    partialFrom,
    cardEffects: { tokenRefund },
    key,
    recordId: `${state.caseId}-result-${state.workCount}-${state.stateVersion + 1}`,
    semanticOptions: executionOptions(actionId, options),
    resourcesAfter: resourceSnapshot(state),
    artifactRevisionAfter: state.artifact.revision,
  };
  if (usesCase01Story(state)) observeCase01Story(state, actionId, result);
  const replayOptions = {};
  for (const key of ['target', 'mode', 'useC2', 'useC3', 'checkDelete', 'newRevision', 'repairDraft']) {
    if (options[key] !== undefined) replayOptions[key] = options[key];
  }
  state.lastEvent = result; state.resolved[key] = clone(result); state.operationResults[operationId] = clone(result); state.operationPayloads[operationId] = payload;
  state.resolvedKeyByAction[actionId] = key; state.lastOptionsByAction[actionId] = executionOptions(actionId, options);
  state.stateVersion += 1; state.log.push({ actionId, eventId: chosen.id, cost: totalCost, work: state.workCount, options: replayOptions });
  return { state, result, cached: false };
}

export function rest(original, { operationId, stateVersion } = {}) {
  const state = clone(original);
  if (!operationId) throw new Error('operationId 必填');
  if (stateVersion !== original.stateVersion) throw new Error('stateVersion 已過期');
  if (state.workCount >= LIMITS.hardWork) throw new Error('工作上限已到');
  const overtime = state.timeLeft === 0;
  if (overtime && state.overtimeUsed >= 2) throw new Error('加班次數已用完');
  const cost = overtime ? 1 : 0;
  if (state.token < cost) throw new Error('Token 不足');
  state.token -= cost; state.workCount += 1; state.timeLeft = Math.max(0, state.timeLeft - 1);
  if (overtime) { state.overtimeUsed += 1; state.stress = clamp(state.stress + 2, 0, LIMITS.stressCap); }
  const level = cardLevel(state, 'C5');
  state.token = Math.min(LIMITS.tokenCap, state.token + 4 + (level === 2 ? 2 : level));
  state.stress = clamp(state.stress - (level ? 3 : 2), 0, LIMITS.stressCap);
  state.stateVersion += 1; state.log.push({ actionId: 'REST', work: state.workCount, overtime, options: {}, resourcesAfter: resourceSnapshot(state) });
  return { state, result: { type: 'rest', overtime }, cached: false };
}

export function upgradeChoices(state, threshold = state.pendingUpgrades[0]) {
  if (!state.pendingUpgrades.includes(threshold)) return [];
  const eligibleIds = state.careerCardsSnapshot ? CASE01_CARD_IDS : ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  const pool = eligibleIds.filter((id) => (state.cards[id] ?? 0) < (CARDS[id].maxLevel ?? 1));
  const choices = draw(state.seed, `upgrade:${threshold}`, pool, Math.min(3, pool.length));
  if (!state.careerCardsSnapshot) return choices;
  const alternatives = ['shard-1', 'shard-2', 'career-exp-2'];
  return [...choices, ...alternatives.slice(0, 3 - choices.length)];
}

export function chooseUpgrade(original, cardId) {
  const state = clone(original);
  const threshold = state.pendingUpgrades[0];
  const choices = upgradeChoices(state, threshold);
  if (!choices.includes(cardId)) throw new Error('升級選擇不在本輪選項');
  const alternative = {
    'shard-1': { kind: 'shard', amount: 1, title: '靈感碎片 ×1' },
    'shard-2': { kind: 'shard', amount: 2, title: '靈感碎片 ×2' },
    'career-exp-2': { kind: 'career-exp', amount: 2, title: '資深費 EXP ×2' },
  }[cardId];
  if (alternative) {
    const slot = threshold === 2 ? 1 : 2;
    state.careerRewards.push({ ...alternative, claimId: `reward:milestone-${slot}` });
    state.rewardClaims.push(`reward:milestone-${slot}`);
    state.pendingUpgrades.shift(); state.claimedThresholds.push(threshold); state.stateVersion += 1;
    state.log.push({ actionId: 'UPGRADE', cardId, threshold, kind: alternative.kind, options: {}, resourcesAfter: resourceSnapshot(state) });
    return state;
  }
  const previousLevel = state.cards[cardId] ?? 0;
  state.cards[cardId] = Math.min(CARDS[cardId].maxLevel ?? 1, previousLevel + 1);
  if (!state.equipped.includes(cardId) && state.equipped.length < 3) state.equipped.push(cardId);
  state.pendingUpgrades.shift(); state.claimedThresholds.push(threshold); state.stateVersion += 1;
  state.log.push({ actionId: 'UPGRADE', cardId, threshold, kind: previousLevel ? 'fusion' : 'new', previousLevel, nextLevel: state.cards[cardId], options: {}, resourcesAfter: resourceSnapshot(state) });
  return state;
}

export function availableActions(state) {
  if (state.phase !== 'playing') return [];
  const atHardCap = state.workCount >= LIMITS.hardWork
    || (state.timeLeft === 0 && state.overtimeUsed >= 2);
  if (atHardCap) return ['A12'];
  return Object.values(ACTIONS).filter((a) => a.id === 'A12' || eligible(state, a.id, {}).length).map((a) => a.id);
}

export function isEvidenceCurrent(state, requirementId) { return evidenceCurrent(state, requirementId); }
export function isFullyVerified(state) { return fullVerified(state); }
export function isFormalReady(state) { return formalReady(state); }
export function isActionResultCurrent(state, actionId) {
  const key = state.resolvedKeyByAction[actionId];
  if (!key) return false;
  return key === eventKeyFor(state, actionId, state.lastOptionsByAction[actionId] ?? {});
}

export function readPreviousActionResult(state, actionId) {
  const key = state.resolvedKeyByAction[actionId];
  if (!key || !state.resolved[key]) return null;
  return clone(state.resolved[key]);
}
