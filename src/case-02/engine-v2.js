import { createStream, drawD100, drawSample, randomSeed } from '../core/rng.js';
import { CARDS } from '../career/cards.js';
import { applyIntegrationShield, applySpendRefund } from '../career/card-runtime.js';
import { initializeCaseAttempts, previewCaseAttempt, reviseCaseAttempts, runCaseAttempt } from '../core/case-attempt.js';
import { composeEndingFacets } from '../core/ending-facets.js';
import * as legacy from './engine.js';
import { CASE02_LIMITS, CASE02_REWARD_ID, CASE02_REWARD_POOL, CASE02_RULE_VERSION, NORMALIZATION_STRATEGIES } from './rules.js';
import {
  case02StoryBlockers,
  normalizeCase02Story,
  observeCase02Story,
  performCase02StoryAction,
  previewCase02StoryAction,
} from './story.js';

const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const level = (state, id) => state.equipped.includes(id) ? (state.cards[id] ?? 0) : 0;
const usesCase02Story = (state) => state.ruleVersion === CASE02_RULE_VERSION;
const FAILURE_EVENTS = Object.freeze({
  B01: [{ id: 'latest-means-what', weight: 55 }, { id: 'id-alias-parade', weight: 45 }],
  B02: [{ id: 'leading-zero-snack', weight: 50 }, { id: 'brief-drift', weight: 50 }],
  B03: [{ id: 'join-collision', weight: 55 }, { id: 'currency-mismatch', weight: 45 }],
  B04: [{ id: 'meeting-only-decision', weight: 60 }, { id: 'refund-rule-fork', weight: 40 }],
  B05: [{ id: 'mapping-alias-sequel', weight: 50 }, { id: 'revision-race', weight: 50 }],
  B06: [{ id: 'fixture-missing', weight: 55 }, { id: 'runner-timezone', weight: 45 }],
  B07: [{ id: 'final-final2', weight: 60 }, { id: 'source-row-orphan', weight: 40 }],
});

function failureEvents(actionId) { return FAILURE_EVENTS[actionId] ?? [{ id: 'work-drift', weight: 100 }]; }

function attemptConfig(state, actionId, ability, base, bonus = 0) {
  return {
    actionId,
    semanticKey: actionId,
    ability,
    baseChance: base,
    modifiers: bonus ? [{ id: 'strategy', label: '公開策略與既有卡片', value: bonus }] : [],
    events: failureEvents(actionId),
    boundaryAction: ['B01', 'B04', 'B07'].includes(actionId),
    separateFailureDraw: state.progressionV2 !== false,
  };
}

function withAttemptPreview(state, preview, actionId, ability, base, bonus = 0) {
  const attempt = previewCaseAttempt(state, attemptConfig(state, actionId, ability, base, bonus));
  const retryTokenDiscount = attempt.retry && level(state, 'C13') ? 1 : 0;
  return {
    ...preview,
    token: Math.max(1, preview.token - retryTokenDiscount),
    time: Math.max(0, preview.time - attempt.retryTimeDiscount),
    retryTokenDiscount,
    attempt,
  };
}

function payloadFor(actionId, raw) {
  return JSON.stringify({ actionId, ...Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'stateVersion')) });
}

function stripV2Options(actionId, raw) {
  if (actionId !== 'B03') return raw;
  const { useFastMerge: _ignored, ...rest } = raw;
  return rest;
}

function resolveEvent(state, actionId, ability, base, bonus = 0) {
  const attempt = runCaseAttempt(state, { ...attemptConfig(state, actionId, ability, base, bonus), operationId: `attempt:${actionId}:${state.stateVersion}` });
  state.lastAttempt = attempt;
  return attempt.outcome !== 'failure';
}

function removeNewMilestone(state, original, id) {
  if (!original.ledger.includes(id)) state.ledger = state.ledger.filter((item) => item !== id);
}

function eventResult(title, summary, player, response, followUp, consequence, outcome) {
  return { type: 'event', title, summary, process: { player, response, followUp, consequence }, outcome };
}

function publicBlockers(state) {
  const blockers = [...legacy.case02PublicView(state).blockers];
  if (usesCase02Story(state)) {
    for (const blocker of case02StoryBlockers(state)) if (!blockers.includes(blocker)) blockers.push(blocker);
  }
  if (state.contract && state.contract.clarity === false && !blockers.includes('契約仍有一句話各自解讀')) blockers.unshift('契約仍有一句話各自解讀');
  return blockers;
}

function availableRewardCards(state) {
  return CASE02_REWARD_POOL.filter((id) => (state.cards[id] ?? 0) < CARDS[id].maxLevel);
}

function rebuildReward(state) {
  if (state.rewardLedgerSnapshot.includes(CASE02_REWARD_ID) || state.rewardClaims.includes('reward:integration-kit')) {
    state.pendingReward = null;
    return null;
  }
  const pool = availableRewardCards(state);
  if (!pool.length) {
    state.pendingReward = null;
    state.token = Math.min(CASE02_LIMITS.tokenCap, state.token + 2);
    state.rewardClaims.push('reward:integration-kit');
    state.rewardFallback = { kind: 'all-cards-maxed', token: 2 };
    return state.rewardFallback;
  }
  const drawn = drawSample(state.rng.reward, pool, Math.min(3, pool.length));
  state.rng.reward = drawn.stream;
  state.pendingReward = { rewardId: CASE02_REWARD_ID, choices: drawn.value };
  return null;
}

export function createCase02Game(options = {}) {
  const state = legacy.createCase02Game(options);
  const seed = Number.isInteger(options.seed) ? options.seed >>> 0 : randomSeed();
  state.seed = seed;
  state.rng = {
    event: createStream(options.eventRolls ? { values: options.eventRolls } : { seed }),
    reward: createStream(options.rewardDraws ? { values: options.rewardDraws } : { seed: seed ^ 0xa17e5eed }),
  };
  state.eventAudit = [];
  state.operationPayloads = {};
  state.rewardFallback = null;
  state.cardUsage = {};
  state.story = normalizeCase02Story();
  initializeCaseAttempts(state);
  return state;
}

export function previewCase02Action(state, actionId, options = {}) {
  if (['B10', 'B11', 'B12'].includes(actionId)) {
    if (!usesCase02Story(state)) throw new Error('此舊局沿用原規則，請完成後再開新局體驗新路線');
    return previewCase02StoryAction({ ...state, story: normalizeCase02Story(state.story) }, actionId, options);
  }
  const legacyOptions = stripV2Options(actionId, options);
  const base = legacy.previewCase02Action(state, actionId, legacyOptions);
  if (actionId === 'B01') return withAttemptPreview(state, { ...base, token: Math.max(1, base.token - level(state, 'C7')) }, actionId, 'A', 40, level(state, 'C7') * 10);
  if (actionId === 'B02') {
    const strategy = NORMALIZATION_STRATEGIES[options.strategy];
    if (!strategy) throw new Error('請選擇分工方式');
    const briefScore = legacy.case02ContractScore(state.contract) + (state.contract?.clarity === false ? 0 : 1)
      + Math.floor(state.abilities.A / 5) + level(state, 'C1') + level(state, 'C11');
    const weakDebt = strategy.value === 'solo' ? 0 : briefScore < (strategy.value === 'two' ? 6 : 5) ? 1 : 0;
    const preview = { ...base, briefScore, predictedDebt: strategy.baseDebt + weakDebt + (state.contract?.clarity === false ? 1 : 0) + (base.rapidLevel ? 1 : 0) };
    const strategyBonus = options.strategy === 'solo' ? 10 : options.strategy === 'two' ? -10 : 0;
    return withAttemptPreview(state, preview, actionId, 'A', 40, strategyBonus + level(state, 'C1') * 5 + level(state, 'C11') * 5);
  }
  if (actionId === 'B03') {
    const c10 = options.useFastMerge ? level(state, 'C10') : 0;
    if (options.useFastMerge && !c10) throw new Error('尚未裝備合併號誌');
    const preview = { ...base, token: Math.max(1, base.token - (c10 >= 2 ? 1 : 0)), time: Math.max(1, base.time - (c10 ? 1 : 0)), fastMergeDebt: c10 ? 1 : 0 };
    return withAttemptPreview(state, preview, actionId, 'E', 40, -(state.normalization?.predictedDebt ?? 0) * 8);
  }
  if (actionId === 'B04') {
    const c8 = level(state, 'C8');
    const preview = { ...base, token: Math.max(1, base.token - (options.response === 'contract' && c8 >= 2 ? 1 : 0)), stress: Math.max(0, base.stress - (options.response === 'patch' && c8 ? 1 : 0)) };
    return options.response === 'contract' ? withAttemptPreview(state, preview, actionId, 'A', 40, level(state, 'C8') * 5 + level(state, 'C11') * 5) : preview;
  }
  if (actionId === 'B05') return options.mode === 'repair'
    ? withAttemptPreview(state, base, actionId, 'E', 35, level(state, 'C4') * 10)
    : base;
  if (actionId === 'B06') {
    const c9 = level(state, 'C9');
    const preview = { ...base, token: Math.max(1, base.token - (c9 >= 2 ? 1 : 0)), coverage: options.scope === 'focused' ? Math.min(4, base.coverage + (c9 ? 1 : 0)) : base.coverage };
    return withAttemptPreview(state, preview, actionId, 'V', 35, level(state, 'C3') * 5 + level(state, 'C9') * 10);
  }
  if (actionId === 'B07') return withAttemptPreview(state, { ...base, token: Math.max(1, base.token - level(state, 'C12')) }, actionId, 'V', 35, level(state, 'C12') * 10);
  return base;
}

function prepareLegacyState(original, actionId, raw) {
  const state = clone(original);
  if (!['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08'].includes(actionId)) return state;
  const oldPreview = legacy.previewCase02Action(original, actionId, stripV2Options(actionId, raw));
  const newPreview = previewCase02Action(original, actionId, raw);
  if (original.token < newPreview.token) throw new Error(`Token 不足：需要 ${newPreview.token}`);
  if (original.timeLeft < newPreview.time) throw new Error(`時間不足：需要 ${newPreview.time}`);
  state.token += Math.max(0, oldPreview.token - newPreview.token);
  state.timeLeft += Math.max(0, oldPreview.time - newPreview.time);
  return state;
}

export function performCase02Action(original, actionId, raw = {}) {
  const operationId = raw.operationId;
  if (typeof operationId !== 'string' || !operationId.trim()) throw new Error('缺少 operationId');
  const payload = payloadFor(actionId, raw);
  if (original.operationResults[operationId]) {
    if (original.operationPayloads?.[operationId] && original.operationPayloads[operationId] !== payload) throw new Error('operation_id_conflict');
    return { state: clone(original), result: clone(original.operationResults[operationId]), cached: true };
  }
  if (raw.stateVersion !== original.stateVersion) throw new Error('畫面已更新，請重新確認這一步');
  if (['B10', 'B11', 'B12'].includes(actionId)) {
    if (!usesCase02Story(original)) throw new Error('此舊局沿用原規則，請完成後再開新局體驗新路線');
    if (original.phase !== 'playing') throw new Error('案件已結束');
    if (original.pendingReward) throw new Error('請先處理目前的職涯獎勵');
    const state = clone(original);
    state.story = normalizeCase02Story(state.story);
    state.operationPayloads ??= {};
    if (actionId === 'B10' && !state.story.openRecovery) throw new Error('目前沒有待處理的失敗岔路');
    if (actionId === 'B11' && !state.story.openOpportunity) throw new Error('目前沒有待處理的成功誘惑');
    const output = performCase02StoryAction(state, actionId, raw);
    state.stateVersion += 1;
    state.log.push({
      actionId,
      options: { route: raw.route },
      outcome: output.result.outcome,
      resources: { token: state.token, stress: state.stress, time: state.timeLeft },
      dataRevision: state.dataRevision,
    });
    state.operationPayloads[operationId] = payload;
    state.operationResults[operationId] = clone(output.result);
    return { state, result: output.result, cached: false };
  }
  if (actionId === 'B09' && raw.intent === 'verified') {
    const blockers = publicBlockers(original);
    if (blockers.length) throw new Error(`尚未符合正式交付：${blockers.join('；')}`);
  }

  const legacyInput = prepareLegacyState(original, actionId, raw);
  const oldPreview = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08'].includes(actionId)
    ? legacy.previewCase02Action(original, actionId, stripV2Options(actionId, raw)) : null;
  const newPreview = oldPreview ? previewCase02Action(original, actionId, raw) : null;
  const output = legacy.performCase02Action(legacyInput, actionId, stripV2Options(actionId, raw));
  const state = output.state;
  let result = output.result;
  state.lastAttempt = null;
  state.cardUsage ??= {};
  let spendRefund = 0;
  state.operationPayloads ??= {};
  state.eventAudit ??= [];
  state.rewardFallback ??= null;

  if (oldPreview && newPreview) {
    state.token -= Math.max(0, newPreview.token - oldPreview.token);
    state.timeLeft -= Math.max(0, newPreview.time - oldPreview.time);
    state.stress = clamp(state.stress + newPreview.stress - oldPreview.stress, 0, CASE02_LIMITS.stressCap);
    const refund = applySpendRefund(state, { cards: state.cards, equipped: state.equipped, tokenCost: newPreview.token });
    Object.assign(state, refund.state);
    spendRefund = refund.refunded;
  }

  if (actionId === 'B01') {
    const success = resolveEvent(state, actionId, 'A', 40, level(state, 'C7') * 10);
    state.contract.clarity = success;
    if (!success) removeNewMilestone(state, original, 'contract_aligned');
    result = success
      ? eventResult('契約終於從「你懂我懂」變成電腦也懂', `目前有 ${legacy.case02ContractScore(state.contract)} / 3 個選項符合來源。`, '你把 ID、日期與重複列寫成可以驗收的句子。', '會議室安靜了三秒，因為大家第一次發現「同一個」原來需要定義。', '接下來可選獨作或模擬 agent 分工。', '能力與契約卡影響這次澄清，但沒有替你選答案。', 'clear')
      : eventResult('契約寫完了，但三個人讀出四種意思', '選項已記錄，文字仍有歧義；可以付費重寫，或帶著風險往下做。', '你努力把規則寫清楚。', '「最新」究竟看匯出時間還是發票時間，又開了一場會。', '重寫契約可恢復；直接分工會增加公開整合債。', '失敗沒有鎖死流程，也不會偷偷推薦正解。', 'ambiguous');
  } else if (actionId === 'B02') {
    const strategyBonus = raw.strategy === 'solo' ? 10 : raw.strategy === 'two' ? -10 : 0;
    const success = resolveEvent(state, actionId, 'A', 40, strategyBonus + level(state, 'C1') * 5 + level(state, 'C11') * 5);
    state.normalization.briefScore = newPreview.briefScore;
    state.normalization.predictedDebt = newPreview.predictedDebt + (success ? 0 : 1);
    state.normalization.outcome = success ? 'coherent' : 'drifted';
    result = success
      ? eventResult('三張表開始使用同一種口音', `正規化完成；目前預估整合債 ${state.normalization.predictedDebt}。`, '你選擇分工方式並交出 brief。', raw.strategy === 'two' ? '兩個模擬 agent 同時交卷，這次欄位名稱真的有對上。' : '欄位整理完畢，沒有人把 refund 拼成 refunnd。', '下一步要把結果真正合併。', '分工更快，但 agent 數量與 brief 品質都有公開取捨。', 'coherent')
      : eventResult('檔名都叫 final，內容卻各自活在平行宇宙', `brief 漂移，整合債增加到 ${state.normalization.predictedDebt}。`, '你付出分工成本，結果沒有神奇退款。', '一份表把 client_no 當字串，另一份熱情地把前導零吃掉。', '仍可繼續整合，再用修復工作清債。', '這是可恢復的公開失敗。', 'drifted');
  } else if (actionId === 'B03') {
    const success = resolveEvent(state, actionId, 'E', 40, -(state.normalization?.predictedDebt ?? 0) * 8);
    state.integration.unresolvedDebt += (state.contract?.clarity === false ? 1 : 0) + (newPreview.fastMergeDebt ?? 0) + (success ? 0 : 1);
    const previousDebt = original.integration?.unresolvedDebt ?? 0;
    const addedDebt = Math.max(0, state.integration.unresolvedDebt - previousDebt);
    if (addedDebt) {
      const shielded = applyIntegrationShield({ integrationDebt: previousDebt, cardUsage: state.cardUsage }, { cards: state.cards, equipped: state.equipped, debt: addedDebt });
      state.integration.unresolvedDebt = shielded.state.integrationDebt;
      state.cardUsage = shielded.state.cardUsage;
    }
    state.integration.outcome = success ? 'stable' : 'collision';
    if (state.integration.unresolvedDebt > 0) removeNewMilestone(state, original, 'truth_reconciled');
    const fallback = state.progressionV2 ? null : rebuildReward(state);
    result = success
      ? eventResult('一條管線誕生了，還沒有開始冒煙', `整合債 ${state.integration.unresolvedDebt}。`, '你把 mapping 與規則接進管線。', state.integration.unresolvedDebt ? '管線能跑，但公開債務仍在旁邊揮手。' : '三張表同意同一個數字，辦公室短暫恢復文明。', '17:58 的退款新規則已出現，必須由你決定。', fallback ? `卡片全滿級，改為恢復 ${fallback.token} Token，不會吞獎。` : '結果可解釋，但不是神諭。', 'stable')
      : eventResult('Join 成功了，數字也成功開始互相指責', `碰撞讓整合債升到 ${state.integration.unresolvedDebt}。`, '你完成合併，資源與時間照常消耗。', '十二個欄位握手後，有一個 customer_id 把自己介紹成 invoice_date。', '用修復工作可清債，再重建證據。', '工程能力影響事件；失敗仍可恢復。', 'collision');
    if (fallback && !success) result.process.consequence += ` 卡片獎池已全滿，改領 ${fallback.token} Token；stable reward ID 已記帳，不會重複領取。`;
  } else if (actionId === 'B04' && raw.response === 'contract') {
    const success = resolveEvent(state, actionId, 'A', 40, level(state, 'C8') * 5 + level(state, 'C11') * 5);
    state.change.handled = success;
    state.change.contractUpdated = success;
    if (!success) removeNewMilestone(state, original, 'change_contracted');
    result = success
      ? eventResult('需求變更進了契約，不是進聊天紀錄墳場', '退款截止與原因已成為可測規則。', '你確認客戶意圖並更新契約。', '模擬 agent 只列影響，沒有冒充客戶按同意。', '資料已改版，必須重新建立證據。', '決策仍由玩家作出。', 'contracted')
      : eventResult('會議結束了，決策還留在會議裡', '協商未形成可執行規則；可以再次付費澄清。', '你提出兩個明確問題。', '客戶回答「照之前的」，而之前沒有任何人寫下來。', '付費重試會產生新事件。', '沒有假成功，也沒有自動替客戶決策。', 'unresolved');
    reviseCaseAttempts(state, { revision: `data-r${state.dataRevision}`, kind: success ? 'minor' : 'major', affectedKeys: ['B03', 'B05', 'B06', 'B07'] });
  } else if (actionId === 'B05' && raw.mode === 'repair') {
    const success = resolveEvent(state, actionId, 'E', 35, level(state, 'C4') * 10);
    if (!success) {
      for (const key of ['contract', 'integration', 'change', 'destructiveCleanup', 'dataRevision', 'provenance', 'tests']) state[key] = clone(original[key]);
      for (const id of ['contract_aligned', 'truth_reconciled', 'change_contracted']) removeNewMilestone(state, original, id);
      state.stress = Math.min(CASE02_LIMITS.stressCap, state.stress + 1);
      result = eventResult('修到一半，mapping 又長出一個別名', '本次修復未完成；整合債保持，資源不退。', '你追 customer_id 與 client_no 的對照。', '第三個歷史代號從封存信件裡探頭。', '可以付費重試，或誠實止損。', '失敗沒有改寫資料 revision。', 'repair-failed');
    } else {
      state.contract.clarity = true;
      if (usesCase02Story(state)) {
        state.change = clone(original.change);
        state.destructiveCleanup = Boolean(original.destructiveCleanup);
      }
      result = eventResult('mapping 修回來，世界暫時只有一個 customer_id', '契約、mapping 與退款規則已對齊。', '你依來源修正契約與 mapping。', '除錯完成，沒有拿刪資料祭天。', '資料已改版，請重跑測試與追溯。', '可恢復正式交付路線。', 'repaired');
    }
  } else if (actionId === 'B06') {
    const success = resolveEvent(state, actionId, 'V', 35, level(state, 'C3') * 5 + level(state, 'C9') * 10);
    if (!success) {
      state.tests.coverage = Math.max(1, newPreview.coverage - 1);
      state.tests.passed = [];
      if (!state.tests.failed.includes('測試 runner 漏接退款欄位')) state.tests.failed.push('測試 runner 漏接退款欄位');
      removeNewMilestone(state, original, 'cross_source_tests');
      result = eventResult('測試 runner 自己先跌倒了', `只建立 ${state.tests.coverage} / 4 覆蓋，結果不可作為正式證據。`, '你啟動跨來源測試。', 'runner 忘了載入 refunds fixture，綠燈差點靠缺席當選。', '可以付費重跑；驗證能力與卡片會影響成功機會。', '目前 revision 明確記錄失敗。', 'runner-failed');
    } else {
      state.tests.coverage = newPreview.coverage;
      result.outcome = state.tests.failed.length ? 'findings' : 'passed';
    }
  } else if (actionId === 'B07') {
    const success = resolveEvent(state, actionId, 'V', 35, level(state, 'C12') * 10);
    state.provenance = success;
    if (!success) {
      removeNewMilestone(state, original, 'audit_trace');
      result = eventResult('追溯鏈在最後一格寫了「問小陳」', '來源索引未完成；可以付費重建。', '你整理 mapping 與來源列。', '一份舊匯出沒有版本號，只剩檔名 final_final2。', '重試或止損；不能拿半條鏈假裝完整。', '驗證能力與交接清單影響這次結果。', 'trace-failed');
    } else result.outcome = 'traceable';
  }

  if (state.lastAttempt) {
    const attempt = state.lastAttempt;
    const failureLines = {
      'latest-means-what': '續篇事件：這次「最新」改口說是上傳時間，上一輪的會議紀錄終於派上用場。',
      'id-alias-parade': '事件：第四個歷史 ID 別名穿著同一件風衣走進 mapping 表。',
      'leading-zero-snack': '事件：試算表又把前導零當下午茶吃掉。',
      'brief-drift': '事件：模擬 agent 忠實執行了兩份彼此不同的 brief。',
      'join-collision': '事件：customer_id 與 client_no 在 join 現場互稱「第一次見面」。',
      'currency-mismatch': '事件：同一筆退款同時相信 TWD 與「看欄位心情」。',
      'meeting-only-decision': '事件：決策仍只存在某人的會議記憶體，且沒有備份。',
      'refund-rule-fork': '事件：退款截止日分裂成客服版與財務版。',
      'mapping-alias-sequel': '續篇事件：舊 mapping 的別名帶著家族樹回來了。',
      'revision-race': '事件：修復追到一半，資料 revision 先跑去下一站。',
      'fixture-missing': '事件：refunds fixture 沒到場，runner 卻差點替它簽到。',
      'runner-timezone': '事件：測試 runner 把 UTC+8 當成「大概早上」。',
      'final-final2': '事件：來源檔 final_final2 再次宣稱自己才是唯一真相。',
      'source-row-orphan': '事件：一列退款找不到來源家長，只留下 email 線索。',
    };
    result.attempt = { outcome: attempt.outcome, chance: attempt.chance, learning: attempt.learning, modifiers: attempt.modifiers, failureEvent: attempt.failureEvent, sequel: attempt.sequel, retry: attempt.retry, retryLearningGain: attempt.retryLearningGain, cardTrigger: attempt.cardTrigger };
    if (attempt.outcome === 'partial') {
      result.title = `擦線交付：${result.title}`;
      result.outcome = `${result.outcome ?? actionId.toLowerCase()}-partial`;
      result.process.consequence += ' 這次只算部分成功：工作可繼續，但多留 1 點公開整合債。';
      if (actionId === 'B01') state.preIntegrationDebt = (state.preIntegrationDebt ?? 0) + 1;
      else if (actionId === 'B02' && state.normalization?.complete) state.normalization.predictedDebt += 1;
      else if (state.integration?.complete) state.integration.unresolvedDebt += 1;
    } else if (attempt.failureEvent) {
      result.process.response += ` ${failureLines[attempt.failureEvent] ?? '事件留下可付費補救的公開缺口。'}`;
      if (attempt.sequel > 1) result.process.followUp += ` 這是第 ${attempt.sequel} 次續篇；前次理解已承接，本事件本輪權重也已降低。`;
    }
  }
  if (spendRefund && result.process) result.process.consequence += ` Token 反芻胃返還 ${spendRefund} Token（本局次數有上限）。`;
  if (usesCase02Story(state)) observeCase02Story(state, actionId, raw, result);
  if (actionId === 'B01' && state.lastAttempt?.outcome === 'success') state.preIntegrationDebt = 0;
  if (state.ending) state.ending.playFacets = composeEndingFacets(state);

  if (state.log.length) state.log[state.log.length - 1].outcome = result.outcome ?? result.ending?.baseId ?? null;
  state.operationPayloads[operationId] = payload;
  state.operationResults[operationId] = clone(result);
  return { state, result, cached: output.cached };
}

export function chooseCase02Reward(original, cardId) {
  if (!original.pendingReward?.choices.includes(cardId)) throw new Error('這張卡不在目前獎勵中');
  return legacy.chooseCase02Reward(original, cardId);
}

export function case02PublicView(state) {
  const view = legacy.case02PublicView(state);
  if (usesCase02Story(state)) view.story = normalizeCase02Story(state.story);
  view.rewardFallback = clone(state.rewardFallback ?? null);
  view.progression = state.progression ? { runExp: state.progression.runExp, progressKeys: [...state.progression.progressKeys], rewardMilestones: state.progression.rewardMilestones.map((item) => ({ slot: item.slot, status: item.status })) } : null;
  view.blockers = publicBlockers(state);
  view.verifiedReady = view.blockers.length === 0;
  return view;
}

export const case02CardLevel = legacy.case02CardLevel;
export const case02ContractScore = legacy.case02ContractScore;
