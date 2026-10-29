const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const activeLevel = (state, id) => state.equipped?.includes(id) ? (state.cards?.[id] ?? 0) : 0;

const EMPTY_COMMITMENTS = Object.freeze({
  asyncApproval: 'none',
  interfaceDrift: 'none',
  fastMerge: 'none',
  prototypePromise: 'none',
  extraAdmin: 'none',
  unapprovedBuild: 'none',
});

export function normalizeCase03Story(value = {}) {
  return {
    scope: ['full', 'core', 'prototype'].includes(value.scope) ? value.scope : 'full',
    quality: clamp(Number.isInteger(value.quality) ? value.quality : 0, 0, 4),
    prototype: value.prototype && typeof value.prototype === 'object' ? clone(value.prototype) : null,
    lockedSlice: Boolean(value.lockedSlice),
    openRecovery: value.openRecovery && typeof value.openRecovery === 'object' ? clone(value.openRecovery) : null,
    recoveryHistory: Array.isArray(value.recoveryHistory) ? clone(value.recoveryHistory).slice(0, 8) : [],
    openOpportunity: value.openOpportunity && typeof value.openOpportunity === 'object' ? clone(value.openOpportunity) : null,
    opportunityHistory: Array.isArray(value.opportunityHistory) ? clone(value.opportunityHistory).slice(0, 4) : [],
    commitments: { ...EMPTY_COMMITMENTS, ...(value.commitments ?? {}) },
    issues: Array.isArray(value.issues) ? clone(value.issues).slice(0, 12) : [],
    consequences: Array.isArray(value.consequences) ? clone(value.consequences).slice(0, 12) : [],
  };
}

function rescueCard(state, sourceAction) {
  const groups = ['C01', 'C02'].includes(sourceAction)
    ? [['C8', '拿上次決策紀錄談換項'], ['C11', '把爭議翻成兩個客戶能回答的方案']]
    : ['C03', 'C04'].includes(sourceAction)
      ? [['C4', '鎖住壞接點，先保已驗切片'], ['C15', 'Merge 防爆毯隔離衝突']]
      : [['C9', '回歸測試組鎖定失敗案例'], ['C12', '交付檢查表補齊追溯']];
  const [cardId, label] = groups.find(([id]) => activeLevel(state, id)) ?? [];
  return cardId ? { id: 'card-rescue', cardId, label } : null;
}

export function case03RecoveryChoices(state) {
  const source = state.story?.openRecovery?.sourceAction;
  if (!source) return [];
  return [
    { id: 'prototype', label: '做可丟棄原型給客戶按', detail: '1 Token、1 時間；釐清一個責任問題，但不算正式 implementation。' },
    { id: 'trim', label: '把範圍縮成可核准切片', detail: '2 Token、1 時間；得到明示的核心契約，之後只能按核心責任驗收。' },
    { id: 'force', label: '先硬做，再補客戶決策', detail: '1 Token、壓力 +2；可往實作前進，但留下未核准工作 blocker。' },
    rescueCard(state, source),
  ].filter(Boolean);
}

export function case03OpportunityChoices(state) {
  if (!state.story?.openOpportunity) return [];
  const negotiation = activeLevel(state, 'C8') ? { id: 'card-negotiate', cardId: 'C8', label: `決策紀錄簿 Lv.${activeLevel(state, 'C8')}：拿核准範圍換一項`, detail: '1 Token、1 時間；品質 +1，額外需求明確延期，不會無中生有變成核准。' }
    : activeLevel(state, 'C11') ? { id: 'card-negotiate', cardId: 'C11', label: `客戶人話轉接器 Lv.${activeLevel(state, 'C11')}：給兩個可選方案`, detail: '1 Token、1 時間；品質 +1，留下客戶選過的方案。' } : null;
  const exchange = activeLevel(state, 'C5')
    ? { id: 'card-exchange', cardId: 'C5', label: `節奏管理 Lv.${activeLevel(state, 'C5')}：休整換資源`, detail: '花 1 時間；回復 2 Token、降低 1 壓力，不改變核准或證據。' }
    : activeLevel(state, 'C10')
      ? { id: 'card-exchange', cardId: 'C10', label: `合併號誌 Lv.${activeLevel(state, 'C10')}：借債換合併時間`, detail: '增加 1 壓力與 1 點公開整合債；取回 1 時間，之後仍須處理債務。' }
      : null;
  return [
    exchange,
    { id: 'steady', label: '鎖住已驗切片', detail: '不花資源；保留目前契約與證據，不順手多合一支。' },
    { id: 'improve', label: '補完介面與追溯', detail: '2 Token、1 時間；品質 +1，改善一項具名債務或證據。' },
    { id: 'gamble', label: '順手加「只有一個」管理員功能', detail: '1 Token、壓力 +1，品質潛力 +2；需求變更時會回來收帳。' },
    negotiation,
  ].filter(Boolean);
}

export function case03ConsequenceChoices(state) {
  const story = normalizeCase03Story(state.story);
  const choices = [];
  if (['pending', 'surfaced'].includes(story.commitments.asyncApproval) || ['pending', 'surfaced'].includes(story.commitments.prototypePromise) || ['pending', 'surfaced'].includes(story.commitments.extraAdmin) || ['pending', 'surfaced'].includes(story.commitments.unapprovedBuild)) {
    choices.push({ id: 'decision-meeting', label: '找真正的決策人裁決', detail: '2 Token、1 時間；解決一個客戶責任問題，不動工程債。' });
    choices.push({ id: 'defer', label: '維持已核准範圍，明確排下一版', detail: '1 Token、1 時間；把新增承諾延期，交付範圍縮成核心切片。' });
  }
  if (['pending', 'surfaced'].includes(story.commitments.interfaceDrift) || ['pending', 'surfaced'].includes(story.commitments.fastMerge)) {
    choices.push({ id: 'adapter', label: '做版本轉接並重跑受影響測試', detail: '2 Token、1 時間；降低 1 點整合債，保留無關證據。' });
  }
  const c15 = activeLevel(state, 'C15');
  if (c15 && choices.length) choices.push({ id: 'card-isolate', cardId: 'C15', label: `Merge 防爆毯 Lv.${c15}：隔離壞接點`, detail: '1 Token、1 時間；保住已驗切片，但問題只變成已隔離，不算修好。' });
  return choices;
}

export function previewCase03StoryAction(state, actionId, options = {}) {
  const choices = actionId === 'C09' ? case03RecoveryChoices(state) : actionId === 'C10' ? case03OpportunityChoices(state) : case03ConsequenceChoices(state);
  const selected = choices.find((item) => item.id === options.route);
  if (!selected) throw new Error('請先選擇後續路線');
  if (actionId === 'C09') {
    if (selected.id === 'prototype') return { token: 1, time: 1, stress: 0, selected };
    if (selected.id === 'trim') return { token: 2, time: 1, stress: 0, selected };
    if (selected.id === 'force') return { token: 1, time: 0, stress: 2, selected };
    return { token: 1, time: 1, stress: 0, selected };
  }
  if (actionId === 'C11') {
    if (selected.id === 'defer' || selected.id === 'card-isolate') return { token: 1, time: 1, stress: 0, selected };
    return { token: 2, time: 1, stress: 0, selected };
  }
  if (selected.id === 'steady') return { token: 0, time: 0, stress: 0, selected };
  if (selected.id === 'card-exchange') return selected.cardId === 'C5'
    ? { token: 0, time: 1, stress: 0, selected }
    : { token: 0, time: 0, stress: 1, selected };
  if (selected.id === 'improve') return { token: 2, time: 1, stress: 0, selected };
  if (selected.id === 'gamble') return { token: 1, time: 0, stress: 1, selected };
  return { token: 1, time: 1, stress: 0, selected };
}

function spend(state, cost) {
  if (state.token < cost.token) throw new Error(`Token 不足：需要 ${cost.token}`);
  if (state.timeLeft < cost.time) throw new Error(`時間不足：需要 ${cost.time}`);
  state.token -= cost.token;
  state.timeLeft -= cost.time;
  state.stress = clamp(state.stress + cost.stress, 0, 10);
}

function upsertIssue(story, id, source, impact, status = 'open') {
  const current = story.issues.find((item) => item.id === id);
  if (current) { current.status = status; current.impact = impact; return current; }
  const issue = { id, source, impact, status };
  story.issues.push(issue);
  return issue;
}

function resolveIssue(story, id) {
  const issue = story.issues.find((item) => item.id === id);
  if (issue) issue.status = 'resolved';
}

function routeResult(title, summary, player, response, consequence) {
  return { title, summary, process: { player, response, followUp: '新的承諾、問題與可用動作已回到工作板。', consequence }, outcome: 'story-route' };
}

export function performCase03StoryAction(state, actionId, options = {}) {
  state.story = normalizeCase03Story(state.story);
  const cost = previewCase03StoryAction(state, actionId, options);
  spend(state, cost);
  const route = cost.selected.id;
  let result;
  if (actionId === 'C09') {
    const sourceAction = state.story.openRecovery.sourceAction;
    if (route === 'prototype') {
      state.story.scope = 'prototype';
      state.story.prototype = { complete: true, disposable: true, sourceAction };
      if (!state.requirements) state.requirements = { clear: true, scope: 'prototype' };
      state.story.commitments.prototypePromise = 'pending';
      upsertIssue(state.story, 'prototype-not-production', sourceAction, '原型可供決策，但不可作為正式功能');
      result = routeResult('先讓客戶真的按一次', '原型揭露一個可回答的責任問題，但 implementation 仍未完成。', '你用假資料做了可丟棄流程。', '客戶按下取消後說：「我以為取消的是借用，不是預約。」', '原型已公開標示不可部署；下一步可重做契約或縮成核心切片。');
    } else if (route === 'trim') {
      state.story.scope = 'core';
      state.requirements = { clear: true, scope: 'core' };
      state.contract = { approved: true, policy: 'explicit', limited: true };
      upsertIssue(state.story, 'deferred-responsibilities', sourceAction, '取消與借用衝突明確延期到下一版');
      result = routeResult('把「都要」換成可核准切片', '客戶核准核心預約流程，取消與借用責任明確延期。', '你列出本版一定做與下一版再談的項目。', '客戶選了能在期限內真正驗收的版本。', '核心切片可進實作；正式交付必須明示縮限責任。');
    } else if (route === 'force') {
      state.story.commitments.unapprovedBuild = 'pending';
      if (!state.requirements) state.requirements = { clear: false, scope: 'full' };
      state.contract = { approved: true, policy: 'forced-draft', unapproved: true };
      upsertIssue(state.story, 'unapproved-build', sourceAction, '程式先做但客戶責任尚未核准');
      result = routeResult('先做再說的勇氣，通常由未來的你買單', '你可以往實作走，但未核准工作會阻止正式交付。', '你按現場最響亮的意見先寫。', '設計師與工程師同時問：「這真的是客戶決定的嗎？」', '未核准承諾已列入 blocker；之後仍要談判、縮限或止損。');
    } else {
      const cardId = cost.selected.cardId;
      if (['C8', 'C11'].includes(cardId)) {
        state.requirements = { clear: true, scope: state.requirements?.scope ?? 'core' };
        state.contract = { approved: true, policy: 'explicit', viaCard: cardId };
        resolveIssue(state.story, 'unapproved-build');
        state.story.commitments.unapprovedBuild = 'resolved';
      } else if (['C4', 'C15'].includes(cardId)) {
        state.integrationDebt = Math.max(0, state.integrationDebt - 1);
        state.story.lockedSlice = true;
        upsertIssue(state.story, 'isolated-interface', sourceAction, '壞接點已隔離，未修功能仍不算完成', 'contained');
      } else {
        state.evidence.failed = state.evidence.failed.slice(1);
        state.evidence.coverage = Math.min(4, state.evidence.coverage + 1);
      }
      result = routeResult(`${cost.selected.label}接手`, '卡片只處理它語意上能處理的問題；其他責任仍保留。', `你啟用 ${cardId} 的特殊路線。`, 'NPC 看到的是具體選項與影響，不是 AI 替客戶簽名。', '無卡路線仍可用；這次卡片只改成本與風險。');
    }
    state.story.recoveryHistory.push({ sourceAction, route });
    state.story.openRecovery = null;
  } else if (actionId === 'C10') {
    const sourceAction = state.story.openOpportunity.sourceAction;
    if (route === 'steady') {
      state.story.lockedSlice = true;
      result = routeResult('把成功鎖成可驗切片', '目前接口與證據保留，不再順手合併新分支。', '你標記已驗 revision 與責任邊界。', 'NPC 第一次因為沒有新驚喜而露出放心的表情。', '之後需求變更只失效真正受影響的證據。');
    } else if (route === 'improve') {
      state.story.quality = clamp(state.story.quality + 1, 0, 4);
      state.integrationDebt = Math.max(0, state.integrationDebt - 1);
      if (state.evidence.revision === state.artifactRevision) state.evidence.coverage = Math.min(4, state.evidence.coverage + 1);
      result = routeResult('把接口、提示與追溯一起補齊', '品質 +1，並實際改善一項債務或目前 revision 的證據。', '你補上責任提示與 API 範例。', '設計師終於不用從工程師的眉毛角度猜欄位語意。', '改善只屬於目前 revision，後續改動仍按依賴失效。');
    } else if (route === 'gamble') {
      state.story.quality = clamp(state.story.quality + 2, 0, 4);
      state.story.commitments.extraAdmin = 'pending';
      upsertIssue(state.story, 'extra-admin', sourceAction, '額外管理員身分尚未納入核准契約');
      result = routeResult('「只多一個管理員」進入聊天室', '品質潛力 +2，但新身分會在變更處理時要求責任與測試。', '你順手加了管理員入口。', '客戶說這不是新功能，只是多一整套權限。', '額外需求已公開列為待決，不會偷偷降低成功率。');
    } else if (route === 'card-exchange') {
      if (cost.selected.cardId === 'C5') {
        state.token = Math.min(24, state.token + 2);
        state.stress = Math.max(0, state.stress - 1);
        result = routeResult('先讓所有人停止說「只改一點點」五分鐘', '花一段時間休整，換回 2 Token 並降低 1 壓力；核准與證據沒有被偷偷改寫。', '你暫停會議，整理真正已確認的範圍。', 'NPC 終於在同一張白板上說話。', '休整只交換資源，不會新增 EXP 或替客戶決策。');
      } else {
        state.timeLeft = Math.min(12, state.timeLeft + 1);
        state.integrationDebt += 1;
        state.story.commitments.fastMerge = 'surfaced';
        upsertIssue(state.story, 'coordination-debt', sourceAction, '借來的合併時間留下 1 點協調債');
        result = routeResult('合併號誌放行一格，債務也跟著上車', '取回 1 時間，但新增 1 點公開整合債；後續 review 仍會看到它。', '你允許暫時轉接目前接口，並把債務寫入交接。', '設計師與工程師同意先過，但都拒絕替債務取名字。', '省下的是排程時間，不是驗收責任。');
      }
    } else {
      state.story.quality = clamp(state.story.quality + 1, 0, 4);
      state.story.commitments.extraAdmin = 'resolved';
      resolveIssue(state.story, 'extra-admin');
      result = routeResult(`${cost.selected.label}`, '你用既有核准範圍談成一項等價交換，沒有憑空增加承諾。', '你把兩個方案與影響交給客戶選。', '客戶正式把額外身分排進下一版。', '目前版本維持可驗收，決策紀錄會留到結案。');
    }
    state.story.opportunityHistory.push({ sourceAction, route });
    state.story.openOpportunity = null;
  } else {
    if (route === 'decision-meeting') {
      const key = ['asyncApproval', 'prototypePromise', 'extraAdmin', 'unapprovedBuild'].find((id) => ['pending', 'surfaced'].includes(state.story.commitments[id]));
      if (key) state.story.commitments[key] = 'resolved';
      if (key === 'unapprovedBuild') { state.contract = { approved: true, policy: 'explicit', resolvedFromDraft: true }; resolveIssue(state.story, 'unapproved-build'); }
      if (key === 'extraAdmin') resolveIssue(state.story, 'extra-admin');
      if (key === 'prototypePromise') resolveIssue(state.story, 'prototype-not-production');
      result = routeResult('真正的決策人終於坐到桌前', '一項客戶責任已明確裁決；工程債沒有被順便清掉。', '你把影響、成本與兩個方案放在同一頁。', '客戶選了責任人與版本，不再只回讚。', '決策只解決對應承諾，其他具名問題仍留在工作板。');
    } else if (route === 'defer') {
      for (const key of ['prototypePromise', 'extraAdmin']) if (['pending', 'surfaced'].includes(state.story.commitments[key])) state.story.commitments[key] = 'resolved';
      state.story.scope = 'core';
      state.requirements = { clear: true, scope: 'core' };
      resolveIssue(state.story, 'extra-admin');
      resolveIssue(state.story, 'prototype-not-production');
      result = routeResult('新增需求有去處，不是消失', '額外功能正式排到下一版，本版維持核心切片責任。', '你保留已核准範圍並寫出下一版入口條件。', '客戶確認延期，不再把「拒絕新增」當成沒處理。', '本局只能按核心切片交付；完整責任沒有被假裝完成。');
    } else if (route === 'adapter') {
      if (['pending', 'surfaced'].includes(state.story.commitments.interfaceDrift)) state.story.commitments.interfaceDrift = 'resolved';
      else state.story.commitments.fastMerge = 'resolved';
      state.integrationDebt = Math.max(0, state.integrationDebt - 1);
      state.evidence.failed = state.evidence.failed.filter((item) => !/cancel 欄位/.test(item));
      resolveIssue(state.story, 'late-interface-conflict');
      resolveIssue(state.story, 'fast-merge-regression');
      resolveIssue(state.story, 'coordination-debt');
      result = routeResult('兩個 cancel 欄位簽了停戰協議', '版本轉接降低 1 點整合債，無關證據維持原狀。', '你建立欄位轉接與受影響測試清單。', '設計師與工程師終於可以各自保留命名品味，不再保留兩套行為。', '只修接口分歧；客戶未決需求仍需另外處理。');
    } else {
      const target = ['interfaceDrift', 'fastMerge'].find((id) => ['pending', 'surfaced'].includes(state.story.commitments[id]));
      if (target) state.story.commitments[target] = 'contained';
      state.story.lockedSlice = true;
      result = routeResult('防爆毯鎖住壞掉的接點', '已驗切片被保住，未修功能仍以隔離限制存在。', '你把衝突接口從交付路徑切開。', 'NPC 可以繼續驗其他流程。', '隔離不等於修復；正式完整交付仍會被 blocker 擋住。');
    }
    state.story.consequences.push({ id: `resolved:${route}`, text: result.summary });
  }
  return { result, cost };
}

function addConsequence(story, id, text) {
  if (!story.consequences.some((item) => item.id === id)) story.consequences.push({ id, text });
}

export function observeCase03Story(state, actionId, options, result) {
  state.story = normalizeCase03Story(state.story);
  const story = state.story;
  if (actionId === 'C02' && options.policy === 'async') story.commitments.asyncApproval = 'pending';
  if (actionId === 'C03' && options.strategy === 'agent') story.commitments.interfaceDrift = 'pending';
  if (actionId === 'C04' && options.mergeMode === 'fast') story.commitments.fastMerge = 'pending';

  if (actionId === 'C04') {
    const lines = [];
    if (story.commitments.asyncApproval === 'pending') { story.commitments.asyncApproval = 'surfaced'; state.integrationDebt += 1; lines.push('非同步核准沒有明確責任人'); }
    if (story.commitments.interfaceDrift === 'pending') { story.commitments.interfaceDrift = 'surfaced'; state.integrationDebt += 1; lines.push('平行 agent 的 UI 與 API 欄位分歧'); }
    if (lines.length) {
      upsertIssue(story, 'late-interface-conflict', actionId, lines.join('、'));
      addConsequence(story, 'merge-found-early-choices', `合併時發現：${lines.join('、')}`);
      if (result.process) result.process.consequence += ` 延後後果：${lines.join('、')}，各新增 1 點整合債。`;
    }
  }

  if (actionId === 'C05') {
    const lines = [];
    if (story.commitments.prototypePromise === 'pending') { story.commitments.prototypePromise = 'surfaced'; lines.push('客戶把原型按鈕當成已承諾功能'); }
    if (story.commitments.extraAdmin === 'pending') { story.commitments.extraAdmin = 'surfaced'; lines.push('額外管理員身分需要新的權限契約'); }
    if (lines.length) {
      state.change.handled = false;
      state.integrationDebt += 1;
      upsertIssue(story, 'change-package', actionId, lines.join('、'));
      if (result.process) result.process.consequence += ` 延後後果：${lines.join('、')}；變更仍待決，新增 1 點整合債。`;
    }
  }

  if (actionId === 'C06' && story.commitments.fastMerge === 'pending') {
    story.commitments.fastMerge = 'surfaced';
    if (!state.evidence.failed.includes('快速合併的 cancel 欄位沒有版本轉接')) state.evidence.failed.push('快速合併的 cancel 欄位沒有版本轉接');
    upsertIssue(story, 'fast-merge-regression', actionId, '快速合併留下 cancel 欄位版本差異');
    if (result.process) result.process.consequence += ' 延後後果：早先快速合併的 cancel 欄位在回歸時分成兩個版本。';
  }

  if (actionId === 'C08' && state.lastAttempt?.outcome === 'success') {
    for (const key of ['asyncApproval', 'interfaceDrift', 'fastMerge']) if (story.commitments[key] === 'surfaced') story.commitments[key] = 'resolved';
    for (const issue of story.issues) if (['late-interface-conflict', 'fast-merge-regression'].includes(issue.id)) issue.status = 'resolved';
  }

  const attempt = state.lastAttempt;
  if (attempt && ['failure', 'partial'].includes(attempt.outcome) && !story.openRecovery) {
    story.openRecovery = { sourceAction: actionId, failureEvent: attempt.failureEvent ?? null, outcome: attempt.outcome };
  }
  if (attempt?.outcome === 'success' && ['C01', 'C03', 'C04', 'C06'].includes(actionId)
    && !story.openOpportunity && story.opportunityHistory.length === 0) story.openOpportunity = { sourceAction: actionId };
}

export function case03StoryBlockers(state) {
  const story = normalizeCase03Story(state.story);
  const blockers = [];
  if (story.scope === 'prototype') blockers.push('可丟棄原型不能當正式 implementation');
  if (story.scope === 'core') blockers.push('目前只核准核心切片，完整責任已延期');
  const labels = {
    asyncApproval: '非同步核准缺少明確責任人',
    interfaceDrift: '平行 agent 的 UI/API 介面分歧尚未解決',
    fastMerge: '快速合併的版本轉接尚未補證據',
    prototypePromise: '原型功能是否列入承諾尚未決議',
    extraAdmin: '額外管理員身分尚未完成契約決議',
    unapprovedBuild: '先做的功能尚未取得客戶核准',
  };
  for (const [key, status] of Object.entries(story.commitments)) {
    if (status === 'pending' || status === 'surfaced') blockers.push(labels[key]);
    if (status === 'contained') blockers.push(`${labels[key]}（已隔離，只能有限交付）`);
  }
  for (const issue of story.issues) if (issue.status === 'open' || issue.status === 'contained') blockers.push(issue.impact);
  return [...new Set(blockers)];
}
