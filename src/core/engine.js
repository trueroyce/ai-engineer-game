// v0.3-T3 規則引擎：純狀態轉移。每次 submit 回傳新狀態，不就地修改輸入。
// 時序依 game-specification.md §2「精確時序」。
import { RULES, RULE_VERSION, CARD_IDS, PROJECT_IDS, endingForScore } from './rules.js';
import { createStreams, drawD100, drawSample, randomSeed } from './rng.js';
import { computeP, computeQ, computeCost, cardLevel } from './formulas.js';

class Rejection extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function reject(code, message) {
  throw new Rejection(code, message);
}

function newId() {
  return globalThis.crypto.randomUUID();
}

function freshProject(projectId) {
  return {
    projectId, status: 'unaccepted', progress: 0, hiddenDefects: 0, knownDefects: 0, age: 0,
    preparationBonus: 0, preparationUses: 0, halfXpGranted: false, fullXpGranted: false,
    qualityXpGranted: false, deliveryRewardGranted: false, firstVerificationUsed: false,
  };
}

export function createGame(options = {}) {
  const rngConfig = options.rng ?? {
    success: { seed: randomSeed() }, defect: { seed: randomSeed() }, card: { seed: randomSeed() },
  };
  const gameId = options.gameId ?? newId();
  return {
    ruleVersion: RULE_VERSION,
    gameId,
    stateVersion: 0,
    phase: 'characterSetup',
    turn: 1,
    attributes: null,
    attributeSource: null,
    token: RULES.token.start,
    stress: RULES.stress.start,
    score: 0,
    xp: 0,
    level: 1,
    equipped: [],
    projects: Object.fromEntries(PROJECT_IDS.map((id) => [id, freshProject(id)])),
    activeProject: null,
    turnWindow: { accepted: false, abandoned: false },
    pendingDraft: null,
    pendingLevelUps: 0,
    rng: createStreams(rngConfig),
    events: [],
    endReason: null,
    ending: null,
    operationResults: {},
    log: { createOptions: { gameId, rng: structuredClone(rngConfig) }, requests: [] },
  };
}

export function snapshot(state) {
  return {
    turn: state.turn,
    phase: state.phase,
    token: state.token,
    stress: state.stress,
    score: state.score,
    xp: state.xp,
    level: state.level,
    equipped: structuredClone(state.equipped),
    activeProject: state.activeProject,
    projects: structuredClone(state.projects),
  };
}

// ---- 角色建立與開局抽卡 ----

export function validateAttributes(a) {
  const { min, max, total, keys } = RULES.attributes;
  if (!a || typeof a !== 'object') return '缺少能力值';
  for (const k of keys) {
    if (!Number.isInteger(a[k])) return `${k} 必須是整數`;
    if (a[k] < min || a[k] > max) return `${k} 必須介於 ${min} 與 ${max}`;
  }
  const sum = keys.reduce((s, k) => s + a[k], 0);
  if (sum !== total) return `三項總和必須為 ${total}，目前為 ${sum}`;
  return null;
}

function handleSetAttributes(ctx) {
  const { state, request } = ctx;
  requirePhase(state, 'characterSetup');
  let attributes;
  let source;
  if (request.template !== undefined) {
    const t = RULES.templates[request.template];
    if (!t) reject('invalid_attributes', `沒有模板「${request.template}」`);
    attributes = { A: t.A, E: t.E, V: t.V };
    source = `template:${request.template}`;
  } else {
    const a = request.attributes;
    const problem = validateAttributes(a);
    if (problem) reject('invalid_attributes', problem);
    attributes = { A: a.A, E: a.E, V: a.V };
    source = 'custom';
  }
  state.attributes = attributes;
  state.attributeSource = source;
  const draw = drawCard(ctx, [...CARD_IDS], RULES.draft.openingDraw);
  state.pendingDraft = {
    source: 'opening',
    candidates: draw.value.map((id) => ({ id, level: 1, kind: 'new' })),
    designated: draw.designated,
    drawIndex: draw.index,
  };
  state.phase = 'openingDraft';
  ctx.outcome = { attributes, source };
}

function handleChooseOpening(ctx) {
  const { state, request } = ctx;
  requirePhase(state, 'openingDraft');
  const ids = request.cardIds;
  const candidates = state.pendingDraft.candidates.map((c) => c.id);
  if (!Array.isArray(ids) || ids.length !== RULES.draft.openingPick || new Set(ids).size !== ids.length
    || !ids.every((id) => candidates.includes(id))) {
    reject('invalid_selection', `須從候選 ${candidates.join('、')} 中選 ${RULES.draft.openingPick} 張不同的卡`);
  }
  state.equipped = ids.map((id) => ({ id, level: 1 }));
  state.pendingDraft = null;
  state.phase = 'turnStart';
  state.turn = 1;
  state.turnWindow = { accepted: false, abandoned: false };
  ctx.outcome = { equipped: structuredClone(state.equipped) };
}

// ---- 回合開始窗口：提前結算 → 放棄 → 接案 ----

function handleEarlySettle(ctx) {
  const { state } = ctx;
  requirePhase(state, 'turnStart');
  if (state.turnWindow.abandoned || state.turnWindow.accepted) {
    reject('window_order', '提前結算只能在本回合放棄或接案之前提出');
  }
  const undelivered = undeliveredProjects(state);
  endGame(state, 'earlySettle');
  ctx.outcome = { score: state.score, ending: state.ending, undelivered };
}

function handleAbandon(ctx) {
  const { state } = ctx;
  requirePhase(state, 'turnStart', 'actionSelection');
  if (state.turnWindow.accepted) reject('abandon_after_accept', '本回合已接案，不能在同一回合放棄；最早下一回合開始時才能放棄');
  if (state.phase !== 'turnStart') reject('wrong_phase', '只能在回合開始窗口放棄');
  if (!state.activeProject) reject('no_active_project', '目前沒有進行中的專案');
  const id = state.activeProject;
  const p = state.projects[id];
  Object.assign(p, { status: 'abandoned', progress: 0, hiddenDefects: 0, knownDefects: 0, preparationBonus: 0, preparationUses: 0 });
  state.activeProject = null;
  state.turnWindow.abandoned = true;
  state.stress += RULES.abandonStress;
  ctx.outcome = { projectId: id, stressDelta: RULES.abandonStress };
  checkCrash(ctx);
}

function handleAccept(ctx) {
  const { state, request } = ctx;
  requirePhase(state, 'turnStart');
  const p = state.projects[request.projectId];
  if (!p) reject('project_unavailable', `沒有專案 ${request.projectId}`);
  if (state.activeProject) reject('project_active', `已有進行中的 ${state.activeProject}；須先在本回合開始窗口放棄它`);
  if (p.status !== 'unaccepted') reject('project_unavailable', `${request.projectId} 已${statusName(p.status)}，每案只能接一次`);
  p.status = 'active';
  state.activeProject = request.projectId;
  state.turnWindow.accepted = true;
  state.phase = 'actionSelection';
  ctx.outcome = { projectId: request.projectId };
}

function statusName(status) {
  return { active: '在進行中', delivered: '交付', expired: '逾期', abandoned: '放棄', unaccepted: '未接' }[status];
}

function undeliveredProjects(state) {
  return Object.values(state.projects)
    .filter((p) => p.status !== 'delivered' && p.status !== 'unaccepted')
    .map((p) => ({
      projectId: p.projectId,
      status: p.status,
      progress: p.progress,
      target: RULES.projects[p.projectId].target,
      progressFull: p.progress >= RULES.projects[p.projectId].target,
    }));
}

function endGame(state, reason) {
  state.phase = 'ended';
  state.endReason = reason;
  state.pendingDraft = null;
  state.pendingLevelUps = 0;
  state.ending = reason === 'crash' ? { ...RULES.crashEnding } : endingForScore(state.score);
}

// S≥10 立即崩潰，優先於交付、升級與逾期。回傳是否已崩潰。
function checkCrash(ctx) {
  if (ctx.state.stress >= RULES.stress.crashAt) {
    endGame(ctx.state, 'crash');
    ctx.notes.push({ kind: 'crash', stress: ctx.state.stress });
    return true;
  }
  return false;
}

// ---- 主要行動：合法性與預覽（唯讀，不取骰；不讀 H）----

const ACTION_ORDER = ['analyze', 'implement', 'rush', 'verify', 'repair', 'rest', 'deliver'];
const PROJECT_ACTIONS = new Set(['analyze', 'implement', 'rush', 'verify', 'repair', 'deliver']);
const TOGGLES_FOR = { implement: ['C2'], rush: ['C2'], verify: ['C3'] };
const ACTION_PHASES = ['turnStart', 'actionSelection'];

export function levelForXp(xp) {
  const crossed = RULES.xp.thresholds.filter((t) => xp >= t).length;
  return Math.min(1 + crossed, RULES.xp.maxLevel);
}

function phaseProblem(state, allowed) {
  if (state.phase === 'ended') return { code: 'game_ended', message: '本局已結束' };
  if (allowed.includes(state.phase)) return null;
  if (state.phase === 'levelDraft') return { code: 'draft_pending', message: '請先完成或放棄升級抽選' };
  return { code: 'wrong_phase', message: `目前階段（${state.phase}）不能執行此操作` };
}

function projectProblem(action, p, target) {
  switch (action) {
    case 'analyze':
    case 'implement':
    case 'rush':
      return p.progress >= target ? '進度已滿，不能再推進' : null;
    case 'verify':
      return p.progress < 1 ? '驗證需要進度至少 1' : null;
    case 'repair':
      return p.knownDefects < 1 ? '沒有已知缺陷可修復' : null;
    case 'deliver':
      if (p.progress < target) return '進度未滿，不能交付';
      if (p.knownDefects > 0) return '還有已知缺陷，修復後才能交付';
      return null;
    default:
      return null;
  }
}

function evaluate(state, { action, toggles: rawToggles } = {}) {
  const out = { action, legal: false, reason: null, toggles: {}, cost: null, costParts: [], p: null, pDetail: null, q: null, qParts: [], usesPreparation: false, stressDelta: null, outcomes: null, warnings: [], summary: '' };
  const fail = (code, message) => ({ ...out, reason: { code, message } });
  const phase = phaseProblem(state, ACTION_PHASES);
  if (phase) return fail(phase.code, phase.message);
  if (!RULES.actions[action]) return fail('invalid_action', `沒有行動「${action}」`);
  const allowed = TOGGLES_FOR[action] ?? [];
  for (const id of allowed) out.toggles[id] = false;
  for (const [id, on] of Object.entries(rawToggles ?? {})) {
    if (!on) continue;
    if (!allowed.includes(id)) return fail('invalid_toggle', `${id} 不能用在${RULES.actions[action].name}`);
    if (!cardLevel(state.equipped, id)) return fail('card_not_equipped', `未持有 ${id}，不能開啟`);
    out.toggles[id] = true;
  }
  const activeId = state.activeProject;
  if (PROJECT_ACTIONS.has(action) && !activeId) {
    return fail('no_active_project', '沒有進行中的專案；目前只能休息');
  }
  const proj = activeId ? state.projects[activeId] : null;
  const def = activeId ? RULES.projects[activeId] : null;
  const prep = proj ? { B: proj.preparationBonus, N: proj.preparationUses } : { B: 0, N: 0 };
  const pr = computeP({ action, attributes: state.attributes, difficulty: def?.difficulty ?? 0, stress: state.stress, preparation: prep, equipped: state.equipped, toggles: out.toggles });
  const qr = computeQ({ action, attributes: state.attributes, consumesPreparation: pr.usesPreparation, equipped: state.equipped, toggles: out.toggles });
  const cr = computeCost({ action, equipped: state.equipped, toggles: out.toggles, project: proj });
  Object.assign(out, {
    cost: cr.cost, costParts: cr.parts, p: pr.p, pDetail: { raw: pr.raw, general: pr.general, steps: pr.steps, post: pr.post },
    q: qr.q, qParts: qr.parts, usesPreparation: pr.usesPreparation,
  });
  describe(state, out, proj, def, prep);
  if (proj) {
    const problem = projectProblem(action, proj, def.target);
    if (problem) return { ...out, reason: { code: 'precondition_failed', message: problem } };
  }
  if (cr.cost > state.token) {
    return { ...out, reason: { code: 'insufficient_token', message: `需要 ${cr.cost} Token，目前只有 ${state.token}` } };
  }
  return { ...out, legal: true };
}

// 可見後果、警告與一句話摘要；只用玩家可見資訊。
function describe(state, out, proj, def, prep) {
  const a = RULES.actions[out.action];
  const name = a.name;
  const remaining = proj ? def.target - proj.progress : 0;
  const head = `${name}成功率 ${out.p}%，費用 ${out.cost} Token`;
  switch (out.action) {
    case 'analyze': {
      const extra = cardLevel(state.equipped, 'C1') ? RULES.cards.C1.extraN[cardLevel(state.equipped, 'C1') - 1] : 0;
      const sN = a.success.N + extra;
      const fN = a.failure.N + extra;
      out.stressDelta = a.stress;
      out.outcomes = { success: { B: a.success.B, N: sN }, failure: { B: a.failure.B, N: fN } };
      out.summary = `${head}；成功得準備 +${a.success.B}（可用 ${sN} 次）、失敗得 +${a.failure.B}（可用 ${fN} 次）；壓力不變。`;
      if (prep.N > 0) out.warnings.push(`分析會覆蓋目前準備 B${prep.B}/N${prep.N}：成功變 B${a.success.B}/N${sN}，失敗變 B${a.failure.B}/N${fN}。`);
      break;
    }
    case 'implement':
    case 'rush': {
      const sg = Math.min(a.successP, Math.max(remaining, 0));
      const fg = Math.min(a.failureP, Math.max(remaining, 0));
      out.stressDelta = a.stress;
      out.outcomes = { success: { progress: sg, stress: a.stress }, failure: { progress: fg, stress: a.stress } };
      out.summary = `${head}；成功進度 +${sg}、失敗 +${fg}；兩者都增加 ${a.stress} 壓力。本次有 ${out.q}% 機會留下尚未發現的缺陷。`;
      break;
    }
    case 'verify':
      out.stressDelta = a.stress;
      out.outcomes = { success: { revealAll: true }, failure: {} };
      out.summary = `${head}；成功會把目前未定位的問題全部轉為已知並公開數量，失敗不改變；壓力不變。`;
      break;
    case 'repair':
      out.stressDelta = a.stress;
      out.outcomes = { success: { knownDefects: -1, stress: a.stress }, failure: { stress: a.stress } };
      out.summary = `${head}；成功已知缺陷 −1、失敗不變；兩者都增加 ${a.stress} 壓力。`;
      break;
    case 'rest': {
      const lv = cardLevel(state.equipped, 'C5');
      const tokenGain = Math.min(RULES.token.cap - state.token, a.token + (lv ? RULES.cards.C5.restToken[lv - 1] : 0));
      const stressDrop = Math.min(state.stress, -a.stress);
      out.stressDelta = -stressDrop;
      out.outcomes = { always: { token: tokenGain, stress: -stressDrop } };
      out.summary = `休息不擲骰：Token +${tokenGain}、壓力 −${stressDrop}。`;
      break;
    }
    case 'deliver': {
      const tokenGain = def ? Math.min(RULES.token.cap - state.token, def.rewardToken) : 0;
      out.stressDelta = 0;
      out.outcomes = { pass: { token: tokenGain, score: def?.rewardScore ?? 0 }, reject: { stress: a.rejectStress } };
      out.summary = `交付不擲骰、免費：驗收通過得 Token +${tokenGain}、分數 +${def?.rewardScore ?? 0}；若仍有未定位問題會退件並增加 ${a.rejectStress} 壓力。`;
      if (state.stress + a.rejectStress >= RULES.stress.crashAt) out.warnings.push(`若退件，壓力將達 ${state.stress + a.rejectStress}，立即崩潰。`);
      break;
    }
    default:
      break;
  }
  if (out.usesPreparation) out.warnings.push(`本次會消耗 1 次準備（B+${prep.B}，剩 ${prep.N - 1} 次）。`);
  if (out.stressDelta > 0 && state.stress + out.stressDelta >= RULES.stress.crashAt) {
    out.warnings.push(`此行動會使壓力達到 ${state.stress + out.stressDelta}，立即崩潰。`);
  }
  if (proj && proj.age + 1 >= def.duration && out.action !== 'deliver') {
    out.warnings.push('這是本案最後一個工期行動；回合結束時若未交付即逾期（壓力 +1）。');
  }
}

export function previewAction(state, request) {
  return evaluate(state, request);
}

export function legalActions(state) {
  return ACTION_ORDER.map((action) => {
    const pv = evaluate(state, { action, toggles: {} });
    return { action, legal: pv.legal, reason: pv.reason };
  });
}

// ---- 主要行動：結算 ----

function drawDie(ctx, streamName) {
  const r = drawD100(ctx.state.rng[streamName]);
  ctx.state.rng[streamName] = r.stream;
  ctx.dice.push({ stream: streamName, index: r.index, value: r.value, designated: r.designated });
  return r.value;
}

function consumePreparation(p) {
  p.preparationUses -= 1;
  if (p.preparationUses <= 0) {
    p.preparationUses = 0;
    p.preparationBonus = 0;
  }
}

function grantXp(ctx, milestones) {
  const { state } = ctx;
  if (milestones.length === 0) return;
  const amount = milestones.reduce((s, m) => s + (m === 'delivery' ? 2 : 1), 0);
  const before = state.level;
  state.xp += amount;
  state.level = levelForXp(state.xp);
  state.pendingLevelUps += state.level - before;
  if (state.level > before) ctx.notes.push({ kind: 'levelUp', from: before, to: state.level });
}

function progressMilestones(p, target) {
  const out = [];
  if (!p.halfXpGranted && p.progress >= Math.ceil(target / 2)) {
    p.halfXpGranted = true;
    out.push('half');
  }
  if (!p.fullXpGranted && p.progress >= target) {
    p.fullXpGranted = true;
    out.push('full');
  }
  return out;
}

function handleAction(ctx) {
  const { state, request } = ctx;
  const pv = evaluate(state, request);
  if (!pv.legal) reject(pv.reason.code, pv.reason.message);
  const action = pv.action;
  const a = RULES.actions[action];
  const id = state.activeProject;
  const p = id ? state.projects[id] : null;
  const def = id ? RULES.projects[id] : null;
  state.token -= pv.cost;
  ctx.eventFields = { action, toggles: pv.toggles, cost: pv.cost, p: pv.p, q: pv.q };
  const outcome = { action };
  let milestones = [];

  if (action === 'analyze') {
    const die = drawDie(ctx, 'success');
    outcome.success = die <= pv.p;
    const res = outcome.success ? pv.outcomes.success : pv.outcomes.failure;
    p.preparationBonus = res.B;
    p.preparationUses = res.N;
    Object.assign(outcome, { B: res.B, N: res.N });
  } else if (action === 'implement' || action === 'rush') {
    const die = drawDie(ctx, 'success');
    outcome.success = die <= pv.p;
    const before = p.progress;
    p.progress = Math.min(def.target, p.progress + (outcome.success ? a.successP : a.failureP));
    outcome.progressGained = p.progress - before;
    if (pv.usesPreparation) consumePreparation(p);
    const defectDie = drawDie(ctx, 'defect');
    outcome.defectAdded = defectDie <= pv.q;
    if (outcome.defectAdded) p.hiddenDefects += 1;
    state.stress += a.stress;
    milestones = progressMilestones(p, def.target);
  } else if (action === 'verify') {
    p.firstVerificationUsed = true;
    const die = drawDie(ctx, 'success');
    outcome.success = die <= pv.p;
    if (pv.usesPreparation) consumePreparation(p);
    if (outcome.success) {
      outcome.revealed = p.hiddenDefects;
      p.knownDefects += p.hiddenDefects;
      p.hiddenDefects = 0;
      outcome.message = `驗證成功，定位 ${outcome.revealed} 個問題。`;
      if (!p.qualityXpGranted) {
        p.qualityXpGranted = true;
        milestones = ['quality'];
      }
    } else {
      outcome.message = '驗證未能定位問題；這不代表沒有問題。';
    }
  } else if (action === 'repair') {
    const die = drawDie(ctx, 'success');
    outcome.success = die <= pv.p;
    if (pv.usesPreparation) consumePreparation(p);
    if (outcome.success) p.knownDefects = Math.max(0, p.knownDefects - 1);
    state.stress += a.stress;
  } else if (action === 'rest') {
    const { token, stress } = pv.outcomes.always;
    state.token += token;
    state.stress += stress;
    Object.assign(outcome, { tokenGained: token, stressChange: stress });
  } else if (action === 'deliver') {
    if (p.hiddenDefects === 0) {
      const gain = Math.min(RULES.token.cap - state.token, def.rewardToken);
      state.token += gain;
      state.score += def.rewardScore;
      if (!p.qualityXpGranted) {
        p.qualityXpGranted = true;
        milestones.push('quality');
      }
      p.deliveryRewardGranted = true;
      milestones.push('delivery');
      p.status = 'delivered';
      p.preparationBonus = 0;
      p.preparationUses = 0;
      state.activeProject = null;
      Object.assign(outcome, { delivered: true, tokenGained: gain, scoreGained: def.rewardScore, message: `交付成功：Token +${gain}、分數 +${def.rewardScore}。` });
    } else {
      state.stress += a.rejectStress;
      Object.assign(outcome, { delivered: false, message: '驗收未通過，仍有未定位問題。' });
    }
  }
  outcome.milestones = milestones;
  grantXp(ctx, milestones);
  ctx.outcome = outcome;
  afterResolution(ctx);
}

// 結算後時序：崩潰 → （交付已關案）→ 升級抽選 → 案齡／逾期 → 崩潰 → 期限。
function afterResolution(ctx) {
  if (checkCrash(ctx)) return;
  continueTurn(ctx);
}

function continueTurn(ctx) {
  if (ctx.state.pendingLevelUps > 0) {
    openLevelDraft(ctx);
    return;
  }
  finishTurn(ctx);
}

function levelUpPool(equipped) {
  return CARD_IDS.flatMap((id) => {
    const lv = cardLevel(equipped, id);
    if (lv === 0) return [{ id, level: 1, kind: 'new' }];
    if (lv === 1) return [{ id, level: 2, kind: 'upgrade' }];
    return [];
  });
}

function openLevelDraft(ctx) {
  const { state } = ctx;
  const pool = levelUpPool(state.equipped);
  const draw = drawCard(ctx, pool.map((c) => c.id), RULES.draft.levelUpDraw);
  state.pendingLevelUps -= 1;
  state.pendingDraft = {
    source: 'levelUp',
    candidates: draw.value.map((id) => pool.find((c) => c.id === id)),
    designated: draw.designated,
    drawIndex: draw.index,
  };
  state.phase = 'levelDraft';
}

function finishTurn(ctx) {
  const { state } = ctx;
  const id = state.activeProject;
  if (id) {
    const p = state.projects[id];
    p.age += 1;
    if (p.age >= RULES.projects[id].duration) {
      p.status = 'expired';
      state.activeProject = null;
      state.stress += RULES.expireStress;
      ctx.notes.push({ kind: 'expired', projectId: id, stressDelta: RULES.expireStress });
      if (checkCrash(ctx)) return;
    }
  }
  if (state.turn >= RULES.totalTurns) {
    endGame(state, 'deadline');
    ctx.notes.push({ kind: 'deadline', turn: state.turn });
    return;
  }
  state.turn += 1;
  state.phase = 'turnStart';
  state.turnWindow = { accepted: false, abandoned: false };
}

// ---- 升級抽選 ----

function handleChooseDraft(ctx) {
  const { state, request } = ctx;
  requirePhase(state, 'levelDraft');
  const choice = request.choice;
  const draft = state.pendingDraft;
  const bad = (msg) => reject('invalid_selection', msg);
  if (!choice || (choice.type !== 'take' && choice.type !== 'forfeit')) bad('須選擇一個候選，或放棄本次獎勵');
  const outcome = { choice: choice.type };
  if (choice.type === 'take') {
    const cand = draft.candidates.find((c) => c.id === choice.cardId);
    if (!cand) bad(`${choice.cardId} 不在本次候選中`);
    if (cand.kind === 'upgrade') {
      if (choice.replace !== undefined) bad('升級現有工具不需要替換');
      state.equipped.find((c) => c.id === cand.id).level = 2;
    } else if (state.equipped.length < RULES.slots) {
      if (choice.replace !== undefined) bad('還有空槽，不能替換');
      state.equipped.push({ id: cand.id, level: 1 });
    } else {
      const idx = state.equipped.findIndex((c) => c.id === choice.replace);
      if (idx < 0) bad('工具槽已滿：須指定要替換的已裝備卡，或放棄本次獎勵');
      state.equipped.splice(idx, 1);
      state.equipped.push({ id: cand.id, level: 1 });
      outcome.replaced = choice.replace;
    }
    Object.assign(outcome, { cardId: cand.id, level: cand.level, kind: cand.kind });
  }
  state.pendingDraft = null;
  ctx.outcome = outcome;
  continueTurn(ctx);
}

// ---- 共用 ----

function requirePhase(state, ...phases) {
  const problem = phaseProblem(state, phases);
  if (problem) reject(problem.code, problem.message);
}

function drawCard(ctx, pool, k) {
  const r = drawSample(ctx.state.rng.card, pool, k);
  ctx.state.rng.card = r.stream;
  ctx.dice.push({ stream: 'card', index: r.index, value: r.value, designated: r.designated });
  return r;
}

const HANDLERS = {
  setAttributes: handleSetAttributes,
  chooseOpening: handleChooseOpening,
  earlySettle: handleEarlySettle,
  abandon: handleAbandon,
  accept: handleAccept,
  action: handleAction,
  chooseDraft: handleChooseDraft,
};

function requestPayload(request) {
  const { operationId, expectedStateVersion, ...rest } = request;
  return rest;
}

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function fingerprint(request) {
  const { operationId, ...rest } = request;
  return stableStringify(rest);
}

// 錯誤也要快取：同 operationId 重送永遠回第一次的結果。錯誤不是狀態轉移，不加 stateVersion。
function cacheFailure(state, request, fp, code, message) {
  const result = { ok: false, error: { code, message } };
  const next = {
    ...state,
    operationResults: { ...state.operationResults, [request.operationId]: { fingerprint: fp, result } },
    log: { ...state.log, requests: [...state.log.requests, structuredClone(request)] },
  };
  return { state: next, result };
}

export function submit(state, request) {
  if (!request || typeof request !== 'object' || typeof request.operationId !== 'string' || request.operationId === '') {
    return { state, result: { ok: false, error: { code: 'invalid_request', message: '請求缺少 operationId' } } };
  }
  const fp = fingerprint(request);
  const cached = state.operationResults[request.operationId];
  if (cached) {
    if (cached.fingerprint === fp) return { state, result: cached.result, duplicate: true };
    return { state, result: { ok: false, error: { code: 'operation_id_conflict', message: `operationId ${request.operationId} 已用於不同內容的請求` } } };
  }
  const handler = HANDLERS[request.type];
  if (!handler) return cacheFailure(state, request, fp, 'invalid_request', `未知的操作類型：${request.type}`);
  if (request.expectedStateVersion !== state.stateVersion) {
    return cacheFailure(state, request, fp, 'stale_state_version', `狀態版本已過期（請求 ${request.expectedStateVersion}，目前 ${state.stateVersion}）`);
  }
  const draft = structuredClone(state);
  const ctx = { state: draft, request, dice: [], outcome: null, notes: [], eventFields: {} };
  const before = snapshot(state);
  try {
    handler(ctx);
  } catch (e) {
    if (!(e instanceof Rejection)) throw e;
    return cacheFailure(state, request, fp, e.code, e.message);
  }
  draft.stateVersion += 1;
  const event = {
    seq: draft.events.length + 1,
    ruleVersion: RULE_VERSION,
    operationId: request.operationId,
    type: request.type,
    request: requestPayload(request),
    turn: before.turn,
    ...ctx.eventFields,
    before,
    after: snapshot(draft),
    dice: ctx.dice,
    outcome: ctx.outcome,
    notes: ctx.notes,
  };
  draft.events.push(event);
  draft.log.requests.push(structuredClone(request));
  const result = { ok: true, eventSeq: event.seq, stateVersion: draft.stateVersion };
  draft.operationResults[request.operationId] = { fingerprint: fp, result };
  return { state: draft, result };
}
