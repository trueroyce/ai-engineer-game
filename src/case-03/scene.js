import { castPortraitSvg } from '../presentation/cast-art.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export const CASE03_CAST = Object.freeze({
  agai: Object.freeze({ name: '阿改', role: '客戶窗口', color: 'amber' }),
  mei: Object.freeze({ name: '小美', role: '產品設計', color: 'mint' }),
  zhou: Object.freeze({ name: '老周', role: '後端工程', color: 'blue' }),
});

const ACTION_CHAPTERS = Object.freeze({
  C01: ['週一早會', '三個人說的「一點點」不一樣'],
  C02: ['週一午前', '一個讚不能當三條契約'],
  C03: ['週二', '分工之前，先讓接口說同一種話'],
  C04: ['週三', '兩個 cancel 欄位在 merge 口相遇'],
  C05: ['週四 16:02', '客戶又想到「只有一個」功能'],
  C06: ['週五', '證據只認目前 revision'],
  C09: ['岔路', '失敗要改方法，不是改按鈕名字'],
  C10: ['誘惑', '成功最容易長出免費需求'],
  C11: ['責任會議', '客戶決策與工程債分開結算'],
  C08: ['修復桌', '只修真正壞掉的接點'],
  C07: ['交付日', '範圍、責任與證據一起簽名'],
});

function pendingCommitment(state, keys) {
  return keys.find((key) => ['pending', 'surfaced'].includes(state?.story?.commitments?.[key]));
}

function baseScene(state, actionId, options = {}) {
  const [chapter, title] = ACTION_CHAPTERS[actionId] ?? ['協作現場', '先把誰決定什麼說清楚'];
  const common = { chapter, title, tone: 'neutral' };
  if (actionId === 'C01') return { ...common, speakerId: 'agai', expression: 'bright', line: '就預約、借用、取消三件事，應該都只是小改吧？你們先做，我晚點再選。' };
  if (actionId === 'C02') return { ...common, speakerId: 'agai', expression: 'skeptical', line: options.policy === 'async' ? '我在群組按讚，算整份契約都核准了嗎？' : '把三個決定拆開問我，我才知道自己答應了什麼。' };
  if (actionId === 'C03') return options.strategy === 'agent'
    ? { ...common, speakerId: 'zhou', expression: 'worried', line: '平行 agent 可以快，但 UI 和 API 沒共用範例，最後只會一起準時地不相容。' }
    : { ...common, speakerId: 'mei', expression: 'focused', line: '我先把按鈕狀態和錯誤提示寫進 handoff，別讓工程師靠截圖猜行為。' };
  if (actionId === 'C04') return { ...common, speakerId: 'mei', expression: 'alarmed', line: '我的 cancel 是取消預約，API 的 cancel 是取消借用。名字一樣，責任完全不同。' };
  if (actionId === 'C05') return { ...common, speakerId: 'agai', expression: 'bright', line: '既然主流程都好了，再多一個管理員入口，真的只是一個按鈕吧？' };
  if (actionId === 'C06') return { ...common, speakerId: 'zhou', expression: 'focused', line: `現在是 revision ${state?.artifactRevision ?? '?'}；昨天的綠燈沒有自動搬家。` };
  if (actionId === 'C09') return { ...common, speakerId: 'mei', expression: 'worried', line: '先讓阿改真的按一次原型，或把範圍砍成能核准的切片；別只重跑同一場爭論。' };
  if (actionId === 'C10') return { ...common, speakerId: 'agai', expression: 'bright', line: '都成功了，不順便把管理員功能帶進去，好像有點可惜？' };
  if (actionId === 'C11') {
    const customerDebt = pendingCommitment(state, ['asyncApproval', 'prototypePromise', 'extraAdmin', 'unapprovedBuild']);
    return customerDebt
      ? { ...common, speakerId: 'agai', expression: 'worried', line: '這件事要我或真正的決策人選，不該讓工程師替需求背書。' }
      : { ...common, speakerId: 'zhou', expression: 'focused', line: '接口債可以做 adapter；客戶沒決定的事不能靠 mapping 解決。' };
  }
  if (actionId === 'C08') return { ...common, speakerId: 'zhou', expression: 'focused', line: '修復要綁目前 revision；別把另一筆客戶責任也順手標成完成。' };
  return { ...common, speakerId: 'mei', expression: 'focused', line: '交付不是一句「完成了」；要寫清誰核准、哪個 revision，以及沒做什麼。' };
}

function resultScene(state, actionId, options, result, scene) {
  const failed = result?.attempt?.outcome === 'failure' || /failed|collision|unresolved/.test(result?.outcome ?? '');
  const partial = result?.attempt?.outcome === 'partial' || /partial|limited|findings/.test(result?.outcome ?? '');
  const tone = failed ? 'bad' : partial ? 'warn' : 'good';
  const expression = failed ? 'worried' : partial ? 'skeptical' : 'relieved';
  if (state?.story?.openRecovery?.sourceAction === actionId) return {
    ...scene, speakerId: 'mei', expression: 'worried', tone: 'bad',
    line: '先停。這次失敗已經留下可用資訊；我們可以做原型、縮限範圍或公開先做的代價。',
    callback: '失敗開的是不同路線，不是同一按鈕的免費重骰。',
  };
  if (actionId === 'C01') return {
    ...scene, speakerId: 'agai', expression, tone,
    line: state?.requirements?.clear ? '三個「一點點」已拆成能回答的責任問題；範圍終於不是會議氣氛。' : '問題列出來了，但責任仍有歧義；這份不確定性會跟著進契約。',
  };
  if (actionId === 'C02') {
    const async = options.policy === 'async' || state?.story?.commitments?.asyncApproval === 'pending';
    return {
      ...scene, speakerId: 'agai', expression, tone,
      line: async ? '我已在群組核准整份契約；但誰對三個決定負責，還沒有名字。' : '時區、取消與重複借用都逐項核准了；這次沒有讓一個讚承擔三份責任。',
      ...(async ? { callback: '非同步核准的責任缺口會在合併時回來。' } : {}),
    };
  }
  if (actionId === 'C03') {
    const agent = options.strategy === 'agent' || state?.story?.commitments?.interfaceDrift === 'pending';
    return {
      ...scene, speakerId: 'zhou', expression, tone,
      line: agent ? '平行實作都交卷了；UI 和 API 是否真的說同一種 cancel，要到 merge 才算數。' : '分工切片已完成，責任與接口範例都留在 handoff 裡。',
      ...(agent ? { callback: '平行 agent 的接口承諾已留下，尚未被合併驗證。' } : {}),
    };
  }
  if (actionId === 'C04') {
    const surfaced = pendingCommitment(state, ['asyncApproval', 'interfaceDrift']);
    return {
      ...scene, speakerId: surfaced ? 'mei' : 'zhou', expression: surfaced ? 'alarmed' : expression, tone: surfaced ? 'warn' : tone,
      line: surfaced ? '主分支合起來了，但早先沒說清楚的責任和 cancel 介面一起浮上來了。' : '設計元件與 API 已合併；目前債務和受影響範圍都能指名。',
      ...(surfaced ? { callback: '早先的核准或分工選擇，現在各新增了可見成本。' } : {}),
    };
  }
  if (actionId === 'C05') {
    const extra = state?.story?.commitments?.extraAdmin === 'surfaced';
    return {
      ...scene, speakerId: 'agai', expression: extra ? 'worried' : expression, tone: extra ? 'warn' : tone,
      line: extra ? '管理員不是一個按鈕；權限、取消責任和驗收範圍都要重新決定。' : '這次變更已留下客戶決策與成本；沒有把「順便」藏進工程估時。',
      ...(extra ? { callback: '成功後加碼的管理員承諾，已在需求變更時回來收帳。' } : {}),
    };
  }
  if (actionId === 'C06') {
    const fastMerge = state?.story?.commitments?.fastMerge === 'surfaced';
    return {
      ...scene, speakerId: 'zhou', expression: fastMerge ? 'skeptical' : expression, tone: fastMerge ? 'warn' : tone,
      line: fastMerge ? '回歸抓到兩個版本的 cancel 欄位；快合併省下的時間，現在變成 adapter 工作。' : `revision ${state?.evidence?.revision ?? '?'} 的證據已更新；只證明實際跑過的範圍。`,
      ...(fastMerge ? { callback: '早先快速合併留下的版本差異，沒有被綠燈掩蓋。' } : {}),
    };
  }
  if (actionId === 'C09') {
    const route = options.route ?? state?.story?.recoveryHistory?.at(-1)?.route;
    const lines = {
      prototype: '原型已讓阿改真的按過一次；它釐清責任，但仍不是正式 implementation。',
      trim: '客戶已核准核心切片；取消與借用衝突正式排到下一版。',
      force: '功能先做了，客戶決策仍欠著；這筆未核准承諾會擋正式交付。',
      'card-rescue': '救援卡只處理語意相符的缺口；其他責任仍留在工作板。',
    };
    return { ...scene, speakerId: route === 'prototype' ? 'agai' : 'mei', expression, tone, line: lines[route] ?? '救援路線已執行，範圍與代價都已公開。' };
  }
  if (actionId === 'C10') {
    const route = options.route ?? state?.story?.opportunityHistory?.at(-1)?.route;
    const lines = {
      steady: '已驗切片鎖住了；沒加功能也是一個有價值的工程決定。',
      improve: '接口範例與追溯已補齊；改善只屬於目前 revision。',
      gamble: '管理員入口已進分支；新的權限責任也一起排進下一場客戶決策。',
      'card-negotiate': '阿改已在兩個方案中做出選擇；額外需求沒有憑空變成核准。',
      'card-exchange': '資源交換已記帳；核准與證據沒有趁休息時自動長大。',
    };
    return { ...scene, speakerId: route === 'gamble' ? 'agai' : 'mei', expression, tone, line: lines[route] ?? '成功後的選擇已執行，新增承諾與成本都已公開。' };
  }
  if (actionId === 'C11') return {
    ...scene, speakerId: pendingCommitment(state, ['asyncApproval', 'prototypePromise', 'extraAdmin', 'unapprovedBuild']) ? 'agai' : 'zhou', expression, tone,
    line: options.route === 'adapter' ? '版本轉接已處理接口分歧；客戶責任沒有被順便清掉。' : options.route === 'defer' ? '新增需求已明確排到下一版；本版只按核心切片驗收。' : '真正的決策人已裁決一項責任；工程債仍照自己的帳本處理。',
  };
  if (actionId === 'C08') return { ...scene, speakerId: 'zhou', expression, tone, line: failed ? '修復沒有完成；原本的具名缺口仍保留，資源也不退款。' : '修復已綁定目前 revision；無關的客戶責任沒有被一起洗掉。' };
  return { ...scene, expression, tone };
}

export function case03SceneForAction(state, actionId, options = {}, result = null) {
  const scene = baseScene(state, actionId, options);
  return result ? resultScene(state, actionId, options, result, scene) : scene;
}

export function case03BoardScene(state) {
  if (!state?.requirements) return baseScene(state, 'C01');
  if (!state?.contract?.approved) return baseScene(state, 'C02');
  if (!state?.implementation?.complete) return baseScene(state, 'C03');
  if (!state?.merge?.complete) return baseScene(state, 'C04');
  if (state?.story?.openRecovery) return baseScene(state, 'C09');
  if (state?.story?.openOpportunity) return baseScene(state, 'C10');
  if (pendingCommitment(state, ['asyncApproval', 'interfaceDrift', 'fastMerge', 'prototypePromise', 'extraAdmin', 'unapprovedBuild'])) return baseScene(state, 'C11');
  if (!state?.change?.handled) return baseScene(state, 'C05');
  if (state?.evidence?.revision !== state?.artifactRevision) return baseScene(state, 'C06');
  return baseScene(state, 'C07');
}

export function case03EndingScene(state) {
  const baseId = state?.ending?.baseId;
  const endingTruth = {
    'C03-VERIFIED': {
      title: '三個角色，終於只剩一份責任表', expression: 'relieved', tone: 'good',
      line: 'UI、API、客戶決策和目前 revision 的證據對上了；這次不用靠誰記得比較大聲。',
    },
    'C03-LIMITED': {
      title: '可用核心留下，也把限制寫清楚', expression: 'focused', tone: 'warn',
      line: '目前只交出可用核心與公開缺口；有限試用沒有被寫成完整交付。',
    },
    'C03-FAILED': {
      title: '硬交沒有把未完成改名成功', expression: 'worried', tone: 'bad',
      line: '這次帶著公開缺口硬交；角色沒有替未完成的責任背書。',
    },
    'C03-STOP': {
      title: '先把現場交清楚，再回來完成', expression: 'skeptical', tone: 'warn',
      line: '決策、review 與未完成缺口已交班；沒有宣稱目前 revision 已經驗證。',
    },
  }[baseId] ?? {
    title: '本局結果依公開狀態結算', expression: 'focused', tone: 'warn',
    line: '角色只回報本局真正完成與尚未完成的範圍。',
  };
  const opportunity = state?.story?.opportunityHistory?.at(-1);
  if (opportunity?.route === 'gamble') return {
    chapter: '尾聲', title: endingTruth.title, speakerId: 'agai', expression: endingTruth.expression, tone: endingTruth.tone,
    line: endingTruth.line,
    callback: '結局記得成功後追加的需求，不把它藏在原本範圍裡。',
  };
  const recovery = state?.story?.recoveryHistory?.at(-1);
  if (recovery) return {
    chapter: '尾聲', title: endingTruth.title, speakerId: 'mei', expression: endingTruth.expression, tone: endingTruth.tone,
    line: recovery.route === 'prototype' && baseId !== 'C03-FAILED' ? `那個可丟棄原型沒有上線；${endingTruth.line}` : endingTruth.line,
    callback: '結局承認救援路線，不把縮限成果包裝成完整成功。',
  };
  return {
    chapter: '尾聲', title: endingTruth.title, speakerId: 'zhou', expression: endingTruth.expression, tone: endingTruth.tone,
    line: endingTruth.line,
  };
}

function portrait(id, expression, active) {
  const cast = CASE03_CAST[id];
  return `<div class="scene-cast ${active ? 'active' : ''}" aria-label="${esc(cast.name)}，${esc(cast.role)}">${castPortraitSvg('case-03', id, expression)}<span><strong>${esc(cast.name)}</strong><small>${esc(cast.role)}</small></span></div>`;
  /* Legacy circle portrait implementation retained as a comparison during the art checkpoint.
  const eyes = expression === 'relieved' ? '<path d="M20 29q4 4 8 0M38 29q4 4 8 0"/>' : expression === 'alarmed' ? '<circle cx="24" cy="29" r="2.4"/><circle cx="42" cy="29" r="2.4"/>' : '<path d="M21 29h6M39 29h6"/>';
  const mouth = expression === 'bright' || expression === 'relieved' ? '<path d="M25 39q8 8 16 0"/>' : expression === 'worried' || expression === 'skeptical' || expression === 'alarmed' ? '<path d="M26 44q7-7 14 0"/>' : '<path d="M27 41h12"/>';
  const mark = id === 'agai' ? '<path class="role-mark" d="M8 18h17v13H8zM12 22h9M12 26h6"/>' : id === 'mei' ? '<path class="role-mark" d="M8 14h16v17H8zM11 18h10M11 23h7M20 27l6 6"/>' : '<path class="role-mark" d="M7 15h18v15H7zM11 20h4M18 20h3M11 25h10"/>';
  return `<div class="scene-cast ${active ? 'active' : ''}" aria-label="${esc(cast.name)}，${esc(cast.role)}"><svg class="scene-portrait portrait-${cast.color}" viewBox="0 0 66 66" aria-hidden="true"><circle class="portrait-face" cx="33" cy="34" r="24"/>${eyes}${mouth}${mark}</svg><span><strong>${esc(cast.name)}</strong><small>${esc(cast.role)}</small></span></div>`;
  */
}

export function renderCase03Scene(scene) {
  const speaker = CASE03_CAST[scene.speakerId] ?? CASE03_CAST.mei;
  return `<section class="narrative-stage case03-stage scene-tone-${esc(scene.tone ?? 'neutral')}" data-case03-scene aria-label="${esc(scene.title)}"><div class="scene-cast-list">${Object.keys(CASE03_CAST).map((id) => portrait(id, id === scene.speakerId ? scene.expression : 'focused', id === scene.speakerId)).join('')}</div><div class="scene-dialogue"><span class="scene-chapter">${esc(scene.chapter)}</span><h2>${esc(scene.title)}</h2><p><strong>${esc(speaker.name)}：</strong>${esc(scene.line)}</p>${scene.callback ? `<p class="scene-callback"><span>前面那句話回來了</span>${esc(scene.callback)}</p>` : ''}</div></section>`;
}
