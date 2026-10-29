const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const activeLevel = (state, id) => state.equipped?.includes(id) ? (state.cards?.[id] ?? 0) : 0;

const EMPTY_COMMITMENTS = Object.freeze({
  parallelSchemaDrift: 'none',
  deletedRows: 'none',
  verbalChange: 'none',
  extraSource: 'none',
  forcedPatch: 'none',
});

export function normalizeCase02Story(value = {}) {
  return {
    scope: ['full', 'prototype', 'trimmed'].includes(value.scope) ? value.scope : 'full',
    quality: clamp(Number.isInteger(value.quality) ? value.quality : 0, 0, 4),
    openRecovery: value.openRecovery && typeof value.openRecovery === 'object' ? clone(value.openRecovery) : null,
    recoveryHistory: Array.isArray(value.recoveryHistory) ? clone(value.recoveryHistory).slice(0, 8) : [],
    openOpportunity: value.openOpportunity && typeof value.openOpportunity === 'object' ? clone(value.openOpportunity) : null,
    opportunityHistory: Array.isArray(value.opportunityHistory) ? clone(value.opportunityHistory).slice(0, 4) : [],
    commitments: { ...EMPTY_COMMITMENTS, ...(value.commitments ?? {}) },
    consequences: Array.isArray(value.consequences) ? clone(value.consequences).slice(0, 12) : [],
  };
}

function cardRescue(state, sourceAction) {
  const candidates = sourceAction === 'B01' || sourceAction === 'B02'
    ? [['C7', '格式翻譯器：把爭議欄位帶回資料契約']]
    : sourceAction === 'B06'
      ? [['C9', '回歸測試組：隔離失敗 fixture 再驗一次']]
      : sourceAction === 'B07'
        ? [['C12', '交付檢查表：補回來源鏈缺口']]
        : [['C4', '除錯手冊：逐欄修復而不是整批砍掉']];
  const semantic = ['B01', 'B02', 'B04'].includes(sourceAction)
    ? [['C8', '決策紀錄簿：拿既有確認範圍談換項'], ['C11', '客戶人話轉接器：整理兩個可選方案']]
    : ['B03', 'B05'].includes(sourceAction)
      ? [['C4', '除錯助手：鎖住壞接點'], ['C15', 'Merge 防爆毯：隔離衝突']]
      : [];
  const [cardId, label] = semantic.find(([id]) => activeLevel(state, id))
    ?? candidates.find(([id]) => activeLevel(state, id))
    ?? [];
  return cardId ? { id: 'card-rescue', cardId, label } : null;
}

export function case02RecoveryChoices(state) {
  const source = state.story?.openRecovery?.sourceAction;
  if (!source) return [];
  return [
    { id: 'prototype', label: '先做隔離原型', detail: '花 1 Token、1 時間；保留可驗證子集，但正式交付會被標成有限範圍。' },
    { id: 'trim', label: '砍範圍並寫清楚', detail: '花 2 Token、1 時間；降低兩點債務，換成明示的縮限交付。' },
    { id: 'force', label: '今晚硬做補丁', detail: '花 1 Token、不花時間、壓力 +2；工作前進，但延後留下補丁債。' },
    cardRescue(state, source),
  ].filter(Boolean);
}

export function case02OpportunityChoices(state) {
  if (!state.story?.openOpportunity) return [];
  const radar = activeLevel(state, 'C18');
  const exchange = activeLevel(state, 'C5')
    ? { id: 'card-exchange', cardId: 'C5', label: `節奏管理 Lv.${activeLevel(state, 'C5')}：休整換資源`, detail: '花 1 時間；回復 2 Token、降低 1 壓力。成功成果不變，也不新增進度。' }
    : activeLevel(state, 'C10')
      ? { id: 'card-exchange', cardId: 'C10', label: `合併號誌 Lv.${activeLevel(state, 'C10')}：借協調債搶時間`, detail: '增加 1 壓力與 1 點公開整合債；品質 +1，不會免費清掉後果。' }
      : null;
  return [
    exchange,
    { id: 'steady', label: '穩穩收手', detail: '不花資源，不新增承諾；把現在的成功留給後續驗證。' },
    { id: 'improve', label: '補一層品質', detail: '花 2 Token、1 時間；品質 +1，並改善一項現有債務或證據。' },
    { id: 'gamble', label: '順手多併一個來源', detail: '花 1 Token、壓力 +1，品質 +2；額外來源會在測試或追溯時回來找你。' },
    radar ? { id: 'card-radar', cardId: 'C18', label: `邊界雷達 Lv.${radar}：安全擴充`, detail: '花 1 Token、1 時間；品質 +1，先標出新增來源邊界，不留隱性承諾。' } : null,
  ].filter(Boolean);
}

export function case02ConsequenceChoices(state) {
  const story = normalizeCase02Story(state.story);
  const choices = [];
  if (['pending', 'surfaced'].includes(story.commitments.parallelSchemaDrift)) choices.push({ id: 'shared-sample', label: '拿共用樣本重新對一次', detail: '2 Token、1 時間；解決平行 agent 欄位分歧，降低 1 點整合債。' });
  if (['pending', 'surfaced'].includes(story.commitments.deletedRows)) choices.push({ id: 'rebuild-source', label: '向來源部門重建缺漏列', detail: '3 Token、2 時間；可還原來源，但不會假裝刪除從未發生。' });
  if (['pending', 'surfaced'].includes(story.commitments.verbalChange)) choices.push({ id: 'recontract', label: '把口頭變更補回契約', detail: '2 Token、1 時間；需求變更成為可驗收規則。' });
  if (['pending', 'surfaced'].includes(story.commitments.extraSource) || ['pending', 'surfaced'].includes(story.commitments.forcedPatch)) choices.push({ id: 'targeted-proof', label: '只補受影響的回歸與追溯', detail: '2 Token、1 時間；處理追加來源或補丁，不重跑無關證據。' });
  const c15 = activeLevel(state, 'C15');
  if (c15 && choices.length) choices.push({ id: 'card-isolate', cardId: 'C15', label: `Merge 防爆毯 Lv.${c15}：隔離壞接點`, detail: '1 Token、1 時間；保住未受影響證據，問題仍會以已隔離狀態留在紀錄。' });
  return choices;
}

export function previewCase02StoryAction(state, actionId, options = {}) {
  const choices = actionId === 'B10' ? case02RecoveryChoices(state) : actionId === 'B11' ? case02OpportunityChoices(state) : case02ConsequenceChoices(state);
  const selected = choices.find((item) => item.id === options.route);
  if (!selected) throw new Error('請先選擇後續路線');
  if (actionId === 'B10') {
    if (selected.id === 'prototype') return { token: 1, time: 1, stress: 0, selected };
    if (selected.id === 'trim') return { token: 2, time: 1, stress: 0, selected };
    if (selected.id === 'force') return { token: 1, time: 0, stress: 2, selected };
    return { token: 1, time: 1, stress: 0, selected };
  }
  if (actionId === 'B12') {
    if (selected.id === 'rebuild-source') return { token: 3, time: 2, stress: 0, selected };
    if (selected.id === 'card-isolate') return { token: 1, time: 1, stress: 0, selected };
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

function spend(state, preview) {
  if (state.token < preview.token) throw new Error(`Token 不足：需要 ${preview.token}`);
  if (state.timeLeft < preview.time) throw new Error(`時間不足：需要 ${preview.time}`);
  state.token -= preview.token;
  state.timeLeft -= preview.time;
  state.stress = clamp(state.stress + preview.stress, 0, 10);
  state.workCount = (state.workCount ?? 0) + (preview.time || preview.token ? 1 : 0);
}

function resolveOneDebt(state, amount = 1) {
  if (state.integration?.complete) state.integration.unresolvedDebt = Math.max(0, state.integration.unresolvedDebt - amount);
  else if (state.normalization) state.normalization.predictedDebt = Math.max(0, state.normalization.predictedDebt - amount);
  else state.preIntegrationDebt = Math.max(0, (state.preIntegrationDebt ?? 0) - amount);
}

function addConsequence(story, id, text) {
  if (!story.consequences.some((item) => item.id === id)) story.consequences.push({ id, text });
}

export function performCase02StoryAction(state, actionId, options = {}) {
  state.story = normalizeCase02Story(state.story);
  const preview = previewCase02StoryAction(state, actionId, options);
  spend(state, preview);
  const route = preview.selected.id;
  let result;
  if (actionId === 'B10') {
    const sourceAction = state.story.openRecovery.sourceAction;
    if (route === 'prototype') {
      state.story.scope = 'prototype';
      resolveOneDebt(state, 1);
      result = routeResult('把失敗關進隔離原型', '你保住一段可操作資料，代價是它只能算有限範圍成果。', '你把壞掉的路徑縮成一個可重現小樣本。', '團隊終於能對著同一份輸出吵架，不再隔空通靈。', '後續可繼續整合與測試，但正式交付會標示原型範圍。');
    } else if (route === 'trim') {
      state.story.scope = 'trimmed';
      resolveOneDebt(state, 2);
      result = routeResult('砍掉不能證明的範圍', '責任變小、債務下降，但客戶會看到清楚的限制清單。', '你把「全部都要」改寫成可驗收的核心欄位。', '客戶沉默三秒後承認，原來他最在意的只有兩欄。', '範圍縮限已寫進交付條件，不會被包裝成完整成功。');
    } else if (route === 'force') {
      state.story.commitments.forcedPatch = 'pending';
      resolveOneDebt(state, 1);
      result = routeResult('補丁先上，睡眠稍後再說', '眼前流程恢復，但「硬做補丁」會在測試時要求補證據。', '你在 mapping 外面再包一層 mapping。', '終端機安靜了；這通常不是好消息，只是它也累了。', '延後承諾已公開記錄，完整測試前不能算正式完成。');
    } else {
      const cardId = preview.selected.cardId;
      if (cardId === 'C7') { if (state.contract) state.contract.clarity = true; resolveOneDebt(state, 1); }
      if (['C8', 'C11'].includes(cardId)) { if (state.contract) state.contract.clarity = true; state.story.scope = 'trimmed'; }
      if (['C4', 'C15'].includes(cardId)) { resolveOneDebt(state, 2); state.destructiveCleanup = false; }
      if (cardId === 'C9') { state.tests.failed = state.tests.failed.slice(1); state.tests.coverage = Math.min(4, state.tests.coverage + 1); }
      if (cardId === 'C12') state.provenance = true;
      result = routeResult(`${preview.selected.label}接手救援`, '卡片把原本昂貴的補救換成一次可追蹤的專門處理。', `你啟用 ${cardId}，只修它語意上能處理的缺口。`, '工具沒有替客戶做決定，但讓證據終於說同一種語言。', '卡片救援已消耗資源；沒有卡的其他路線仍然可用。');
    }
    state.story.recoveryHistory.push({ sourceAction, route });
    state.story.openRecovery = null;
  } else if (actionId === 'B11') {
    const sourceAction = state.story.openOpportunity.sourceAction;
    if (route === 'steady') {
      result = routeResult('成功就先不要碰它', '你保留現況，沒有新債務，也沒有把穩定當成無聊。', '你把滑鼠移開那顆「順手最佳化」按鈕。', '全辦公室第一次因為沒加功能而準時下班。', '目前成果原封不動進入下一階段。');
    } else if (route === 'improve') {
      state.story.quality = clamp(state.story.quality + 1, 0, 4);
      resolveOneDebt(state, 1);
      if (sourceAction === 'B06') state.provenance = true;
      result = routeResult('把成功再磨亮一層', '品質提高，並實際減少一項債務或補上追溯。', '你花時間整理欄位字典與反例。', 'agent 沒有變聰明，只是終於拿到不會互相打架的 brief。', '改善寫入目前 revision；之後改版仍需重驗。');
    } else if (route === 'gamble') {
      state.story.quality = clamp(state.story.quality + 2, 0, 4);
      state.story.commitments.extraSource = 'pending';
      result = routeResult('「既然都成功了」症候群發作', '品質潛力 +2，但額外來源會在測試或追溯時要求付帳。', '你把客服臨時表也拉進管線。', '它有 47 欄，其中 31 欄叫 note。', '新增來源已公開列為延後承諾，不會暗中增加難度。');
    } else if (route === 'card-exchange') {
      if (preview.selected.cardId === 'C5') {
        state.token = Math.min(24, state.token + 2);
        state.stress = Math.max(0, state.stress - 1);
        result = routeResult('先把腦袋從三張 CSV 拔出來', '花一段時間休整，換回 2 Token 並降低 1 壓力；工作成果沒有偷長大。', '你把欄位映射表闔上，先確認自己還記得午餐長什麼樣子。', 'agent 沒有趁你離開成立第四個日期標準。', '休整只交換資源，不會新增 EXP 或清掉具名問題。');
      } else {
        state.story.quality = clamp(state.story.quality + 1, 0, 4);
        if (state.integration?.complete) state.integration.unresolvedDebt += 1;
        else state.preIntegrationDebt = (state.preIntegrationDebt ?? 0) + 1;
        result = routeResult('合併號誌先放行，協調債記在白板上', '品質 +1，但新增 1 點公開整合債；之後仍要付錢對齊。', '你讓目前成果先往前走，並把版本差異寫成待處理項。', 'agent 很開心，直到看到白板上自己的名字。', '這是借時間，不是免費時間；債務會留到整合或 review。');
      }
    } else {
      state.story.quality = clamp(state.story.quality + 1, 0, 4);
      state.story.commitments.extraSource = 'resolved';
      result = routeResult('邊界雷達先把坑插旗', '品質提高，新增來源邊界已先記錄，不留下隱性風險。', '你先列輸入、輸出與責任邊界才動手。', '雷達沒有預言未來，只把「誰以為誰會做」變成清單。', '安全擴充仍花資源，但後續不會突然翻桌。');
    }
    state.story.opportunityHistory.push({ sourceAction, route });
    state.story.openOpportunity = null;
  } else {
    if (route === 'shared-sample') {
      state.story.commitments.parallelSchemaDrift = 'resolved';
      resolveOneDebt(state, 1);
      result = routeResult('兩個 agent 終於使用同一個「現在」', '共用樣本固定欄位與日期口徑，平行分歧已解決。', '你把三筆相同輸入交給兩邊比對。', '差異從哲學問題縮成兩個欄位。', '只降低對應的介面債；退款規則與來源缺漏沒有被順便洗掉。');
    } else if (route === 'rebuild-source') {
      state.story.commitments.deletedRows = 'resolved';
      state.destructiveCleanup = false;
      state.provenance = false;
      if (state.integration) state.integration.total = 17820;
      result = routeResult('十二筆資料從來源部門回來了', '缺漏列已重建，但目前 revision 仍需重測與重做追溯。', '你拿著刪除清單逐筆向來源確認。', '小陳承認那個 ID 是他上任前就有的，然後寄來原始匯出。', '資料回復不等於證據回復；舊測試與來源鏈仍維持失效。');
    } else if (route === 'recontract') {
      state.story.commitments.verbalChange = 'resolved';
      state.change.handled = true;
      state.change.contractUpdated = true;
      result = routeResult('17:58 的口頭需求終於有版本號', '退款規則已寫回契約，後續可針對目前 revision 驗證。', '你把會議裡的「就照以前」翻成明確日期與幣別規則。', '客戶在兩個方案中選了一個，而不是按讚。', '只處理需求變更；其他整合或來源問題仍在。');
    } else if (route === 'targeted-proof') {
      if (['pending', 'surfaced'].includes(state.story.commitments.extraSource)) state.story.commitments.extraSource = 'resolved';
      if (['pending', 'surfaced'].includes(state.story.commitments.forcedPatch)) state.story.commitments.forcedPatch = 'resolved';
      state.tests.testedRevision = state.dataRevision;
      state.tests.coverage = Math.min(4, Math.max(2, state.tests.coverage));
      state.tests.failed = state.tests.failed.filter((item) => !/額外來源|硬做補丁/.test(item));
      result = routeResult('只補真正被影響的證據', '追加來源與補丁的公開缺口已處理，無關證據沒有被重跑。', '你用 dependency 清單挑出受影響測試。', 'runner 這次沒有順便測天氣。', '目前 revision 得到對應證據；其他未解問題仍保留。');
    } else {
      const target = Object.entries(state.story.commitments).find(([, status]) => status === 'pending' || status === 'surfaced');
      if (target) state.story.commitments[target[0]] = 'contained';
      result = routeResult('防爆毯把壞接點隔離了', '未受影響的切片可以繼續，但隔離不等於修復完成。', '你鎖住問題接口與版本。', '其他欄位的測試證據被保留下來。', '被隔離問題會留在交付限制，不會憑空消失。');
    }
    state.story.consequences.push({ id: `resolved:${route}`, text: result.summary });
  }
  return { result, preview };
}

function routeResult(title, summary, player, response, consequence) {
  return { type: 'event', title, summary, process: { player, response, followUp: '回到工作板時，新的狀態與限制都會公開顯示。', consequence }, outcome: 'story-route' };
}

export function observeCase02Story(state, actionId, options, result) {
  state.story = normalizeCase02Story(state.story);
  const story = state.story;
  if (actionId === 'B02' && options.strategy === 'two') story.commitments.parallelSchemaDrift = 'pending';
  if (actionId === 'B04' && options.response === 'patch') story.commitments.verbalChange = 'pending';
  if (actionId === 'B05' && options.mode === 'delete') story.commitments.deletedRows = 'pending';
  if (actionId === 'B05' && options.mode === 'repair') {
    for (const key of ['parallelSchemaDrift', 'forcedPatch']) story.commitments[key] = 'resolved';
  }

  if (actionId === 'B03' && story.commitments.parallelSchemaDrift === 'pending') {
    state.integration.unresolvedDebt += 1;
    story.commitments.parallelSchemaDrift = 'surfaced';
    addConsequence(story, 'parallel-schema-drift', '兩個平行 agent 的欄位命名在整合時分岔，新增 1 點整合債。');
    if (result.process) result.process.consequence += ' 延後後果：早先兩個平行 agent 的欄位命名分岔，現在新增 1 點整合債。';
  }

  if (actionId === 'B06') {
    const full = options.scope === 'full';
    const findings = [];
    if (story.commitments.deletedRows === 'pending') { story.commitments.deletedRows = 'surfaced'; findings.push('客戶抽查發現被刪除的來源列'); }
    if (story.commitments.verbalChange === 'pending') { story.commitments.verbalChange = 'surfaced'; findings.push('口頭變更未進資料契約'); }
    if (story.commitments.forcedPatch === 'pending') { story.commitments.forcedPatch = 'surfaced'; findings.push('硬做補丁缺少回歸證據'); }
    if (story.commitments.extraSource === 'pending') {
      if (full) story.commitments.extraSource = 'resolved';
      else { story.commitments.extraSource = 'surfaced'; findings.push('額外來源沒有被聚焦測試涵蓋'); }
    }
    for (const finding of findings) if (!state.tests.failed.includes(finding)) state.tests.failed.push(finding);
    if (findings.length && result.process) result.process.consequence += ` 延後後果：${findings.join('、')}。`;
  }

  if (actionId === 'B07') {
    if (['pending', 'surfaced'].includes(story.commitments.deletedRows)) {
      state.provenance = false;
      story.commitments.deletedRows = 'surfaced';
      addConsequence(story, 'deleted-row-audit', '來源追溯發現先前刪除的列無法還原。');
      if (result.process) result.process.consequence += ' 延後後果：來源追溯找不到先前被刪除的列，追溯仍未完成。';
    }
    if (story.commitments.extraSource === 'pending') story.commitments.extraSource = 'resolved';
  }

  const attempt = state.lastAttempt;
  if (attempt && ['failure', 'partial'].includes(attempt.outcome) && !story.openRecovery) {
    story.openRecovery = { sourceAction: actionId, failureEvent: attempt.failureEvent ?? null, outcome: attempt.outcome };
  }
  if (attempt?.outcome === 'success' && ['B03', 'B06', 'B07'].includes(actionId)
    && !story.openOpportunity && story.opportunityHistory.length === 0) {
    story.openOpportunity = { sourceAction: actionId };
  }
}

export function case02StoryBlockers(state) {
  const story = normalizeCase02Story(state.story);
  const blockers = [];
  if (story.scope === 'prototype') blockers.push('目前只完成隔離原型，不能冒充完整整合');
  if (story.scope === 'trimmed') blockers.push('交付範圍已縮限，需以有限交付標示');
  const labels = {
    parallelSchemaDrift: '平行 agent 欄位分歧尚未清完',
    deletedRows: '刪除列的來源缺漏尚未還原',
    verbalChange: '口頭變更尚未寫回資料契約',
    extraSource: '追加來源尚未完成測試或追溯',
    forcedPatch: '硬做補丁尚未補回歸證據',
  };
  for (const [key, status] of Object.entries(story.commitments)) {
    if (status === 'pending' || status === 'surfaced') blockers.push(labels[key]);
    if (status === 'contained') blockers.push(`${labels[key]}（已隔離，只能有限交付）`);
  }
  return blockers;
}
