import { castPortraitSvg } from '../presentation/cast-art.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export const CASE02_CAST = Object.freeze({
  chen: Object.freeze({ name: '小陳', role: '資料窗口', color: 'mint' }),
  mina: Object.freeze({ name: '米娜', role: '客服代表', color: 'amber' }),
  agent: Object.freeze({ name: '串串', role: '模擬 agent', color: 'blue' }),
});

const ACTION_CHAPTERS = Object.freeze({
  B01: ['第一幕', '三份 final 的會議'],
  B02: ['第二幕', '把 brief 交出去'],
  B03: ['第二幕', '真相在 join 口碰面'],
  B10: ['第二幕', '失敗不是重按一次'],
  B11: ['第二幕', '成功後的順手誘惑'],
  B04: ['第三幕', '17:58 的退款插單'],
  B05: ['第三幕', '債務不會自己下班'],
  B06: ['第四幕', '讓證據說話'],
  B07: ['第四幕', '每個數字都要有來處'],
  B12: ['第四幕', '早先的決定回來敲門'],
  B08: ['幕間', '先把腦袋拔出 CSV'],
  B09: ['終幕', '你要怎麼交付'],
});

function pendingCommitments(state) {
  return Object.entries(state?.story?.commitments ?? {})
    .filter(([, status]) => status === 'pending' || status === 'surfaced')
    .map(([key]) => key);
}

function activeConsequenceScene(state) {
  const [first] = pendingCommitments(state);
  if (first === 'parallelSchemaDrift') return {
    speakerId: 'agent', expression: 'worried',
    line: '兩份 brief 都跑完了，但 customer_id 一邊是字串、一邊是數字。現在得拿同一份樣本重新對。',
    callback: '前因回來了：平行分工的欄位口徑沒有先對齊。',
  };
  if (first === 'deletedRows') return {
    speakerId: 'chen', expression: 'alarmed',
    line: '那十二筆不是雜訊，是舊系統沒有對照到的客戶。刪掉很快，找回來就不快了。',
    callback: '前因回來了：先前刪除的列讓來源鏈斷掉。',
  };
  if (first === 'verbalChange') return {
    speakerId: 'mina', expression: 'worried',
    line: '我在會議裡說的退款規則，測試看不到。請把它補成有版本的契約。',
    callback: '前因回來了：17:58 的口頭變更沒有寫回契約。',
  };
  if (first === 'extraSource') return {
    speakerId: 'mina', expression: 'skeptical',
    line: '那張「順手帶進去」的客服臨時表，現在有 31 個 note 欄位沒被測到。',
    callback: '前因回來了：成功後追加的來源也需要自己的證據。',
  };
  if (first === 'forcedPatch') return {
    speakerId: 'agent', expression: 'skeptical',
    line: '補丁讓流程能跑，但它沒有回歸證據。能跑和能交付，還差一張測試報告。',
    callback: '前因回來了：硬做補丁把驗證延後了。',
  };
  return null;
}

function baseActionScene(state, actionId, options = {}) {
  const [chapter, title] = ACTION_CHAPTERS[actionId] ?? ['案件現場', '三張表，一份真相'];
  const common = { chapter, title, tone: 'neutral' };
  if (actionId === 'B01') return { ...common, speakerId: 'chen', expression: 'worried', line: '三份匯出都叫 final。拜託先定義「同一筆」和「最新」到底是什麼。' };
  if (actionId === 'B02') return options.strategy === 'two'
    ? { ...common, speakerId: 'agent', expression: 'bright', line: '我可以同時跑兩份 brief；欄位口徑不同，也會同時錯得更快。' }
    : { ...common, speakerId: 'agent', expression: 'focused', line: '先告訴我分工邊界。我只會忠實執行 brief，不會讀心。' };
  if (actionId === 'B03') {
    const drift = ['pending', 'surfaced'].includes(state?.story?.commitments?.parallelSchemaDrift);
    return drift
      ? { ...common, speakerId: 'agent', expression: 'worried', line: '兩邊都交卷了——但欄位型別沒有對上。早先的分工決定現在要付整合成本。', callback: '平行 agent 的 brief 分歧在合併點浮現。' }
      : { ...common, speakerId: 'agent', expression: 'focused', line: '三份資料準備進同一條管線。契約沒說清楚的地方，我不會偷偷猜。' };
  }
  if (actionId === 'B04') return { ...common, speakerId: 'mina', expression: 'alarmed', line: '客服剛補一條退款規則：截止日看申請還是入帳？我需要它變成可驗收的句子。' };
  if (actionId === 'B05') return { ...common, speakerId: 'chen', expression: state?.destructiveCleanup ? 'alarmed' : 'focused', line: state?.destructiveCleanup ? '被刪掉的列不會因為儀表板變綠就回來。' : 'mapping 可以修，來源列也可以保留；別拿刪資料當除錯。' };
  if (actionId === 'B06') return activeConsequenceScene(state) ?? { ...common, speakerId: 'agent', expression: 'focused', line: '測試不是幫忙修資料；它只負責把哪個承諾還沒兌現照出來。' };
  if (actionId === 'B07') return { ...common, speakerId: 'chen', expression: state?.provenance ? 'relieved' : 'focused', line: '請讓每個總額都能回到來源列、mapping 版本和那條退款規則。' };
  if (actionId === 'B10') return { ...common, speakerId: 'chen', expression: 'worried', line: '先別把整包再跑一次。我能給你三筆可重現樣本；要做原型、砍範圍，還是冒險補丁？' };
  if (actionId === 'B11') return { ...common, speakerId: 'mina', expression: 'bright', line: '主流程通了。那張客服臨時表……要不要也順手帶進去？', callback: '成功不是免費擴大範圍的理由。' };
  if (actionId === 'B12') return { ...common, ...(activeConsequenceScene(state) ?? { speakerId: 'agent', expression: 'focused', line: '現在只處理真正受影響的證據，不順便把別的債洗掉。' }) };
  if (actionId === 'B08') return { ...common, speakerId: 'agent', expression: 'relieved', line: '休息只換回資源，不會讓測試或契約在你離開時自己完成。' };
  return { ...common, speakerId: 'mina', expression: 'focused', line: '限制要寫在交付上。有限試用、風險交付和正式驗證不是同一件事。' };
}

function completedActionScene(state, actionId, options, scene, failed, partial) {
  const tone = failed ? 'bad' : partial ? 'warn' : 'good';
  const expression = failed ? 'worried' : partial ? 'skeptical' : 'relieved';
  if (actionId === 'B01') return state?.contract?.clarity
    ? { ...scene, speakerId: 'chen', expression, tone, line: '三條規則都寫進契約了；現在「同一筆」和「最新」終於可以被測試。' }
    : { ...scene, speakerId: 'chen', expression, tone, line: '選項已經記下來，但「最新」仍有兩種讀法；這份契約可以往前走，歧義也會一起往前走。' };
  if (actionId === 'B02') {
    const strategy = options?.strategy ?? state?.normalization?.strategy;
    const drifted = state?.normalization?.outcome === 'drifted';
    const line = strategy === 'two'
      ? drifted
        ? '兩份 brief 都交卷了，但 customer_id 一邊是字串、一邊是數字；平行速度已經換成整合債。'
        : '兩份 brief 都交卷了，這次欄位名稱真的有對上；平行速度的代價仍會在整合時驗收。'
      : strategy === 'solo'
        ? '你親自把三份來源整理完了；沒有分工介面債，但時間成本全落在你身上。'
        : '同一個模擬 agent 已按 brief 整理完三份來源；欄位口徑保住了，接著要驗證合併。';
    return { ...scene, speakerId: 'agent', expression, tone, line };
  }
  if (actionId === 'B03') return {
    ...scene, speakerId: 'agent', expression, tone,
    line: state?.integration?.outcome === 'collision'
      ? `主表已合併，但欄位碰撞留下 ${state?.integration?.unresolvedDebt ?? 0} 點整合債；join 成功不等於資料一致。`
      : `三份來源已進同一條管線；目前仍有 ${state?.integration?.unresolvedDebt ?? 0} 點公開整合債。`,
  };
  if (actionId === 'B04') {
    const response = options?.response ?? (state?.change?.contractUpdated ? 'contract' : 'patch');
    return response === 'contract' && state?.change?.contractUpdated
      ? { ...scene, speakerId: 'mina', expression, tone, line: '退款截止與原因已寫回契約；這次變更有版本，也有下一輪可驗收的規則。' }
      : { ...scene, speakerId: 'mina', expression, tone, line: '畫面已補上退款欄位，但契約仍停在昨天；這個補丁會在測試時回來要證據。' };
  }
  if (actionId === 'B05') {
    const mode = options?.mode ?? (state?.destructiveCleanup ? 'delete' : 'repair');
    return mode === 'delete'
      ? { ...scene, speakerId: 'chen', expression: 'alarmed', tone: 'warn', line: '不一致的列已被刪掉，儀表板變綠了；來源完整性也一起少了一塊。' }
      : { ...scene, speakerId: 'chen', expression, tone, line: 'mapping 已依來源修回來，原始列仍保留；接下來要重跑目前 revision 的證據。' };
  }
  if (actionId === 'B06') return {
    ...scene, speakerId: 'agent', expression, tone,
    line: state?.tests?.failed?.length
      ? `測試已跑完，留下 ${state.tests.failed.length} 個具名缺口；紅燈是證據，不是叫人把它藏起來。`
      : `測試已跑完，${state?.tests?.coverage ?? 0} 項覆蓋都對應目前 revision；綠燈這次有證據。`,
  };
  if (actionId === 'B07') return state?.provenance
    ? { ...scene, speakerId: 'chen', expression, tone, line: '來源鏈已接回每個總額、mapping 版本與退款規則；交付終於能回答「這數字哪來的」。' }
    : { ...scene, speakerId: 'chen', expression, tone, line: '來源索引仍在 final_final2 斷掉；半條追溯鏈不能冒充完整證據。' };
  if (actionId === 'B10') {
    const route = options?.route ?? state?.story?.recoveryHistory?.at(-1)?.route;
    const lines = {
      prototype: '隔離原型已保住可重現子集；它能繼續工作，但交付必須明寫有限範圍。',
      trim: '不能證明的範圍已砍掉；責任變小，限制也已公開寫進交付。',
      force: '補丁讓流程先恢復了；回歸證據仍欠著，安靜的終端機不是結案證明。',
      'card-rescue': '卡片只接手它能處理的缺口；救援已完成，其他限制沒有被順便洗掉。',
    };
    return { ...scene, speakerId: 'chen', expression, tone, line: lines[route] ?? '救援路線已執行，代價與剩餘限制都留在工作板上。' };
  }
  if (actionId === 'B11') {
    const route = options?.route ?? state?.story?.opportunityHistory?.at(-1)?.route;
    const lines = {
      steady: '你把滑鼠移開「順手最佳化」；現有成功被保留下來，也沒有多一筆隱性承諾。',
      improve: '欄位字典與反例已補上；品質提高了，但之後改版仍要重驗。',
      gamble: '客服臨時表已拉進管線；品質潛力變高，新增來源也已公開排進後續證據。',
      'card-exchange': '這次交換已寫進資源與債務；成果沒有在休息或借時間時偷偷長大。',
      'card-radar': '新增來源的輸入、輸出與責任邊界已先插旗；擴充不是免費，但不再是隱性風險。',
    };
    return { ...scene, speakerId: 'mina', expression, tone, line: lines[route] ?? '成功後的選擇已執行，新增成本與承諾都公開留在板上。' };
  }
  if (actionId === 'B08') return { ...scene, speakerId: 'agent', expression, tone, line: '資源已恢復，契約、測試與債務維持原狀；休息沒有替工作自動加分。' };
  return { ...scene, expression, tone };
}

export function case02SceneForAction(state, actionId, options = {}, result = null) {
  const scene = baseActionScene(state, actionId, options);
  if (!result) return scene;
  const failed = result?.attempt?.outcome === 'failure' || /failed|collision|unresolved/.test(result?.outcome ?? '');
  const partial = result?.attempt?.outcome === 'partial' || /limited|findings/.test(result?.outcome ?? '');
  if (state?.story?.openRecovery?.sourceAction === actionId) return {
    ...scene,
    speakerId: 'chen', expression: 'worried', tone: 'bad',
    line: '先停。這次失敗已經留下線索，別只重按同一顆按鈕；我們可以換一條有代價、但走得出去的路。',
    callback: result?.attempt?.sequel > 1 ? `這是同一問題的第 ${result.attempt.sequel} 次續篇，前次理解仍保留。` : '失敗開出了三種可行救援，而不是死路。',
  };
  if (actionId === 'B03' && state?.story?.openOpportunity) return {
    ...scene,
    speakerId: state?.story?.commitments?.parallelSchemaDrift === 'surfaced' ? 'agent' : 'mina',
    expression: state?.story?.commitments?.parallelSchemaDrift === 'surfaced' ? 'skeptical' : 'bright',
    tone: partial || state?.story?.commitments?.parallelSchemaDrift === 'surfaced' ? 'warn' : 'good',
    line: state?.story?.commitments?.parallelSchemaDrift === 'surfaced'
      ? '主表合起來了，但兩份 brief 的欄位分歧已經留下整合債；成功不會把這筆帳擦掉。'
      : '主表真的合起來了。那張客服臨時表……現在看起來只要「順手」一下？',
    callback: state?.story?.commitments?.parallelSchemaDrift === 'surfaced'
      ? '平行分工的前因已浮現；米娜仍在問要不要追加來源。下一步由你決定先還債、穩穩收手，或承擔新的後果。'
      : '下一步由你決定穩穩收手、補品質，或承擔追加來源的後果。',
  };
  if (actionId === 'B06') {
    const consequence = activeConsequenceScene(state);
    if (consequence) return { ...scene, ...consequence, tone: 'warn' };
  }
  if (actionId === 'B12') return {
    ...scene,
    speakerId: 'agent', expression: 'relieved', tone: 'good',
    line: '這次只補了被影響的缺口，其他承諾仍照原樣列在板上。這才叫可追蹤的修復。',
    callback: '延後後果已被具名處理，沒有假裝它從未發生。',
  };
  return completedActionScene(state, actionId, options, scene, failed, partial);
}

export function case02BoardScene(state) {
  if (!state?.contract) return baseActionScene(state, 'B01');
  if (!state?.normalization?.complete) return baseActionScene(state, 'B02');
  if (!state?.integration?.complete) return baseActionScene(state, 'B03');
  const consequence = activeConsequenceScene(state);
  if (consequence) return { ...baseActionScene(state, 'B12'), ...consequence, tone: 'warn' };
  if (state?.story?.openRecovery) return baseActionScene(state, 'B10');
  if (state?.story?.openOpportunity) return baseActionScene(state, 'B11');
  if (!state?.change?.handled) return baseActionScene(state, 'B04');
  if (state?.tests?.testedRevision !== state?.dataRevision) return baseActionScene(state, 'B06');
  if (!state?.provenance) return baseActionScene(state, 'B07');
  return baseActionScene(state, 'B09');
}

export function case02EndingScene(state) {
  const opportunity = state?.story?.opportunityHistory?.at(-1);
  if (opportunity?.route === 'gamble') return {
    chapter: '尾聲', title: '「順手」最後也有帳單', speakerId: 'mina', expression: 'relieved', tone: 'good',
    line: '那張客服臨時表最後有被寫進測試與限制。謝謝你沒有把我的「順手」當成免費需求。',
    callback: '結局記得：成功後追加來源，後面真的要求了對應證據。',
  };
  const recovery = state?.story?.recoveryHistory?.at(-1);
  if (recovery) return {
    chapter: '尾聲', title: '失敗被改寫成可交代的範圍', speakerId: 'chen', expression: 'relieved', tone: 'good',
    line: recovery.route === 'prototype'
      ? '那三筆隔離樣本救了我們。它不是完整交付，但至少每個人都知道現在能相信什麼。'
      : '你沒有把第一次失敗藏起來；交付範圍和補救代價都留在紀錄裡。',
    callback: '結局承認早先的救援選擇，不把有限成果包裝成完整成功。',
  };
  if (state?.story?.commitments?.parallelSchemaDrift === 'resolved') return {
    chapter: '尾聲', title: '兩份 brief 終於說同一種話', speakerId: 'agent', expression: 'relieved', tone: 'good',
    line: '共用樣本把分歧縮成可以修的欄位。下次平行分工，我會先要求同一份輸入範例。',
    callback: '結局記得平行 agent 的欄位分歧與修復。',
  };
  return {
    chapter: '尾聲', title: '三份來源，一份可解釋的交付', speakerId: 'chen', expression: 'relieved', tone: 'good',
    line: '現在每個數字都有來源，每個限制也有名字。這次的 final，終於不是靠檔名宣布的。',
  };
}

function portrait(id, expression, active) {
  const cast = CASE02_CAST[id];
  return `<div class="scene-cast ${active ? 'active' : ''}" aria-label="${esc(cast.name)}，${esc(cast.role)}">${castPortraitSvg('case-02', id, expression)}<span><strong>${esc(cast.name)}</strong><small>${esc(cast.role)}</small></span></div>`;
  /* Legacy circle portrait implementation retained as a comparison during the art checkpoint.
  const eyes = expression === 'relieved'
    ? '<path d="M20 29q4 4 8 0M38 29q4 4 8 0"/>'
    : expression === 'alarmed'
      ? '<circle cx="24" cy="29" r="2.4"/><circle cx="42" cy="29" r="2.4"/>'
      : '<path d="M21 29h6M39 29h6"/>';
  const mouth = expression === 'bright' || expression === 'relieved'
    ? '<path d="M25 39q8 8 16 0"/>'
    : expression === 'worried' || expression === 'skeptical' || expression === 'alarmed'
      ? '<path d="M26 44q7-7 14 0"/>'
      : '<path d="M27 41h12"/>';
  const role = id === 'chen'
    ? '<path class="role-mark" d="M7 13h13v16H7zM10 17h7M10 21h7"/>'
    : id === 'mina'
      ? '<path class="role-mark" d="M8 25a8 8 0 0116 0v7M8 27v7M24 27v7M22 36h-5"/>'
      : '<path class="role-mark" d="M8 15h16v15H8zM12 21h2M19 21h2M13 26h6M16 11v4"/>';
  return `<div class="scene-cast ${active ? 'active' : ''}" aria-label="${esc(cast.name)}，${esc(cast.role)}"><svg class="scene-portrait portrait-${cast.color}" viewBox="0 0 66 66" aria-hidden="true"><circle class="portrait-face" cx="33" cy="34" r="24"/>${eyes}${mouth}${role}</svg><span><strong>${esc(cast.name)}</strong><small>${esc(cast.role)}</small></span></div>`;
  */
}

export function renderCase02Scene(scene) {
  const speaker = CASE02_CAST[scene.speakerId] ?? CASE02_CAST.chen;
  return `<section class="narrative-stage scene-tone-${esc(scene.tone ?? 'neutral')}" data-case02-scene aria-label="${esc(scene.title)}"><div class="scene-cast-list">${Object.keys(CASE02_CAST).map((id) => portrait(id, id === scene.speakerId ? scene.expression : 'focused', id === scene.speakerId)).join('')}</div><div class="scene-dialogue"><span class="scene-chapter">${esc(scene.chapter)}</span><h2>${esc(scene.title)}</h2><p><strong>${esc(speaker.name)}：</strong>${esc(scene.line)}</p>${scene.callback ? `<p class="scene-callback"><span>前因回來了</span>${esc(scene.callback)}</p>` : ''}</div></section>`;
}
