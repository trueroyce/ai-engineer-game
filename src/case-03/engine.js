import { createStream, drawD100, drawSample, randomSeed } from '../core/rng.js';
import { CARDS, TEMPLATES } from '../narrative/rules.js';
import { CASE03_LIMITS, CASE03_REWARD_ID, CASE03_REWARD_POOL, STRATEGIES } from './rules.js';

const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const level = (state, id) => state.equipped.includes(id) ? (state.cards[id] ?? 0) : 0;
const payload = (actionId, raw) => JSON.stringify({ actionId, ...Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'stateVersion')) });

function event(state, actionId, ability, base, bonus = 0) {
  const threshold = clamp(base + state.abilities[ability] * 5 + bonus, 20, 95);
  const draw = drawD100(state.rng.event);
  state.rng.event = draw.stream;
  const success = draw.value <= threshold;
  state.eventAudit.push({ actionId, ability, threshold, roll: draw.value, index: draw.index, success });
  return success;
}

function process(title, summary, player, npc, followUp, consequence, outcome) {
  return { title, summary, process: { player, response: npc, followUp, consequence }, outcome };
}

function spend(state, preview) {
  if (state.token < preview.token) throw new Error(`Token 不足：需要 ${preview.token}`);
  if (state.timeLeft < preview.time) throw new Error(`時間不足：需要 ${preview.time}`);
  state.token -= preview.token;
  state.timeLeft -= preview.time;
  state.stress = clamp(state.stress + preview.stress, 0, CASE03_LIMITS.stressCap);
}

function milestone(state, id) { if (!state.ledger.includes(id)) state.ledger.push(id); }
function revoke(state, id) { state.ledger = state.ledger.filter((item) => item !== id); }

function rewardCandidates(state) {
  return CASE03_REWARD_POOL.filter((id) => (state.cards[id] ?? 0) < CARDS[id].maxLevel);
}

function createReward(state) {
  if (state.rewardLedgerSnapshot.includes(CASE03_REWARD_ID) || state.rewardClaims.includes('reward:handoff-kit')) return;
  const pool = rewardCandidates(state);
  if (!pool.length) {
    state.token = Math.min(CASE03_LIMITS.tokenCap, state.token + 2);
    state.rewardFallback = { kind: 'all-cards-maxed', token: 2 };
    state.rewardClaims.push('reward:handoff-kit');
    return;
  }
  const draw = drawSample(state.rng.reward, pool, Math.min(3, pool.length));
  state.rng.reward = draw.stream;
  state.pendingReward = { rewardId: CASE03_REWARD_ID, choices: draw.value };
}

export function createCase03Game(options = {}) {
  if (!TEMPLATES[options.templateId]) throw new Error('未知角色');
  const cards = clone(options.cards ?? {});
  const equipped = (options.equipped ?? []).filter((id) => cards[id]).slice(0, 3);
  const seed = Number.isInteger(options.seed) ? options.seed >>> 0 : randomSeed();
  return {
    caseId: 'case-03', ruleVersion: 'case-03-booking@1', phase: 'playing', templateId: options.templateId,
    abilities: clone(TEMPLATES[options.templateId].attrs), token: 18, stress: 0, timeLeft: 12,
    cards, equipped, requirements: null, contract: null, implementation: null, merge: null,
    change: { announced: false, handled: false }, evidence: { revision: null, coverage: 0, trace: false, failed: [] },
    artifactRevision: 0, integrationDebt: 0, ledger: [], rewardClaims: [], pendingReward: null, rewardFallback: null,
    rewardLedgerSnapshot: clone(options.rewardLedger ?? []), stateVersion: 0, operationResults: {}, operationPayloads: {}, log: [], ending: null,
    seed, rng: { event: createStream(options.eventRolls ? { values: options.eventRolls } : { seed }), reward: createStream(options.rewardDraws ? { values: options.rewardDraws } : { seed: seed ^ 0x31ca5e03 }) }, eventAudit: [],
  };
}

export function previewCase03Action(state, actionId, options = {}) {
  if (actionId === 'C01') {
    if (!['core', 'full'].includes(options.scope)) throw new Error('請先選擇需求範圍');
    const coreToken = Math.max(1, 2 - level(state, 'C8'));
    return { token: coreToken + (options.scope === 'full' ? 1 : 0), time: options.scope === 'full' ? 2 : 1, stress: 0 };
  }
  if (actionId === 'C02') return { token: Math.max(1, 2 - level(state, 'C7')), time: 1, stress: 0 };
  if (actionId === 'C03') {
    const strategy = STRATEGIES[options.strategy];
    if (!strategy) throw new Error('請先選擇分工方式');
    return { token: strategy.token, time: strategy.time, stress: strategy.stress, predictedDebt: strategy.debt };
  }
  if (actionId === 'C04') {
    if (!['strict', 'fast'].includes(options.mergeMode)) throw new Error('請先選擇合併方式');
    const c10 = level(state, 'C10');
    return options.mergeMode === 'fast'
      ? { token: Math.max(1, 2 - (c10 >= 2 ? 1 : 0)), time: Math.max(1, 2 - (c10 ? 1 : 0)), stress: 1, addedDebt: 1 }
      : { token: 3, time: 2, stress: 0, addedDebt: 0 };
  }
  if (actionId === 'C05') {
    if (!['negotiate', 'accept'].includes(options.response)) throw new Error('請先決定如何回應客戶');
    return { token: Math.max(1, 2 - (options.response === 'negotiate' ? level(state, 'C11') : 0)), time: 1, stress: Math.max(0, (options.response === 'accept' ? 2 : 1) - level(state, 'C8')) };
  }
  if (actionId === 'C06') {
    if (!['focused', 'full'].includes(options.scope)) throw new Error('請先選擇測試範圍');
    return { token: Math.max(1, (options.scope === 'full' ? 3 : 2) - (level(state, 'C9') >= 2 ? 1 : 0)), time: options.scope === 'full' ? 2 : 1, stress: 0, coverage: Math.min(4, (options.scope === 'full' ? 4 : 2) + (level(state, 'C9') ? 1 : 0)) };
  }
  if (actionId === 'C08') return { token: Math.max(1, 3 - level(state, 'C12')), time: 2, stress: 0 };
  if (actionId === 'C07') return { token: 0, time: 0, stress: 0 };
  throw new Error('未知工作');
}

function blockers(state) {
  const list = [];
  if (state.requirements?.scope === 'core') list.push('核心範圍未包含完整借用與取消責任');
  if (!state.requirements?.clear) list.push('需求矛盾尚未收斂');
  if (!state.contract?.approved) list.push('客戶尚未核准介面契約');
  if (!state.implementation?.complete) list.push('預約功能尚未完成');
  if (state.integrationDebt) list.push(`還有 ${state.integrationDebt} 點合併債`);
  if (!state.change.handled) list.push('最新需求變更尚未處理');
  if (state.evidence.revision !== state.artifactRevision || state.evidence.coverage < 4 || !state.evidence.trace || state.evidence.failed.length) list.push('目前 revision 缺少完整回歸與追溯');
  return list;
}

export function performCase03Action(original, actionId, raw = {}) {
  if (original.phase !== 'playing') throw new Error('案件已結束');
  if (typeof raw.operationId !== 'string' || !raw.operationId) throw new Error('缺少 operationId');
  const requestPayload = payload(actionId, raw);
  if (original.operationResults[raw.operationId]) {
    if (original.operationPayloads[raw.operationId] !== requestPayload) throw new Error('operation_id_conflict');
    return { state: clone(original), result: clone(original.operationResults[raw.operationId]), cached: true };
  }
  if (raw.stateVersion !== original.stateVersion) throw new Error('stale_state_version');
  if (actionId === 'C02' && !original.requirements) throw new Error('先處理需求矛盾');
  if (actionId === 'C03' && !original.contract?.approved) throw new Error('先取得客戶契約決策');
  if (actionId === 'C04' && !original.implementation?.complete) throw new Error('先完成分工實作');
  if (actionId === 'C05' && !original.merge?.complete) throw new Error('先完成合併 review');
  if (actionId === 'C06' && !original.change.announced) throw new Error('需求變更尚未出現');
  if (actionId === 'C08' && !original.integrationDebt && !original.evidence.failed.length) throw new Error('目前沒有需要修復的缺口');
  if (actionId === 'C07' && raw.intent === 'verified' && blockers(original).length) throw new Error(`尚未符合正式交付：${blockers(original).join('；')}`);

  if (actionId === 'C07' && raw.intent === 'limited' && !original.implementation?.complete) throw new Error('尚無可交付子集，不能有限試用');
  const state = clone(original);
  const cost = previewCase03Action(state, actionId, raw);
  spend(state, cost);
  let result;
  if (actionId === 'C01') {
    const success = event(state, actionId, 'A', 40, (raw.scope === 'core' ? 5 : -5) + level(state, 'C8') * 10);
    state.requirements = { clear: success, scope: raw.scope };
    if (success) milestone(state, 'requirements_decided'); else revoke(state, 'requirements_decided');
    result = success
      ? process('三句「很簡單」終於變成三個可回答的問題', '客戶確認誰能預約、誰能取消，以及借用衝突由誰裁決。', '你把模糊抱怨改寫成決策題。', '設計師停止畫第四版空狀態，工程師也把「看情況」從 enum 刪掉。', '下一步由客戶核准介面契約；agent 只能整理，不能代簽。', '需求範圍清楚，但還沒有任何功能或證據。', 'clear')
      : process('會議紀錄長出三個「之後再說」', '矛盾被看見但尚未收斂；可以付費重做，不會自動替客戶決定。', '你提出預約與借用衝突。', '客戶說「你們專業決定」，設計師與工程師同時看向天花板。', '可再次處理需求；下一次是新事件與新成本。', '本次沒有取得需求里程碑。', 'ambiguous');
    if (success) result.summary = raw.scope === 'core'
      ? '客戶只確認核心預約的建立與查看；借用、取消及衝突裁決明確留在本次範圍外。'
      : '客戶確認誰能預約、誰能取消，以及借用衝突由誰裁決。';
    result.process.consequence += raw.scope === 'core'
      ? ' 核心範圍成本較低，但不包含完整借用與取消責任，只能作為有限交付子集。'
      : ' 完整範圍多付出 Token 與時間，並承擔借用、取消及衝突處理責任，可進入正式驗收。';
  } else if (actionId === 'C02') {
    const bonus = raw.policy === 'explicit' ? 5 : 0;
    const success = event(state, actionId, 'A', 40, bonus + level(state, 'C7') * 10);
    state.contract = { approved: success, policy: raw.policy };
    if (success) milestone(state, 'interface_approved'); else revoke(state, 'interface_approved');
    result = success
      ? process('客戶真的按了「同意」，不是在聊天室貼一個讚', '時區、取消與重複借用回應已成為可 review 的契約。', '你展示兩種公開方案與代價。', '客戶選定政策；設計師更新狀態，工程師鎖定 payload。', '可以安排實作分工。', '決策來自客戶，不是 agent 自動腦補。', 'approved')
      : process('介面契約被一句「都可以」擊中', '客戶沒有完成決策；可付費再確認。', '你請客戶選取消與衝突政策。', 'agent 整理了八行摘要，但第九行仍是「待客戶決定」。', '再次確認，或止損交回未決事項。', '未核准契約不能進入正式實作。', 'unapproved');
  } else if (actionId === 'C03') {
    const strategy = STRATEGIES[raw.strategy];
    const success = event(state, actionId, 'E', 40, strategy.bonus + level(state, 'C11') * 5);
    state.implementation = { complete: true, strategy: raw.strategy, outcome: success ? 'aligned' : 'drifted' };
    state.integrationDebt += strategy.debt + (success ? 0 : 1);
    state.artifactRevision += 1;
    milestone(state, 'implementation_complete');
    createReward(state);
    const rewardFallback = state.rewardFallback;
    result = success
      ? process('設計稿與 API 第一次在同一個宇宙裡', `分工完成，公開合併債 ${state.integrationDebt}。`, '你選擇分工並交付同一份契約。', raw.strategy === 'solo' ? '你自己回覆自己，效率詭異地不錯。' : raw.strategy === 'pair' ? '設計師與工程師交換 review，不再用截圖當 API。' : '模擬 agent 產生接線草稿，NPC 逐項確認。', '下一步合併與 review。', 'agent 沒有替客戶決策；只處理已核准的工作。', 'implemented')
      : process('兩個按鈕叫同一個名字，API 卻回兩種時區', `功能可運行，但公開合併債升到 ${state.integrationDebt}。`, '你發出分工 brief。', 'NPC 找到規格漂移；模擬 agent 很有禮貌地複製了漂移。', '仍可合併 review，再付費修復。', '失敗留下可恢復狀態，不會假裝分工完成就等於整合完成。', 'drifted');
    if (rewardFallback) result.process.consequence += ` 卡片獎池已全滿，改領 ${rewardFallback.token} Token；stable reward ID 已記帳，不會重複領取。`;
  } else if (actionId === 'C04') {
    const success = event(state, actionId, 'E', 38, (raw.mergeMode === 'strict' ? 10 : -5) + level(state, 'C10') * 5);
    state.integrationDebt += cost.addedDebt + (success ? 0 : 1);
    state.merge = { complete: true, mode: raw.mergeMode, reviewed: success };
    if (!state.integrationDebt) milestone(state, 'merge_reviewed'); else revoke(state, 'merge_reviewed');
    result = success
      ? process('Merge 按鈕沒有冒煙，只冒出一張 review 清單', `合併完成，剩餘債務 ${state.integrationDebt}。`, '你選擇合併節奏。', '工程師 review payload，設計師 review 錯誤狀態。', '客戶的臨時需求正在路上。', '快速合併的公開債仍需修復；成功不是債務橡皮擦。', 'reviewed')
      : process('衝突解完了，語意衝突反而排隊進場', `合併完成但債務升到 ${state.integrationDebt}。`, '你處理分支衝突。', 'NPC 發現 cancellationReason 與 cancel_note 互不相識。', '可先處理需求變更，再使用修復工作。', '目前 revision 不能正式交付。', 'merge-conflict');
  } else if (actionId === 'C05') {
    const success = event(state, actionId, 'A', 38, (raw.response === 'negotiate' ? 10 : -5) + level(state, 'C11') * 10);
    state.change = { announced: true, handled: success, response: raw.response };
    state.artifactRevision += 1;
    state.evidence = { revision: null, coverage: 0, trace: false, failed: [] };
    if (success) milestone(state, 'change_contracted'); else { revoke(state, 'change_contracted'); state.integrationDebt += 1; }
    result = success
      ? process('「只改上限」被翻譯成一張可估的變更單', '客戶確認影響範圍；舊證據因 revision 改變而失效。', '你列出對 UI、API 與測試的影響。', '客戶選擇代價，NPC 更新契約。', '必須重跑目前 revision 的測試與追溯。', '沒有沿用舊綠燈冒充新證據。', 'contracted')
      : process('需求改完了，決策紀錄卻還在搭電梯', '變更已進入程式，但未形成可追溯決策並增加一點債。', '你嘗試確認借用上限。', '客戶回「先做再說」；agent 不能把這句翻成核准。', '可用修復工作補契約與整合。', '舊測試全部失效。', 'unresolved');
  } else if (actionId === 'C06') {
    const success = event(state, actionId, 'V', 35, (raw.scope === 'full' ? 10 : 0) + level(state, 'C9') * 10 + level(state, 'C12') * 5);
    state.evidence = { revision: state.artifactRevision, coverage: success ? cost.coverage : Math.max(1, cost.coverage - 1), trace: success && (raw.scope === 'full' || level(state, 'C12') > 0), failed: success ? [] : ['時區切換 fixture 沒有載入'] };
    if (success && state.evidence.coverage >= 4 && state.evidence.trace) milestone(state, 'current_evidence'); else revoke(state, 'current_evidence');
    result = success
      ? process('回歸燈亮了，這次真的是目前 revision', `覆蓋 ${state.evidence.coverage}/4；追溯${state.evidence.trace ? '完整' : '仍缺一段'}。`, '你選擇測試範圍並綁定 revision。', '設計師確認狀態，工程師確認 API，NPC 沒有人用肉眼假裝 CI。', '若仍有債務可修復後再測。', '證據只對目前版本有效。', 'tested')
      : process('測試 runner 在夏令時間那天請假', '目前 revision 留下可重跑的失敗。', '你啟動預約與借用回歸。', 'runner 漏載時區 fixture；NPC 沒把紅燈塗綠。', '可付費修復，再重跑測試。', '正式交付仍被阻擋。', 'test-failed');
  } else if (actionId === 'C08') {
    const success = event(state, actionId, 'E', 35, level(state, 'C12') * 10);
    if (success) {
      state.integrationDebt = 0;
      if (state.change.announced) { state.change.handled = true; milestone(state, 'change_contracted'); }
      state.evidence.failed = [];
      state.evidence.revision = null;
      state.evidence.coverage = 0;
      state.evidence.trace = false;
      milestone(state, 'merge_reviewed');
    }
    else state.stress = clamp(state.stress + 1, 0, 10);
    state.artifactRevision += success ? 1 : 0;
    result = success
      ? process('債務歸零，但測試不會自動復活', '契約與合併缺口已修復；因 revision 更新，需重跑證據。', '你把修復範圍綁在公開缺口。', 'NPC 對照介面與 API，agent 只產生草稿。', '下一步重跑回歸與追溯。', '修復沒有偽造綠燈。', 'repaired')
      : process('修掉一個欄位，另一個欄位開始用暱稱', '本次修復失敗；狀態仍可再次付費恢復。', '你處理公開債務。', '工程師找到新差異，設計師把它命名為「不是 bug，是語氣」。', '可再次修復或誠實有限交付／止損。', '沒有覆蓋先前證據或債務。', 'repair-failed');
  } else if (actionId === 'C07') {
    if (!['verified', 'limited', 'risk', 'stop'].includes(raw.intent)) throw new Error('請先選擇交付方式');
    if (raw.intent === 'verified') milestone(state, 'verified_delivery');
    const endings = {
      verified: ['C03-VERIFIED', '大家終於只改了一點點', '介面契約、NPC review、目前 revision 測試與追溯全部對齊。'],
      limited: ['C03-LIMITED', '有限試用，限制寫在第一頁', '可用範圍與缺口都被清楚交接，沒有把試用說成正式上線。'],
      risk: ['C03-FAILED', '先上再說，然後大家真的都有話說', '帶著已知缺口交付；結果誠實記為失敗而不是勇敢。'],
      stop: ['C03-STOP', '把止損寫進交接，不寫進遺書', '保留決策、review 與證據，回大廳再選案。'],
    };
    const [baseId, title, text] = endings[raw.intent];
    state.phase = 'ended'; state.ending = { baseId, title, text };
    result = { title, summary: text, ending: clone(state.ending), outcome: baseId };
  }
  state.stateVersion += 1;
  state.operationPayloads[raw.operationId] = requestPayload;
  state.operationResults[raw.operationId] = clone(result);
  state.log.push({ actionId, outcome: result.outcome, artifactRevision: state.artifactRevision });
  return { state, result, cached: false };
}

export function chooseCase03Reward(original, cardId) {
  if (!original.pendingReward?.choices.includes(cardId)) throw new Error('這張卡不在目前獎勵');
  if ((original.cards[cardId] ?? 0) >= CARDS[cardId].maxLevel) throw new Error('滿級卡不會進入獎池');
  const state = clone(original);
  const previousLevel = state.cards[cardId] ?? 0;
  state.cards[cardId] = Math.min(2, previousLevel + 1);
  let disposition = previousLevel ? 'fused' : 'collected';
  if (!state.equipped.includes(cardId) && state.equipped.length < 3) { state.equipped.push(cardId); disposition = previousLevel ? 'fused' : 'equipped'; }
  state.pendingReward = null;
  state.rewardClaims.push('reward:handoff-kit');
  return { state, reward: { cardId, previousLevel, level: state.cards[cardId], disposition } };
}

export function case03PublicView(state) {
  return {
    caseId: state.caseId, phase: state.phase, resources: { token: state.token, stress: state.stress, time: state.timeLeft },
    requirements: clone(state.requirements), contract: clone(state.contract), implementation: clone(state.implementation), merge: clone(state.merge), change: clone(state.change),
    artifactRevision: state.artifactRevision, integrationDebt: state.integrationDebt, evidence: clone(state.evidence), blockers: blockers(state), verifiedReady: blockers(state).length === 0,
    cards: Object.entries(state.cards).map(([id, cardLevel]) => ({ id, name: CARDS[id].name, level: cardLevel, equipped: state.equipped.includes(id) })),
    pendingReward: clone(state.pendingReward), rewardFallback: clone(state.rewardFallback), ending: clone(state.ending),
  };
}
