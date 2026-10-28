import { TEMPLATES } from '../narrative/rules.js';
import { CARDS } from '../career/cards.js';
import { choosePendingRunReward, grantRunProgress, initializeRunRewards } from '../career/run-rewards.js';
import {
  CASE02_ACTIONS,
  CASE02_LIMITS,
  CASE02_REWARD_CHOICES,
  CASE02_REWARD_ID,
  CASE02_RULE_VERSION,
  CONTRACT_OPTIONS,
  NORMALIZATION_STRATEGIES,
} from './rules.js';

const clone = (value) => structuredClone(value);

function cardLevel(state, id) {
  return state.equipped.includes(id) ? (state.cards[id] ?? 0) : 0;
}

function contractScore(contract) {
  if (!contract) return 0;
  return ['idPolicy', 'datePolicy', 'duplicatePolicy']
    .filter((key) => CONTRACT_OPTIONS[key].find((option) => option.value === contract[key])?.aligned).length;
}

function addMilestone(state, id) {
  if (!state.ledger.includes(id)) {
    state.ledger.push(id);
    if (state.progressionV2) grantRunProgress(state, id);
  }
}

function touchData(state) {
  state.dataRevision += 1;
  state.provenance = false;
}

function invalidateTestsNotice(state) {
  return state.tests.testedRevision !== null && state.tests.testedRevision !== state.dataRevision;
}

function exactOptions(options, allowed) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('選項格式無效');
  if (Object.keys(options).some((key) => !allowed.includes(key))) throw new Error('選項含有未知欄位');
  return options;
}

function applyWorkCost(state, preview) {
  if (state.token < preview.token) throw new Error(`Token 不足：需要 ${preview.token}`);
  if (state.timeLeft < preview.time) throw new Error(`時間不足：需要 ${preview.time}`);
  state.token -= preview.token;
  state.timeLeft -= preview.time;
  state.stress = Math.min(CASE02_LIMITS.stressCap, state.stress + preview.stress);
  state.workCount += 1;
}

function publicBlockers(state) {
  const blockers = [];
  if ((state.preIntegrationDebt ?? 0) > 0) blockers.push(`尚有 ${state.preIntegrationDebt} 點前期整合債`);
  if (state.contract && state.contract.clarity === false) blockers.push('契約仍有一句話各自解讀');
  if (contractScore(state.contract) < 3) blockers.push('資料契約仍有未對齊項目');
  if (!state.normalization?.complete) blockers.push('三份來源尚未完成正規化');
  if (!state.integration?.complete) blockers.push('尚未產生整合資料');
  if (state.integration?.unresolvedDebt > 0) blockers.push(`仍有 ${state.integration.unresolvedDebt} 筆整合債`);
  if (!state.change.contractUpdated) blockers.push('17:58 退款規則尚未寫回契約');
  if (state.destructiveCleanup) blockers.push('曾以刪列方式清理，來源完整性不足');
  if (state.tests.coverage < 4 || state.tests.testedRevision !== state.dataRevision) blockers.push('完整跨來源測試尚未涵蓋目前版本');
  if (state.tests.failed.length) blockers.push(`測試仍失敗：${state.tests.failed.join('、')}`);
  if (!state.provenance) blockers.push('來源追溯尚未建立');
  return blockers;
}

function testFindings(state) {
  const failed = [];
  if (contractScore(state.contract) < 3) failed.push('契約對齊');
  if ((state.integration?.unresolvedDebt ?? 0) > 0) failed.push('ID／重複列整合');
  if (!state.change.contractUpdated) failed.push('退款規則版本');
  if (state.destructiveCleanup) failed.push('來源列完整性');
  if (!state.provenance) failed.push('來源追溯');
  return failed;
}

function result(title, summary, process, extra = {}) {
  return { type: 'event', title, summary, process, ...extra };
}

export function createCase02Game({ templateId, cards = {}, equipped = [], rewardLedger = [], progressionV2 = false } = {}) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error('未知角色模板');
  const safeCards = {};
  for (const [id, level] of Object.entries(cards)) {
    if (!CARDS[id] || !Number.isInteger(level) || level < 1 || level > CARDS[id].maxLevel) throw new Error('卡庫格式無效');
    safeCards[id] = level;
  }
  const safeEquipped = [...new Set(equipped)].filter((id) => safeCards[id]).slice(0, 3);
  const state = {
    ruleVersion: CASE02_RULE_VERSION,
    caseId: 'case-02',
    phase: 'playing',
    stateVersion: 0,
    templateId,
    abilities: clone(template.attrs),
    token: CASE02_LIMITS.token,
    stress: 0,
    timeLeft: CASE02_LIMITS.deadline,
    workCount: 0,
    cards: safeCards,
    equipped: safeEquipped,
    contract: null,
    normalization: null,
    integration: null,
    preIntegrationDebt: 0,
    change: { announced: false, handled: false, contractUpdated: false },
    destructiveCleanup: false,
    dataRevision: 0,
    tests: { coverage: 0, testedRevision: null, passed: [], failed: [] },
    provenance: false,
    ledger: [],
    rewardClaims: [],
    rewardLedgerSnapshot: [...rewardLedger],
    pendingReward: null,
    log: [],
    operationResults: {},
    ending: null,
    progressionV2,
  };
  return progressionV2 ? initializeRunRewards(state) : state;
}

export function previewCase02Action(state, actionId, rawOptions = {}) {
  if (!CASE02_ACTIONS[actionId]) throw new Error('未知工作');
  const options = rawOptions ?? {};
  if (actionId === 'B01') return { token: 2, time: 1, stress: 0 };
  if (actionId === 'B02') {
    const strategy = NORMALIZATION_STRATEGIES[options.strategy ?? 'one'];
    if (!strategy) throw new Error('未知分工方式');
    const c1 = cardLevel(state, 'C1');
    const c2 = options.useRapid ? cardLevel(state, 'C2') : 0;
    const briefScore = contractScore(state.contract) + Math.floor(state.abilities.A / 5) + c1;
    const weakBriefDebt = strategy.value === 'solo' ? 0 : briefScore < (strategy.value === 'two' ? 5 : 4) ? 1 : 0;
    return {
      token: Math.max(1, strategy.token - (state.abilities.A >= 8 ? 1 : 0)),
      time: Math.max(1, strategy.time - c2),
      stress: Math.max(0, strategy.stress - (c1 >= 2 ? 1 : 0)),
      briefScore,
      predictedDebt: strategy.baseDebt + weakBriefDebt + (c2 ? 1 : 0),
      strategy: strategy.value,
      rapidLevel: c2,
    };
  }
  if (actionId === 'B03') return { token: Math.max(1, 3 - (state.abilities.E >= 8 ? 1 : 0)), time: 2, stress: Math.min(2, state.normalization?.predictedDebt ?? 0) };
  if (actionId === 'B04') return options.response === 'patch' ? { token: 1, time: 1, stress: 1 } : { token: 2, time: 1, stress: 0 };
  if (actionId === 'B05') {
    if (options.mode === 'delete') return { token: 1, time: 1, stress: 1 };
    const c4 = cardLevel(state, 'C4');
    return { token: Math.max(1, 3 - c4), time: Math.max(1, 2 - (c4 >= 2 ? 1 : 0)), stress: 0 };
  }
  if (actionId === 'B06') {
    const c3 = cardLevel(state, 'C3');
    const c6 = cardLevel(state, 'C6');
    const full = options.scope === 'full';
    return {
      token: Math.max(1, (full ? 3 : 2) - c6),
      time: Math.max(1, (full ? 2 : 1) - (full && c3 >= 2 ? 1 : 0)),
      stress: 0,
      coverage: full ? 4 : Math.min(4, 2 + c3),
    };
  }
  if (actionId === 'B07') return { token: Math.max(1, 2 - cardLevel(state, 'C6')), time: 1, stress: 0 };
  if (actionId === 'B08') return { token: 0, time: 1, stress: 0, recoverToken: 2 + cardLevel(state, 'C5'), recoverStress: 2 + cardLevel(state, 'C5') };
  return { token: 0, time: 0, stress: 0 };
}

function ensureActionAvailable(state, actionId) {
  if (state.phase !== 'playing') throw new Error('案件已結束');
  if (state.pendingReward) throw new Error('請先處理目前的卡片獎勵');
  if (actionId === 'B02' && !state.contract) throw new Error('先定義資料契約，agent 才知道要做什麼');
  if (actionId === 'B03' && !state.normalization?.complete) throw new Error('三份來源尚未正規化');
  if (actionId === 'B04' && !state.change.announced) throw new Error('客戶尚未提出退款新規則');
  if (actionId === 'B05' && !state.integration?.complete) throw new Error('目前還沒有可修復的整合結果');
  if (['B06', 'B07'].includes(actionId) && !state.integration?.complete) throw new Error('先完成整合再建立證據');
}

export function performCase02Action(original, actionId, raw = {}) {
  const operationId = raw.operationId;
  const stateVersion = raw.stateVersion;
  if (typeof operationId !== 'string' || !operationId.trim()) throw new Error('缺少 operationId');
  if (original.operationResults[operationId]) return { state: clone(original), result: clone(original.operationResults[operationId]), cached: true };
  if (stateVersion !== original.stateVersion) throw new Error('畫面已更新，請重新確認這一步');
  const state = clone(original);
  ensureActionAvailable(state, actionId);
  let out;

  if (actionId === 'B01') {
    const options = exactOptions(raw, ['operationId', 'stateVersion', 'idPolicy', 'datePolicy', 'duplicatePolicy']);
    for (const key of ['idPolicy', 'datePolicy', 'duplicatePolicy']) {
      if (!CONTRACT_OPTIONS[key].some((item) => item.value === options[key])) throw new Error(`未選擇有效的 ${key}`);
    }
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    state.contract = { idPolicy: options.idPolicy, datePolicy: options.datePolicy, duplicatePolicy: options.duplicatePolicy };
    touchData(state);
    if (contractScore(state.contract) === 3) addMilestone(state, 'contract_aligned');
    out = result('契約不是裝飾品，是大家吵架時的裁判', `目前有 ${contractScore(state.contract)} / 3 項對齊公開來源。`, {
      player: '你把 ID、日期與重複列政策寫成三個能驗收的句子。',
      response: '會議室安靜了三秒；這在資料專案裡已經算熱烈掌聲。',
      followUp: '接下來的 agent brief 與整合都會照這份契約執行。',
      consequence: invalidateTestsNotice(state) ? '資料版本已更新，舊測試證據過期。' : '契約版本已建立。',
    });
  } else if (actionId === 'B02') {
    const options = exactOptions(raw, ['operationId', 'stateVersion', 'strategy', 'useRapid']);
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    state.normalization = { complete: true, strategy: preview.strategy, briefScore: preview.briefScore, predictedDebt: preview.predictedDebt, usedRapid: preview.rapidLevel > 0 };
    touchData(state);
    addMilestone(state, 'sources_normalized');
    const agentLabel = preview.strategy === 'solo' ? '你自己' : preview.strategy === 'one' ? '一個模擬 agent' : '兩個模擬 agent';
    out = result('三張表終於開始用同一種口音說話', `正規化完成；預估整合債 ${preview.predictedDebt}。`, {
      player: `你選擇 ${agentLabel}，brief 品質為 ${preview.briefScore}。`,
      response: preview.strategy === 'two' ? '兩個 agent 同時回報「我這邊好了」，也同時問「另一邊怎麼命名的？」' : '工作依契約完成，沒有任何真 agent 或外部模型被呼叫。',
      followUp: '下一步要把正規化結果真正合併，整合債會在那裡落地。',
      consequence: preview.rapidLevel ? `快速原型 Lv.${preview.rapidLevel} 節省時間，但增加 1 整合債。` : '本次未使用快速原型捷徑。',
    }, { preview });
  } else if (actionId === 'B03') {
    const options = exactOptions(raw, ['operationId', 'stateVersion']);
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    const unresolvedDebt = (3 - contractScore(state.contract)) + (state.normalization?.predictedDebt ?? 0) + (state.preIntegrationDebt ?? 0);
    state.integration = { complete: true, unresolvedDebt, joinedRows: 12, total: unresolvedDebt ? 18420 : 17820 };
    state.preIntegrationDebt = 0;
    state.change = { announced: true, handled: false, contractUpdated: false };
    touchData(state);
    if (unresolvedDebt === 0) addMilestone(state, 'truth_reconciled');
    if (!state.progressionV2 && !state.rewardLedgerSnapshot.includes(CASE02_REWARD_ID) && !state.rewardClaims.includes('reward:integration-kit')) {
      state.pendingReward = { rewardId: CASE02_REWARD_ID, choices: [...CASE02_REWARD_CHOICES] };
    }
    out = result('單一真相產生了，旁邊還黏著幾張便利貼', `已合併 12 筆公開樣本；整合債 ${unresolvedDebt}。`, {
      player: '你把 mapping、日期與重複列規則套進整合管線。',
      response: unresolvedDebt ? '報表數字成功長出來了，只是有幾個數字看起來像在迴避眼神。' : 'customers、invoices、refunds 對上了，沒有人需要用 email 猜人格。',
      followUp: '客戶在 17:58 補上退款截止與原因欄位要求，必須由你決定怎麼改契約。',
      consequence: `目前總額 ${state.integration.total}；這是公開整合結果，不是隱藏真相。`,
    });
  } else if (actionId === 'B04') {
    const options = exactOptions(raw, ['operationId', 'stateVersion', 'response']);
    if (!['contract', 'patch'].includes(options.response)) throw new Error('未知變更處理方式');
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    state.change.handled = true;
    state.change.contractUpdated = options.response === 'contract';
    touchData(state);
    if (state.change.contractUpdated) addMilestone(state, 'change_contracted');
    out = result(options.response === 'contract' ? '需求變更進了契約，不是進了群組置頂' : '輸出補好了，契約還停在昨天', options.response === 'contract' ? '退款截止與原因欄位已成為可測規則。' : '快速補丁可展示，但正式契約與實作已漂移。', {
      player: options.response === 'contract' ? '你確認客戶決策，更新契約版本與驗收條件。' : '你只在最後輸出補欄位，先讓畫面看起來有跟上。',
      response: '模擬 agent 提供影響清單，但沒有替客戶或你按下同意。',
      followUp: options.response === 'contract' ? '現在可重跑測試與追溯。' : '之後可用「清掉整合債」回到契約修復。',
      consequence: '資料版本已更新；先前測試證據不再代表目前版本。',
    });
  } else if (actionId === 'B05') {
    const options = exactOptions(raw, ['operationId', 'stateVersion', 'mode']);
    if (!['repair', 'delete'].includes(options.mode)) throw new Error('未知修復方式');
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    if (options.mode === 'repair') {
      state.contract = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };
      state.integration.unresolvedDebt = 0;
      state.integration.total = 17820;
      state.change.handled = true;
      state.change.contractUpdated = true;
      state.destructiveCleanup = false;
      addMilestone(state, 'contract_aligned');
      addMilestone(state, 'truth_reconciled');
      addMilestone(state, 'change_contracted');
    } else {
      state.integration.unresolvedDebt = 0;
      state.destructiveCleanup = true;
    }
    touchData(state);
    out = result(options.mode === 'repair' ? '把 mapping 修回來，比把資料藏起來慢一點' : '刪掉問題列之後，問題真的看不見了', options.mode === 'repair' ? '契約、mapping 與退款規則已對齊。' : '整合債歸零，但來源完整性留下明確缺口。', {
      player: options.mode === 'repair' ? '你依來源欄位修正契約與 mapping。' : '你把對不上的列移出輸出。',
      response: options.mode === 'repair' ? '除錯助理把省下的 Token 用在對照，不是用在許願。' : '試算表變整齊了，稽核軌跡則發出一聲很小的尖叫。',
      followUp: '資料已改版，必須重新測試並建立目前版本的來源追溯。',
      consequence: options.mode === 'repair' ? '可恢復正式交付資格。' : '只能有限試用或冒險交付。',
    });
  } else if (actionId === 'B06') {
    const options = exactOptions(raw, ['operationId', 'stateVersion', 'scope']);
    if (!['focused', 'full'].includes(options.scope)) throw new Error('未知測試範圍');
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    const failed = testFindings(state);
    const checks = ['列數與唯一鍵', '孤兒退款', '發票／退款總額', '來源追溯'].slice(0, preview.coverage);
    state.tests = {
      coverage: preview.coverage,
      testedRevision: state.dataRevision,
      passed: checks.filter((name) => !failed.some((item) => name.includes(item))),
      failed,
    };
    if (preview.coverage === 4 && failed.length === 0) addMilestone(state, 'cross_source_tests');
    out = result(failed.length ? '測試沒有修好資料，但至少阻止它穿西裝上台' : '四組證據互相對得起來', `覆蓋 ${preview.coverage} / 4；失敗 ${failed.length} 項。`, {
      player: `你選擇${options.scope === 'full' ? '完整' : '聚焦'}交叉測試。`,
      response: failed.length ? `測試指出：${failed.join('、')}。` : '列數、孤兒退款、總額與來源追溯全部通過。',
      followUp: failed.length ? '先修復，再重跑；舊綠燈不會跟著資料搬家。' : '目前版本具備可交付測試證據。',
      consequence: cardLevel(state, 'C3') ? `測試助理 Lv.${cardLevel(state, 'C3')} 提高了可見覆蓋。` : '本次沒有測試助理加成。',
    });
  } else if (actionId === 'B07') {
    const options = exactOptions(raw, ['operationId', 'stateVersion']);
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    state.provenance = true;
    addMilestone(state, 'audit_trace');
    out = result('每個數字現在都有回家的地址', '來源列、mapping 版本與退款規則已可追溯。', {
      player: '你替整合列記下來源表、來源 ID 與轉換規則版本。',
      response: '稽核問「這個數字哪來的？」時，不必再回答「它一直都在那裡」。',
      followUp: state.tests.testedRevision === state.dataRevision && state.tests.failed.includes('來源追溯') ? '舊測試曾因追溯失敗；請重跑以取得新證據。' : '可進行完整測試或交付檢查。',
      consequence: '追溯只涵蓋目前資料版本；後續資料修改會使它失效。',
    });
  } else if (actionId === 'B08') {
    const options = exactOptions(raw, ['operationId', 'stateVersion']);
    const preview = previewCase02Action(state, actionId, options);
    applyWorkCost(state, preview);
    state.token = Math.min(CASE02_LIMITS.tokenCap, state.token + preview.recoverToken);
    state.stress = Math.max(0, state.stress - preview.recoverStress);
    out = result('離開試算表五分鐘，欄位沒有趁機改名', `恢復 ${preview.recoverToken} Token，降低 ${preview.recoverStress} 壓力。`, {
      player: '你關掉三個 CSV 分頁，喝水並重新整理下一步。',
      response: 'Context 管理不是逃避工作，是避免把 refund 看成 refunnd。',
      followUp: '資料與證據狀態完全不變。',
      consequence: '休息消耗 1 工作時間。',
    });
  } else if (actionId === 'B09') {
    const options = exactOptions(raw, ['operationId', 'stateVersion', 'intent']);
    if (!['verified', 'limited', 'rush', 'stop'].includes(options.intent)) throw new Error('未知交付方式');
    const blockers = publicBlockers(state);
    if (options.intent === 'verified' && blockers.length) throw new Error(`尚未符合正式交付：${blockers.join('；')}`);
    if (options.intent === 'limited' && (!state.integration?.complete || state.tests.testedRevision !== state.dataRevision || state.tests.coverage < 2)) throw new Error('有限試用至少需要整合完成與目前版本的聚焦測試');
    let ending;
    if (options.intent === 'verified') {
      addMilestone(state, 'verified_delivery');
      ending = { baseId: 'C02-VERIFIED', title: '三張表終於同意同一個數字', text: '契約、需求變更、交叉測試與來源追溯都對齊；這份報表可以解釋，也可以重跑。', facets: ['contracted', 'tested', 'traceable'] };
    } else if (options.intent === 'limited') {
      ending = { baseId: 'C02-LIMITED', title: '先給會議看，不假裝能結帳', text: `你把限制與未通過項目寫進交接：${blockers.join('；') || '目前僅採有限試用範圍'}。`, facets: ['limited', 'honest'] };
    } else if (options.intent === 'rush') {
      ending = { baseId: 'C02-FAILED', title: '報表準時到了，真相塞在電梯裡', text: blockers.length ? `你明知仍有公開缺口就交付：${blockers.join('；')}。數字能開會，不能當帳。` : '證據其實齊全，但你選擇沒有驗收說明的冒險交付；客戶要求重補正式交付包。', facets: ['rushed', 'unverified'] };
    } else {
      ending = { baseId: 'C02-STOP', title: '先停在資料還能說人話的地方', text: `你保留目前契約、整合與測試紀錄，沒有把不確定數字包成完成品。${blockers.length ? ` 未完項目：${blockers.join('；')}。` : ''}`, facets: ['stopped', 'recoverable'] };
    }
    state.phase = 'ended';
    state.ending = ending;
    out = { type: 'ending', ending: clone(ending), blockers };
  }

  state.stateVersion += 1;
  state.log.push({ actionId, options: Object.fromEntries(Object.entries(raw).filter(([key]) => !['operationId', 'stateVersion'].includes(key))), resources: { token: state.token, stress: state.stress, time: state.timeLeft }, dataRevision: state.dataRevision });
  state.operationResults[operationId] = clone(out);
  return { state, result: out, cached: false };
}

export function chooseCase02Reward(original, cardId) {
  const state = clone(original);
  if (!state.progressionV2) {
    if (!state.pendingReward || !state.pendingReward.choices.includes(cardId)) throw new Error('這張卡不在目前獎勵中');
    const previousLevel = state.cards[cardId] ?? 0;
    state.cards[cardId] = Math.min(CARDS[cardId].maxLevel, previousLevel + 1);
    let disposition = previousLevel ? 'fused' : 'collected';
    if (!state.equipped.includes(cardId) && state.equipped.length < 3) { state.equipped.push(cardId); disposition = previousLevel ? 'fused' : 'equipped'; }
    if (!state.rewardClaims.includes('reward:integration-kit')) state.rewardClaims.push('reward:integration-kit');
    state.pendingReward = null; state.stateVersion += 1;
    return { state, reward: { kind: 'card', cardId, previousLevel, level: state.cards[cardId], disposition } };
  }
  const previousLevel = state.cards[cardId] ?? 0;
  const output = choosePendingRunReward(state, cardId);
  state.stateVersion += 1;
  const reward = output.reward.kind === 'card'
    ? { ...output.reward, cardId: output.reward.cardId, previousLevel, level: state.cards[output.reward.cardId], disposition: previousLevel ? 'fused' : 'collected' }
    : { ...output.reward, cardId: null, previousLevel: 0, level: 0, disposition: output.reward.kind };
  return { state, reward, repeated: output.repeated };
}

export function case02PublicView(state) {
  const blockers = publicBlockers(state);
  return {
    caseId: state.caseId,
    phase: state.phase,
    stateVersion: state.stateVersion,
    resources: { token: state.token, stress: state.stress, time: state.timeLeft },
    abilities: clone(state.abilities),
    cards: Object.entries(state.cards).map(([id, level]) => ({ id, name: CARDS[id].name, level, equipped: state.equipped.includes(id) })),
    contract: state.contract ? { ...state.contract, aligned: contractScore(state.contract), total: 3 } : null,
    normalization: clone(state.normalization),
    preIntegrationDebt: state.preIntegrationDebt ?? 0,
    integration: clone(state.integration),
    change: clone(state.change),
    tests: { ...clone(state.tests), stale: state.tests.testedRevision !== null && state.tests.testedRevision !== state.dataRevision },
    provenance: state.provenance,
    destructiveCleanup: state.destructiveCleanup,
    dataRevision: state.dataRevision,
    ledger: [...state.ledger],
    pendingReward: clone(state.pendingReward),
    ending: clone(state.ending),
    blockers,
    verifiedReady: blockers.length === 0,
  };
}

export { cardLevel as case02CardLevel, contractScore as case02ContractScore };
