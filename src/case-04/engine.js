import { createStream, randomSeed } from '../core/rng.js';
import { initializeCaseAttempts, previewCaseAttempt, runCaseAttempt } from '../core/case-attempt.js';
import { choosePendingRunReward, grantRunProgress, initializeRunRewards } from '../career/run-rewards.js';
import { applySpendRefund } from '../career/card-runtime.js';
import { CARDS } from '../career/cards.js';
import { TEMPLATES } from '../narrative/rules.js';
import { CASE04_ACTIONS, CASE04_ENDINGS, CASE04_LIMITS, CASE04_RULE_VERSION, STRATEGIES, case04StartingResources } from './rules.js';

const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cardLevel = (state, id) => state.equipped.includes(id) ? (state.cards[id] ?? 0) : 0;
const requestPayload = (actionId, raw) => JSON.stringify({ actionId, ...Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'stateVersion')) });

const FAILURE_EVENTS = Object.freeze({
  D01: [{ id: 'log-lies-by-omission', weight: 50 }, { id: 'only-on-prod-friday', weight: 50 }],
  D02: [{ id: 'strategy-fights-history', weight: 55 }, { id: 'owner-left-last-year', weight: 45 }],
  D03: [{ id: 'agents-disagree-politely', weight: 50 }, { id: 'fix-breaks-nightly-job', weight: 50 }],
  D05: [{ id: 'requirement-was-wrong', weight: 50 }, { id: 'deploy-config-twin', weight: 50 }],
  D07: [{ id: 'green-on-wrong-revision', weight: 55 }, { id: 'fixture-forgot-old-data', weight: 45 }],
  D06: [{ id: 'consequence-has-sequel', weight: 100 }],
  D08: [{ id: 'handoff-missing-switch', weight: 55 }, { id: 'runbook-says-ask-alex', weight: 45 }],
  D10: [{ id: 'old-row-breaks-rollback', weight: 55 }, { id: 'migration-wrote-new-shape', weight: 45 }],
});

const ACTION_CONFIG = Object.freeze({
  D01: { ability: 'A', base: 42 }, D02: { ability: 'A', base: 45 }, D03: { ability: 'E', base: 42 },
  D05: { ability: 'A', base: 40 }, D07: { ability: 'V', base: 42 }, D06: { ability: 'E', base: 48 }, D08: { ability: 'V', base: 48 },
  D10: { ability: 'V', base: 52 },
});

function abilityCardBonus(state, ability) {
  const ids = ability === 'A' ? ['C1', 'C8', 'C11', 'C18'] : ability === 'E' ? ['C2', 'C4', 'C10', 'C15'] : ['C3', 'C6', 'C9', 'C12'];
  return ids.reduce((sum, id) => sum + (cardLevel(state, id) ? 4 + cardLevel(state, id) * 2 : 0), 0);
}

function attemptConfig(state, actionId, options = {}) {
  const config = ACTION_CONFIG[actionId];
  let bonus = abilityCardBonus(state, config.ability);
  if (actionId === 'D02') bonus += STRATEGIES[options.strategy]?.bonus ?? 0;
  if (actionId === 'D03') bonus += STRATEGIES[state.strategy]?.bonus ?? 0;
  if (actionId === 'D05' && cardLevel(state, 'C7')) bonus += cardLevel(state, 'C7') >= 2 ? 15 : 10;
  if (actionId === 'D07' && options.scope === 'full') bonus += 8;
  return {
    actionId,
    semanticKey: actionId,
    ability: config.ability,
    baseChance: config.base,
    modifiers: bonus ? [{ id: 'cards-strategy', label: '公開策略與工具卡', value: bonus }] : [],
    events: FAILURE_EVENTS[actionId],
    boundaryAction: ['D01', 'D02', 'D05', 'D08'].includes(actionId),
    separateFailureDraw: true,
  };
}

function previewAttempt(state, actionId, preview, options = {}) {
  const attempt = previewCaseAttempt(state, attemptConfig(state, actionId, options));
  const retryDiscount = attempt.retry && cardLevel(state, 'C13') ? 1 : 0;
  return { ...preview, token: Math.max(1, preview.token - retryDiscount), time: Math.max(0, preview.time - attempt.retryTimeDiscount), attempt };
}

function issue(state, id, text, severity = 1) {
  const found = state.issues.find((item) => item.id === id);
  if (found) { found.status = 'open'; found.severity = Math.max(found.severity, severity); return; }
  state.issues.push({ id, text, severity, status: 'open', sourceRevision: state.revision });
}
function resolveIssue(state, id) { const found = state.issues.find((item) => item.id === id); if (found) found.status = 'resolved'; }
function openIssues(state) { return state.issues.filter((item) => item.status === 'open'); }

function validApproval(state, scopes = ['verified', 'limited']) {
  return Boolean(state.approval?.status === 'approved'
    && state.approval.revision === state.revision
    && scopes.includes(state.approval.scope));
}

function safeRollbackCompatibility(state) {
  if (state.strategy !== 'rollback') return true;
  return Boolean(state.compatibilityDecision?.revision === state.revision
    && state.compatibilityDecision.status === 'decided'
    && ['compatible', 'adapter', 'isolated'].includes(state.dataCompatibility));
}

function invalidateApproval(state, reason) {
  if (state.approval?.status !== 'approved') return;
  state.approval = { ...state.approval, status: 'stale', invalidatedBy: reason };
}

function advanceRevision(state, reason) {
  state.revision += 1;
  state.evidence.revision = null;
  invalidateApproval(state, reason);
  if (state.strategy === 'rollback' && state.compatibilityDecision) {
    state.compatibilityDecision = { ...state.compatibilityDecision, status: 'stale', invalidatedBy: reason };
    state.dataCompatibility = 'must-check';
  }
}

function progress(state, actionId) {
  const key = { D01: 'incident_scoped', D02: 'strategy_committed', D03: 'service_stabilized', D05: 'root_cause_decided', D07: 'current_evidence', D08: 'handoff_ready' }[actionId];
  if (key) grantRunProgress(state, key);
}

function result(title, summary, process, outcome, attempt = null) { return { title, summary, process, outcome, ...(attempt ? { attempt } : {}) }; }
function process(player, response, followUp, consequence) { return { player, response, followUp, consequence }; }

function actionAvailable(state, actionId) {
  if (state.phase !== 'playing' || state.pendingReward) return false;
  if (actionId === 'D01') return !state.diagnosis;
  if (actionId === 'D02') return Boolean(state.diagnosis && !state.strategy);
  if (actionId === 'D10') return Boolean(state.strategy === 'rollback' && !state.service.attempted && !safeRollbackCompatibility(state));
  if (actionId === 'D03') return Boolean(state.strategy && !state.service.attempted && safeRollbackCompatibility(state));
  if (actionId === 'D04') return Boolean(state.service.attempted && !state.story.commitment && safeRollbackCompatibility(state));
  if (actionId === 'D11') return Boolean(state.story.commitment && state.service.stable && !validApproval(state, ['verified'])
    && safeRollbackCompatibility(state));
  if (actionId === 'D05') return Boolean(state.story.commitment && (!state.rootCause || !state.rootCause.confirmed));
  if (actionId === 'D07') return Boolean(state.rootCause && (state.evidence.revision !== state.revision || state.evidence.coverage < 4 || state.evidence.failed.length));
  if (actionId === 'D06') return Boolean(state.story.pendingConsequence?.revealed && !state.story.pendingConsequence.resolved);
  if (actionId === 'D08') return Boolean(state.story.pendingConsequence?.resolved && state.evidence.revision === state.revision && !state.handoff.complete);
  if (actionId === 'D09') return true;
  return false;
}

function observeLaterWork(state, actionId) {
  if (!state.story.commitment || !state.story.pendingConsequence || state.story.pendingConsequence.resolved) return;
  if (!['D05', 'D07', 'D08'].includes(actionId)) return;
  state.story.followUpWork += 1;
  if (state.story.followUpWork >= 2 && !state.story.pendingConsequence.revealed) {
    state.story.pendingConsequence.revealed = true;
    if (state.story.pendingConsequence.id === 'schema-drift') {
      state.dataCompatibility = 'unsafe';
      if (state.compatibilityDecision) state.compatibilityDecision = { ...state.compatibilityDecision, status: 'stale', invalidatedBy: 'schema-drift-revealed' };
      invalidateApproval(state, 'schema-drift-revealed');
    }
  }
}

export function createCase04Game(options = {}) {
  if (!TEMPLATES[options.templateId]) throw new Error('未知角色');
  const cards = clone(options.cards ?? {});
  const equipped = (options.equipped ?? []).filter((id) => cards[id] && CARDS[id]?.cases.includes('case-04')).slice(0, 3);
  const seed = Number.isInteger(options.seed) ? options.seed >>> 0 : randomSeed();
  const initialResources = case04StartingResources(options.templateId);
  const state = {
    caseId: 'case-04', ruleVersion: CASE04_RULE_VERSION, phase: 'playing', templateId: options.templateId,
    abilities: clone(TEMPLATES[options.templateId].attrs), initialResources: clone(initialResources),
    token: initialResources.token,
    stress: initialResources.stress,
    timeLeft: initialResources.time,
    cards, equipped, diagnosis: null, strategy: null, service: { attempted: false, stable: false, mode: null }, rootCause: null,
    revision: 1, dataCompatibility: 'unknown', compatibilityDecision: null,
    approval: { status: 'pending', scope: null, revision: null, owner: null },
    evidence: { revision: null, coverage: 0, failed: [] }, handoff: { complete: false },
    issues: [], story: { outcome: null, commitment: null, followUpWork: 0, pendingConsequence: null, history: [] },
    ledger: [], rewardClaims: [], rewardLedgerSnapshot: clone(options.rewardLedger ?? []), pendingReward: null, rewardFallback: null, careerRewards: [],
    stateVersion: 0, operationResults: {}, operationPayloads: {}, log: [], ending: null, cardUsage: {},
    seed, rng: { event: createStream(options.eventRolls ? { values: options.eventRolls } : { seed }) },
  };
  initializeCaseAttempts(state);
  return initializeRunRewards(state);
}

export function previewCase04Action(state, actionId, options = {}) {
  if (!CASE04_ACTIONS[actionId]) throw new Error('未知工作');
  if (!actionAvailable(state, actionId)) throw new Error('目前局勢尚未開啟這項工作');
  if (actionId === 'D01') {
    if (!['logs', 'reproduce'].includes(options.method)) throw new Error('請先選診斷方法');
    return previewAttempt(state, actionId, { token: 2, time: options.method === 'reproduce' ? 2 : 1, stress: 0 }, options);
  }
  if (actionId === 'D02') {
    const strategy = STRATEGIES[options.strategy]; if (!strategy) throw new Error('請先選救火策略');
    return previewAttempt(state, actionId, { token: strategy.token, time: strategy.time, stress: strategy.stress }, options);
  }
  if (actionId === 'D03') {
    if (!['parallel', 'sequential'].includes(options.agentMode)) throw new Error('請先選擇模擬 agent 分工');
    const strategy = STRATEGIES[state.strategy];
    return previewAttempt(state, actionId, { token: strategy.token + (options.agentMode === 'parallel' ? 1 : 0), time: Math.max(1, strategy.time - (options.agentMode === 'parallel' ? 1 : 0)), stress: strategy.stress + (options.agentMode === 'parallel' ? 1 : 0) }, options);
  }
  if (actionId === 'D10') {
    if (!['inspect', 'isolate'].includes(options.compatibility)) throw new Error('請選擇資料相容處理');
    return previewAttempt(state, actionId, {
      token: options.compatibility === 'inspect' ? 2 : 1,
      time: 1,
      stress: options.compatibility === 'isolate' ? 1 : 0,
    }, options);
  }
  if (actionId === 'D04') {
    const allowed = state.story.outcome === 'success' ? ['freeze', 'improve', ...(cardLevel(state, 'C5') ? ['pace'] : [])] : ['alternate', 'hard'];
    if (!allowed.includes(options.route)) throw new Error('請先選擇後續路線');
    return { token: options.route === 'pace' ? 0 : options.route === 'improve' || options.route === 'hard' ? 2 : 1, time: 1, stress: options.route === 'hard' ? 2 : options.route === 'improve' ? 1 : 0 };
  }
  if (actionId === 'D05') {
    if (!['code', 'requirement', 'deploy'].includes(options.cause)) throw new Error('請裁決根因');
    return previewAttempt(state, actionId, { token: cardLevel(state, 'C7') ? 1 : 2, time: 1, stress: 0 }, options);
  }
  if (actionId === 'D07') {
    if (!['focused', 'full'].includes(options.scope)) throw new Error('請選擇回歸範圍');
    return previewAttempt(state, actionId, { token: options.scope === 'full' ? 2 : 1, time: options.scope === 'full' ? 2 : 1, stress: 0 }, options);
  }
  if (actionId === 'D06') {
    const rescueCard = cardLevel(state, 'C4') || cardLevel(state, 'C15');
    if (!['contain', 'repair', ...(rescueCard ? ['isolate'] : [])].includes(options.response)) throw new Error('請選擇處理方式');
    return previewAttempt(state, actionId, {
      token: options.response === 'repair' ? 2 : 1,
      time: options.response === 'isolate' ? 0 : 1,
      stress: options.response === 'contain' ? 1 : 0,
    }, options);
  }
  if (actionId === 'D08') {
    if (!['minimal', 'complete'].includes(options.depth)) throw new Error('請選擇交接深度');
    return previewAttempt(state, actionId, { token: 1, time: 0, stress: 0 }, options);
  }
  if (actionId === 'D11') {
    if (!['verified', 'limited'].includes(options.proposal)) throw new Error('請選擇要請負責人核准的範圍');
    if (!safeRollbackCompatibility(state)) throw new Error('回滾資料相容尚未形成安全決策');
    return { token: 0, time: 0, stress: 0 };
  }
  if (actionId === 'D09') {
    if (!['verified', 'limited', 'risk', 'stop'].includes(options.intent)) throw new Error('請選擇結案方式');
    if (options.intent === 'verified' && blockers(state).length) throw new Error(`正式交付尚缺：${blockers(state).join('；')}`);
    if (options.intent === 'limited' && limitedBlockers(state).length) throw new Error(`有限維持尚缺：${limitedBlockers(state).join('；')}`);
    return { token: 0, time: 0, stress: 0 };
  }
  throw new Error('未知工作');
}

function spend(state, preview) {
  if (state.token < preview.token) throw new Error(`Token 不足：需要 ${preview.token}`);
  if (state.timeLeft < preview.time) throw new Error(`時間不足：需要 ${preview.time}`);
  state.token -= preview.token; state.timeLeft -= preview.time; state.stress = clamp(state.stress + preview.stress, 0, CASE04_LIMITS.stressCap);
  const refund = applySpendRefund(state, { cards: state.cards, equipped: state.equipped, tokenCost: preview.token }); Object.assign(state, refund.state);
  return refund.refunded;
}

function runAttempt(state, actionId, options) {
  const attempt = runCaseAttempt(state, { ...attemptConfig(state, actionId, options), operationId: `attempt:${actionId}:${state.stateVersion}` });
  state.lastAttempt = attempt; return attempt;
}

function consequenceFor(strategy) {
  return {
    patch: { id: 'patch-coupling', text: '補丁碰到夜間批次的同一段祖傳判斷' },
    investigate: { id: 'wrong-requirement', text: '現行需求與客戶真正想要的行為不一致' },
    refactor: { id: 'scheduler-gap', text: '重構切片漏掉排程器的舊入口' },
    rollback: { id: 'schema-drift', text: '新版資料已寫入，單純回滾程式無法讀取' },
  }[strategy];
}

function publicResult(state, actionId, options, attempt) {
  const success = !attempt || attempt.outcome === 'success';
  if (actionId === 'D01') {
    state.diagnosis = { method: options.method, scoped: success };
    if (!success) issue(state, 'incident-uncertain', '事故只能部分重現；仍可先選保守策略');
    return result(success ? '事故終於肯在測試環境出現' : '事故只在你轉頭時出現', success ? '已取得可追溯的重現步驟。' : 'log 與重現互相推卸責任，但已留下公開限制。', process('你要求時間、輸入與 revision 都寫清楚。', '程式 agent 說是空值；部署 agent 說昨天設定沒改。', '下一步選策略，不把猜測當根因。', '事故範圍已記錄。'), attempt.outcome, attempt);
  }
  if (actionId === 'D02') {
    state.strategy = options.strategy;
    if (options.strategy === 'rollback') state.dataCompatibility = 'must-check';
    if (!success) issue(state, 'strategy-risk', '策略與舊系統依賴衝突');
    return result(`${STRATEGIES[options.strategy].label}已上桌`, success ? '策略與可接受風險已公開。' : '策略可做，但先留下依賴風險。', process('你說明這條路會保什麼、犧牲什麼。', '三位模擬 agent 各自點頭，方向卻不完全相同。', '執行時仍需驗證服務與資料。', '策略不會自動變成成功。'), attempt.outcome, attempt);
  }
  if (actionId === 'D03') {
    state.service.attempted = true; state.service.mode = options.agentMode; state.service.stable = success;
    if (!success) issue(state, 'service-unstable', '服務仍會在特定輸入失敗', 2);
    if (state.strategy === 'patch') issue(state, 'patch-coupling', '快速補丁與夜間批次共用祖傳判斷');
    if (state.strategy === 'refactor') state.revision += 1;
    state.story.outcome = success ? 'success' : 'failure';
    return result(success ? '服務先站起來了' : '服務站起來又坐回去', success ? '第一輪穩定化有效，現在要決定收手或加碼。' : '失敗已開出轉向與硬做兩條路。', process('你把程式、測試、部署拆給模擬 agent。', options.agentMode === 'parallel' ? '三份診斷同時回來，其中兩份互相矛盾。' : '逐份診斷較慢，但依賴順序可追。', '下一步由玩家決定是否收手、改善或換方法。', '模擬 agent 不替你選根因。'), attempt.outcome, attempt);
  }
  if (actionId === 'D10') {
    const compatibility = success ? (options.compatibility === 'inspect' ? 'compatible' : 'isolated') : 'unsafe';
    state.dataCompatibility = compatibility;
    state.compatibilityDecision = {
      method: options.compatibility,
      status: success ? 'decided' : 'failed',
      result: compatibility,
      revision: state.revision,
      owner: '玩家／值班工程師',
    };
    if (success && options.compatibility === 'inspect') resolveIssue(state, 'rollback-data-unsafe');
    else issue(state, 'rollback-data-unsafe', success ? '回滾版已隔離寫入；新功能暫停且限制須公開' : '舊資料或新版 schema 尚未證明可由回滾版安全讀寫', 2);
    return result(success ? '回滾終於先問過資料答不答應' : '相容檢查拒絕替回滾背書', success ? (options.compatibility === 'inspect' ? '目前 revision 的舊／新資料樣本相容。' : '已停止新寫入並隔離資料路徑；只能走有限維持。') : '資料仍不安全；可重查、改用隔離，或止損。', process('你明確選擇讀寫相容檢查或安全隔離。', '資料 agent 只能提供證據，不能自己宣布可上線。', '相容決策綁定目前 revision；改版後必須重做。', '失敗不會被服務綠燈掩蓋。'), attempt.outcome, attempt);
  }
  if (actionId === 'D04') {
    state.story.commitment = options.route; state.story.followUpWork = 0;
    const consequence = consequenceFor(state.strategy); state.story.pendingConsequence = { ...consequence, revealed: false, resolved: false };
    if (options.route === 'freeze') state.service.stable = true;
    if (options.route === 'improve') { advanceRevision(state, 'success-expansion'); issue(state, 'extra-change', '成功後追加改善尚未驗證'); }
    if (options.route === 'pace') { const recovered = 1 + (cardLevel(state, 'C5') >= 2 ? 1 : 0); state.token = Math.min(CASE04_LIMITS.tokenCap, state.token + recovered); state.stress = Math.max(0, state.stress - 1); state.service.stable = true; }
    if (options.route === 'alternate') { state.service.stable = true; resolveIssue(state, 'service-unstable'); issue(state, 'limited-mode', '服務以關閉部分功能維持'); }
    if (options.route === 'hard') { issue(state, 'forced-fix', '硬做留下未驗證路徑', 2); state.service.stable = true; }
    return result('你真的選了一條路，不是按「再試一次」', options.route === 'pace' ? '節奏管理用一段時間換回資源；承諾仍會在兩次後續工作後回來收帳。' : '承諾已記錄；它會在兩次後續工作後回來收帳。', process('你選擇公開代價而不是藏在 commit message。', options.route === 'pace' ? '值班群組真的休整一段，而不是在 Slack 打「先休息一下」。' : '值班群組終於知道今晚保什麼。', '先裁決根因並重跑證據。', '後果尚未觸發，但不會被刷新洗掉。'), options.route);
  }
  if (actionId === 'D05') {
    state.rootCause = { cause: options.cause, confirmed: success };
    if (success) resolveIssue(state, 'incident-uncertain'); else issue(state, 'root-cause-disputed', '程式、測試與部署診斷仍矛盾');
    if (options.cause === 'requirement') issue(state, 'acceptance-mismatch', '驗收文字與實際需求不一致');
    return result(success ? '根因有名字，也有責任人' : '三份診斷一致同意彼此不一致', success ? '裁決已形成可驗證假設。' : '仍可測目前假設，不會卡死。', process('你要求每個 agent 提供反證。', '程式、測試、部署各自交出一份公開診斷。', '現在用目前 revision 的回歸驗證裁決。', '失敗保留矛盾，不把多數決當真相。'), attempt.outcome, attempt);
  }
  if (actionId === 'D07') {
    state.evidence = { revision: state.revision, coverage: success ? (options.scope === 'full' ? 4 : 2) : 1, failed: success ? [] : ['legacy-regression'] };
    if (success) resolveIssue(state, 'service-unstable'); else issue(state, 'regression-failure', '目前 revision 回歸仍失敗', 2);
    return result(success ? '綠燈終於照在正確 revision 上' : '測試是紅的，但至少不是昨天的綠', success ? '目前版已有可引用證據。' : '失敗結果可用於後果處理與有限維持。', process('你確認測試對的是目前 revision。', '測試 agent 報告覆蓋與失敗清單。', '早期策略的後果現在可能浮現。', '證據只證明實際跑過的範圍。'), attempt.outcome, attempt);
  }
  if (actionId === 'D06') {
    const pending = state.story.pendingConsequence;
    if (success) {
      if (options.response === 'repair') {
        resolveIssue(state, pending.id);
        if (state.story.commitment === 'improve') resolveIssue(state, 'extra-change');
        advanceRevision(state, `repair-${pending.id}`);
        if (pending.id === 'schema-drift') {
          state.dataCompatibility = 'compatible';
          state.compatibilityDecision = { method: 'repair', status: 'decided', result: 'compatible', revision: state.revision, owner: '玩家／值班工程師' };
        }
      }
      else if (options.response === 'isolate') { issue(state, `${pending.id}-isolated`, `${pending.text} 已由救援卡鎖在隔離接點；功能限制仍公開`); resolveIssue(state, pending.id); }
      else { issue(state, `${pending.id}-contained`, `${pending.text} 已隔離但尚未根治`); resolveIssue(state, pending.id); }
      pending.resolved = true;
      if (pending.id === 'schema-drift' && options.response !== 'repair') {
        state.dataCompatibility = options.response === 'isolate' ? 'isolated' : 'adapter';
        state.compatibilityDecision = { method: options.response, status: 'decided', result: state.dataCompatibility, revision: state.revision, owner: '玩家／值班工程師' };
      }
    } else issue(state, pending.id, pending.text, 2);
    return result(success ? '早期選擇回來了，也真的付了代價' : '後果有續集，萬用 repair 請假', success ? '只處理對應問題；其他缺口仍在。' : '可付費重試或選隔離，沒有被清空。', process('你對照當時的策略承諾。', '舊系統交出延後出現的副作用。', '若 revision 改變，必須重跑證據。', '處理結果記在具名問題上。'), attempt.outcome, attempt);
  }
  if (actionId === 'D08') {
    state.handoff.complete = success;
    if (!success) issue(state, 'handoff-gap', '交接缺少回復開關或資料相容說明'); else resolveIssue(state, 'handoff-gap');
    return result(success ? '下一班不用靠通靈接手' : 'Runbook 最後一行仍然是「問 Alex」', success ? '目前版、限制與回復方式已對齊。' : '可補交接或有限維持。', process('你整理 revision、開關、資料與責任人。', '值班 agent 用陌生人視角照表操作。', '最後依公開缺口選擇交付層級。', '交接品質不會改寫服務真相。'), attempt.outcome, attempt);
  }
  if (actionId === 'D11') {
    const reasons = approvalProposalBlockers(state, options.proposal);
    const limitedReady = approvalProposalBlockers(state, 'limited').length === 0;
    if (reasons.length) {
      state.approval = {
        status: 'changes-requested',
        decision: 'rejected',
        proposal: options.proposal,
        scope: null,
        revision: state.revision,
        owner: '客戶／產品負責人',
        decidedBy: 'NPC 負責人（非模擬 agent）',
        reasons: reasons.slice(0, 6),
        suggestedScope: options.proposal === 'verified' && limitedReady ? 'limited' : null,
      };
      state.story.history.push({ type: 'scope-approval', revision: state.revision, proposal: options.proposal, decision: 'rejected', reasons: reasons.slice(0, 6) });
      return result('產品負責人退回提案，請補件再送', `${reasons.join('；')}。${state.approval.suggestedScope === 'limited' ? '目前條件可改提有限維持範圍。' : '完成公開缺口後可重新提案。'}`, process('你把目前範圍、限制與版本交給真正負責人決定。', '客戶／產品負責人依公開缺口退回；模擬 agent 沒有代簽。', state.approval.suggestedScope === 'limited' ? '可縮限重提，或補齊完整範圍所需條件。' : '先完成列出的補件，再用同一公開流程重提。', '退回不扣技術資源、不給 EXP，也不會把風險藏起來。'), 'changes-requested');
    }
    state.approval = {
      status: 'approved',
      decision: 'approved',
      proposal: options.proposal,
      scope: options.proposal,
      revision: state.revision,
      owner: '客戶／產品負責人',
      decidedBy: 'NPC 負責人（非模擬 agent）',
      reasons: [],
      suggestedScope: null,
    };
    state.story.history.push({ type: 'scope-approval', revision: state.revision, proposal: options.proposal, decision: 'approved' });
    return result(options.proposal === 'verified' ? '產品負責人核准目前完整範圍' : '產品負責人核准有限維持範圍', options.proposal === 'verified' ? '核准綁定目前 revision；任何程式或資料變更都要重新確認。' : '關閉功能與資料限制已寫進核准，不會冒充完整交付。', process('你把目前範圍、限制與版本交給真正負責人決定。', '客戶／產品負責人明確留下核准；模擬 agent 沒有代簽。', '技術條件已對齊，接著可依核准層級結案。', '若 revision 或資料相容狀態改變，這份核准會失效。'), 'approved');
  }
  return null;
}

function blockers(state, includeApproval = true) {
  const result = openIssues(state).map((item) => item.text);
  if (!state.service.stable) result.unshift('服務尚未穩定');
  if (!state.rootCause?.confirmed) result.push('根因尚未形成可驗證裁決');
  if (state.evidence.revision !== state.revision || state.evidence.coverage < 4 || state.evidence.failed.length) result.push('目前 revision 缺完整回歸證據');
  if (!state.story.pendingConsequence?.resolved) result.push('早期策略的延後後果尚未處理');
  if (state.strategy === 'rollback' && !['compatible', 'adapter'].includes(state.dataCompatibility)) result.push('回滾尚未證明資料／schema 相容');
  if (!state.handoff.complete) result.push('值班交接尚未完成');
  if (includeApproval && !validApproval(state, ['verified'])) result.push('目前 revision 尚未取得客戶／產品負責人完整範圍核准');
  return [...new Set(result)];
}

function approvalProposalBlockers(state, proposal) {
  const result = [];
  if (!state.service.stable) result.push('服務尚未穩定，負責人不接受此範圍');
  if (!safeRollbackCompatibility(state)) result.push('回滾資料安全尚未形成相容或隔離決策');
  if (proposal === 'verified') {
    if (!state.rootCause?.confirmed) result.push('完整範圍仍缺可驗證根因');
    if (state.evidence.revision !== state.revision || state.evidence.coverage < 2 || state.evidence.failed.length) result.push('完整範圍仍缺目前 revision 的可引用證據');
    if (state.story.pendingConsequence?.revealed && !state.story.pendingConsequence.resolved) result.push('已揭露的策略後果尚未處理');
    if (openIssues(state).some((item) => ['limited-mode', 'forced-fix', 'rollback-data-unsafe'].includes(item.id) || item.id.endsWith('-contained') || item.id.endsWith('-isolated'))) result.push('目前公開限制只適合縮限範圍');
  }
  return [...new Set(result)];
}

function limitedBlockers(state, includeApproval = true) {
  const result = [];
  if (!state.service.stable) result.push('服務尚未穩定');
  if (!state.story.pendingConsequence?.resolved) result.push('早期策略的延後後果尚未處理');
  if (state.evidence.revision !== state.revision) result.push('目前 revision 尚無可交接證據');
  if (!state.handoff.complete) result.push('有限維持也必須完成值班交接');
  if (!safeRollbackCompatibility(state)) result.push('回滾資料／schema 尚未形成安全相容或隔離決策');
  if (includeApproval && !validApproval(state, ['verified', 'limited'])) result.push('目前 revision 尚未取得客戶／產品負責人範圍核准');
  return [...new Set(result)];
}

function ending(state, intent) {
  if (intent === 'verified' && blockers(state).length) throw new Error(`正式交付尚缺：${blockers(state).join('；')}`);
  if (intent === 'limited' && limitedBlockers(state).length) throw new Error(`有限維持尚缺：${limitedBlockers(state).join('；')}`);
  const baseId = intent === 'verified' ? 'C04-VERIFIED' : intent === 'limited' ? 'C04-LIMITED' : intent === 'risk' ? 'C04-FAILED' : 'C04-STOP';
  const base = CASE04_ENDINGS[baseId];
  const routeTitles = { patch: '補丁疊補丁，至少每層都有標籤', investigate: '祖傳程式馴獸師', refactor: '上線前一天重構的人還活著', rollback: '回滾救世主，先問資料答不答應' };
  const strategy = state.strategy && STRATEGIES[state.strategy];
  return {
    baseId,
    ...base,
    playFacets: [{
      id: `strategy-${state.strategy ?? 'unselected'}`,
      title: routeTitles[state.strategy] ?? '先保留現場，再決定怎麼救',
      text: strategy
        ? `你走過 ${strategy.label}；延後後果與未解問題都保留在公開紀錄。`
        : '你在選定救火策略前先止損；尚未完成的判斷與下一步都保留在公開紀錄。',
    }],
  };
}

export function performCase04Action(original, actionId, raw = {}) {
  if (typeof raw.operationId !== 'string' || !raw.operationId) throw new Error('operationId 必填');
  const payload = requestPayload(actionId, raw);
  if (original.operationResults[raw.operationId]) {
    if (original.operationPayloads[raw.operationId] !== payload) throw new Error('operation_id_conflict');
    return { state: clone(original), result: clone(original.operationResults[raw.operationId]), cached: true };
  }
  if (raw.stateVersion !== original.stateVersion) throw new Error('stale_state_version');
  if (original.pendingReward) throw new Error('請先處理目前的成長獎勵');
  const state = clone(original);
  const resourcesBefore = { token: state.token, stress: state.stress, time: state.timeLeft };
  const preview = previewCase04Action(state, actionId, raw);
  const refunded = spend(state, preview);
  const resourceCost = { token: preview.token, time: preview.time, stress: preview.stress };
  if (actionId === 'D09') {
    state.ending = ending(state, raw.intent); state.phase = 'ended';
    if (raw.intent === 'verified') state.ledger.push('verified_delivery');
    const output = result(state.ending.title, state.ending.text, process('你選擇與證據相符的結案方式。', '值班表接受目前狀態。', '職涯保留卡片與 EXP，短期資源歸零。', '故事稱號不會蓋過交付事實。'), raw.intent);
    const resourceAdjustment = {
      token: state.token - (resourcesBefore.token - resourceCost.token),
      time: state.timeLeft - (resourcesBefore.time - resourceCost.time),
      stress: state.stress - Math.min(CASE04_LIMITS.stressCap, resourcesBefore.stress + resourceCost.stress),
    };
    state.stateVersion += 1; state.operationPayloads[raw.operationId] = payload; state.operationResults[raw.operationId] = clone(output); state.log.push({ actionId, options: { intent: raw.intent }, resourceCost, resourceAdjustment, resources: { token: state.token, stress: state.stress, time: state.timeLeft } });
    return { state, result: output, cached: false };
  }
  let attempt = null;
  if (!['D04', 'D11'].includes(actionId)) attempt = runAttempt(state, actionId, raw);
  const output = publicResult(state, actionId, raw, attempt);
  progress(state, actionId); observeLaterWork(state, actionId);
  if (refunded) output.summary += ` Token 反芻胃返還 ${refunded} Token。`;
  const resourceAdjustment = {
    token: state.token - (resourcesBefore.token - resourceCost.token),
    time: state.timeLeft - (resourcesBefore.time - resourceCost.time),
    stress: state.stress - Math.min(CASE04_LIMITS.stressCap, resourcesBefore.stress + resourceCost.stress),
  };
  state.stateVersion += 1; state.operationPayloads[raw.operationId] = payload; state.operationResults[raw.operationId] = clone(output);
  state.log.push({ actionId, outcome: output.outcome, options: Object.fromEntries(Object.entries(raw).filter(([key]) => !['operationId', 'stateVersion'].includes(key))), resourceCost, resourceAdjustment, resources: { token: state.token, stress: state.stress, time: state.timeLeft } });
  return { state, result: output, cached: false };
}

export function chooseCase04Reward(original, choiceId) {
  const state = clone(original);
  const output = choosePendingRunReward(state, choiceId);
  state.stateVersion += 1;
  return { state, reward: output.reward };
}

export function case04PublicView(state) {
  return {
    caseId: state.caseId, ruleVersion: state.ruleVersion, phase: state.phase,
    resources: { token: state.token, stress: state.stress, time: state.timeLeft }, strategy: state.strategy,
    diagnosis: clone(state.diagnosis), service: clone(state.service), rootCause: clone(state.rootCause), revision: state.revision,
    dataCompatibility: state.dataCompatibility, compatibilityDecision: clone(state.compatibilityDecision), approval: clone(state.approval),
    evidence: clone(state.evidence), handoff: clone(state.handoff),
    issues: clone(state.issues), blockers: blockers(state), story: clone(state.story), ending: clone(state.ending),
    cards: Object.entries(state.cards).map(([id, level]) => ({ id, name: CARDS[id].name, level, equipped: state.equipped.includes(id) })),
    pendingReward: clone(state.pendingReward), progression: state.progression ? { runExp: state.progression.runExp, progressKeys: [...state.progression.progressKeys], rewardMilestones: clone(state.progression.rewardMilestones) } : null,
    availableActions: Object.keys(CASE04_ACTIONS).filter((id) => actionAvailable(state, id)), limitedBlockers: limitedBlockers(state),
  };
}
