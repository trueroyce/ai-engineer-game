import { castPortraitSvg } from '../presentation/cast-art.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export const CASE04_CAST = Object.freeze({
  wei: Object.freeze({ name: '阿維', role: '值班夥伴', color: 'mint' }),
  hui: Object.freeze({ name: '惠姐', role: '產品負責', color: 'amber' }),
  lamp: Object.freeze({ name: '小燈', role: '診斷 agent', color: 'blue' }),
});

const ACTION_CHAPTERS = Object.freeze({
  D01: ['22:41', '先把「昨天還好好的」釘在時間線上'],
  D02: ['23:05', '每條救火路線都會犧牲東西'],
  D03: ['23:36', '三份診斷不能用多數決當根因'],
  D10: ['回滾閘門', '程式能退，資料不一定答應'],
  D04: ['午夜承諾', '成功要收手，失敗要換路'],
  D05: ['00:48', '根因要有反證，也要有責任人'],
  D07: ['01:23', '只相信目前 revision 的綠燈'],
  D06: ['02:07', '早期選擇終於回來收帳'],
  D11: ['範圍核准', '負責人核准的是版本，不是氣氛'],
  D08: ['交班前', '下一班不能靠 Slack 考古'],
  D09: ['天亮前', '上線、縮限或止損都要說真話'],
});

const STRATEGY_LINES = Object.freeze({
  patch: '補丁先保服務，但夜間批次和同一段祖傳判斷還綁在一起。',
  investigate: '先找根因；今晚會慢一點，明天不用靠猜測維運。',
  refactor: '只重構事故切片，碰到舊入口就停；別把凌晨當架構重生大會。',
  rollback: '回滾前先查 schema；程式碼能倒帶，已寫入的資料不會。',
});

const CONSEQUENCE_LABELS = Object.freeze({
  'patch-coupling': '補丁耦合',
  'wrong-requirement': '需求誤判',
  'scheduler-gap': '舊排程入口',
  'schema-drift': 'schema 漂移',
});

function baseScene(state, actionId, options = {}) {
  const [chapter, title] = ACTION_CHAPTERS[actionId] ?? ['事故現場', '先保留證據，再動手'];
  const common = { chapter, title, tone: 'neutral' };
  if (actionId === 'D01') return { ...common, speakerId: 'wei', expression: 'worried', line: '昨晚 02:00 的批次跟今天第一筆失敗有關。先把輸入、時間和 revision 對起來。' };
  if (actionId === 'D02') return { ...common, speakerId: 'hui', expression: 'focused', line: '我要知道今晚保住什麼、關掉什麼，以及明早要向誰解釋。' };
  if (actionId === 'D03') return { ...common, speakerId: 'lamp', expression: options.agentMode === 'parallel' ? 'skeptical' : 'focused', line: options.agentMode === 'parallel' ? '程式、測試、部署診斷會同時回來；矛盾的部分仍要由你裁決。' : '我會依依賴順序查程式、測試與部署；比較慢，但每一步都有前因。' };
  if (actionId === 'D10') return { ...common, speakerId: 'wei', expression: 'alarmed', line: '新版已經寫入資料。舊程式能啟動，不代表它看得懂新 schema。' };
  if (actionId === 'D04') return { ...common, speakerId: 'hui', expression: state?.story?.outcome === 'success' ? 'bright' : 'worried', line: state?.story?.outcome === 'success' ? '服務站起來了。現在最難的決定，是不要順手再改一點。' : '別只重按一次。要換方法、關功能，還是硬做並公開風險？' };
  if (actionId === 'D05') return { ...common, speakerId: 'lamp', expression: 'focused', line: '程式、需求、部署都有一套說法。請選能被下一輪回歸推翻的假設。' };
  if (actionId === 'D07') return { ...common, speakerId: 'lamp', expression: 'focused', line: `目前 revision 是 ${state?.revision ?? '?'}。昨天的綠燈不能替今天的程式作證。` };
  if (actionId === 'D06') return { ...common, speakerId: 'wei', expression: 'alarmed', line: state?.story?.pendingConsequence?.text ?? '早期策略留下的副作用，現在終於有了可重現名字。' };
  if (actionId === 'D11') return { ...common, speakerId: 'hui', expression: 'focused', line: '把目前 revision、關閉功能、資料限制和證據攤開；我只核准看得見的範圍。' };
  if (actionId === 'D08') return { ...common, speakerId: 'wei', expression: 'focused', line: '請寫清版本、開關、資料相容與回復步驟。下一班不是通靈師。' };
  return { ...common, speakerId: 'hui', expression: 'focused', line: '正式上線、有限維持、帶風險硬交與止損，是四種不同責任。' };
}

function resultScene(state, actionId, options, result, scene) {
  const failed = result?.attempt?.outcome === 'failure' || /failure|failed|unsafe|changes-requested/.test(result?.outcome ?? '');
  const partial = result?.attempt?.outcome === 'partial' || /partial|limited|contained|isolated/.test(result?.outcome ?? '');
  const tone = failed ? 'bad' : partial ? 'warn' : 'good';
  const expression = failed ? 'worried' : partial ? 'skeptical' : 'relieved';
  if (actionId === 'D01') return { ...scene, speakerId: 'wei', expression, tone, line: state?.diagnosis?.scoped ? '事故已在測試環境重現；輸入、時間與 revision 都留在紀錄裡。' : '事故仍只能部分重現；限制已公開，接下來只能選保守策略。' };
  if (actionId === 'D02') return {
    ...scene, speakerId: 'hui', expression, tone,
    line: STRATEGY_LINES[state?.strategy] ?? '策略與代價已公開，還沒有人把它誤寫成成功。',
    callback: `這條路之後會帶回「${state?.strategy === 'rollback' ? 'schema 相容' : state?.strategy === 'patch' ? '補丁耦合' : state?.strategy === 'refactor' ? '舊排程入口' : '需求與行為不一致'}」。`,
  };
  if (actionId === 'D03') return {
    ...scene, speakerId: 'lamp', expression, tone,
    line: state?.service?.stable ? '第一輪穩定化完成；服務站起來了，策略後果仍在排隊。' : '服務仍會在特定輸入倒下；失敗已開出關功能或硬做兩條有代價的路。',
  };
  if (actionId === 'D10') return {
    ...scene, speakerId: 'wei', expression, tone,
    line: state?.dataCompatibility === 'compatible' ? '舊／新資料樣本已證明相容；回滾現在才有資格進執行。' : state?.dataCompatibility === 'isolated' ? '新寫入已停止並隔離；服務可有限維持，但不能冒充完整回滾。' : '相容檢查沒有過；舊程式能亮綠燈，資料仍不安全。',
    callback: '相容決策綁定目前 revision；後續改版會使它失效。',
  };
  if (actionId === 'D04') {
    const route = options.route ?? state?.story?.commitment;
    const lines = {
      freeze: '穩定結果已凍結；今晚少做一點，保住的是目前可驗證狀態。',
      improve: '改善已加入，revision 也跟著改了；舊證據現在正式失效。',
      pace: '值班群組真的休整了一段；資源回來了，策略後果沒有消失。',
      alternate: '部分功能已關閉，服務先保住；這條路只能有限維持。',
      hard: '硬做讓服務先往前；未驗證路徑已公開記成風險。',
    };
    return { ...scene, speakerId: route === 'hard' ? 'wei' : 'hui', expression, tone, line: lines[route] ?? '後續路線已執行，代價已公開。', callback: '再完成兩次後續工作，這條策略的具名後果會回來。' };
  }
  if (actionId === 'D05') return { ...scene, speakerId: 'lamp', expression, tone, line: state?.rootCause?.confirmed ? `根因已裁決為「${options.cause === 'requirement' ? '需求／驗收不一致' : options.cause === 'deploy' ? '部署設定漂移' : '程式缺陷'}」；下一輪回歸可以推翻或支持它。` : '三份診斷仍互相矛盾；假設保留，不能用多數決當真相。' };
  if (actionId === 'D07') {
    const rawPending = state?.story?.pendingConsequence;
    const consequenceLabel = CONSEQUENCE_LABELS[rawPending?.id];
    const pending = rawPending ? { ...rawPending, text: `${consequenceLabel ? `「${consequenceLabel}」：` : ''}${rawPending.text}` } : rawPending;
    return {
      ...scene, speakerId: pending?.revealed ? 'wei' : 'lamp', expression: pending?.revealed ? 'alarmed' : expression, tone: pending?.revealed ? 'warn' : tone,
      line: pending?.revealed ? `${pending.text}。回歸把早期策略的帳單照出來了。` : state?.evidence?.revision === state?.revision ? `revision ${state.revision} 已有 ${state.evidence.coverage}/4 覆蓋；證據只支持實際跑過的範圍。` : '測試結果沒有綁到目前 revision，不能拿來交班。',
      ...(pending?.revealed ? { callback: '早期承諾已經過兩次後續工作，現在開出定向處理。' } : {}),
    };
  }
  if (actionId === 'D06') return {
    ...scene, speakerId: 'wei', expression, tone,
    line: state?.story?.pendingConsequence?.resolved ? '這次只處理對應的策略後果；其他具名問題仍留在事故板上。' : '處理沒有完成；原本的後果與其他問題都沒有被清空。',
    callback: state?.revision === state?.evidence?.revision ? '隔離保住既有證據；若修復改了 revision，仍必須重跑。' : 'revision 已改變，舊證據不能跟著冒充有效。',
  };
  if (actionId === 'D11') return {
    ...scene, speakerId: 'hui', expression: state?.approval?.status === 'approved' ? 'relieved' : 'skeptical', tone: state?.approval?.status === 'approved' ? 'good' : 'warn',
    line: state?.approval?.status === 'approved' ? `我核准 revision ${state.approval.revision} 的${state.approval.scope === 'limited' ? '有限維持' : '完整'}範圍；程式或資料一改，這份核准就失效。` : `這份提案先退回：${state?.approval?.reasons?.[0] ?? '公開證據或範圍仍不完整'}。`,
    callback: state?.approval?.suggestedScope === 'limited' ? '目前條件可以縮限重提，但不能冒充完整核准。' : '負責人依公開局勢決定，診斷 agent 沒有代簽。',
  };
  if (actionId === 'D08') return { ...scene, speakerId: 'wei', expression, tone, line: state?.handoff?.complete ? '目前版、關閉開關、資料相容與回復步驟都進 runbook 了。' : '交接仍缺回復開關或資料相容說明；下一班還不能照表接手。' };
  return { ...scene, expression, tone };
}

export function case04SceneForAction(state, actionId, options = {}, result = null) {
  const scene = baseScene(state, actionId, options);
  return result ? resultScene(state, actionId, options, result, scene) : scene;
}

function compatibilityCurrent(state) {
  return state?.strategy !== 'rollback' || Boolean(state?.compatibilityDecision?.revision === state?.revision && state?.compatibilityDecision?.status === 'decided');
}

export function case04BoardScene(state) {
  if (!state?.diagnosis) return baseScene(state, 'D01');
  if (!state?.strategy) return baseScene(state, 'D02');
  if (!compatibilityCurrent(state)) return baseScene(state, 'D10');
  if (!state?.service?.attempted) return baseScene(state, 'D03');
  if (!state?.story?.commitment) return baseScene(state, 'D04');
  if (state?.story?.pendingConsequence?.revealed && !state.story.pendingConsequence.resolved) return baseScene(state, 'D06');
  if (!state?.rootCause?.confirmed) return baseScene(state, 'D05');
  if (state?.evidence?.revision !== state?.revision) return baseScene(state, 'D07');
  if (state?.approval?.status !== 'approved' || state.approval.revision !== state.revision) return baseScene(state, 'D11');
  if (!state?.handoff?.complete) return baseScene(state, 'D08');
  return baseScene(state, 'D09');
}

export function case04EndingScene(state) {
  const baseId = state?.ending?.baseId;
  const intent = ({
    'C04-VERIFIED': 'verified',
    'C04-LIMITED': 'limited',
    'C04-FAILED': 'risk',
    'C04-STOP': 'stop',
  })[baseId] ?? state?.log?.at(-1)?.options?.intent ?? 'stop';
  const compatibilityCurrent = state?.compatibilityDecision?.revision === state?.revision
    && state?.compatibilityDecision?.status === 'decided';
  const compatibility = !compatibilityCurrent
    ? `revision ${state?.revision ?? '?'} 的資料相容仍是「${state?.dataCompatibility ?? '未檢查'}」，沒有被寫成已通過`
    : state?.dataCompatibility === 'isolated'
      ? `revision ${state.revision} 的新寫入已隔離；舊程式不是因為相容，而是因為風險被切開`
      : state?.dataCompatibility === 'adapter'
        ? `revision ${state.revision} 以轉接層維持讀寫；這不是原生 schema 相容`
        : state?.dataCompatibility === 'compatible'
          ? `revision ${state.revision} 的舊／新資料樣本已證明相容`
          : `revision ${state?.revision ?? '?'} 的相容檢查結果仍是「${state?.dataCompatibility ?? '未檢查'}」`;
  const approvalCurrent = state?.approval?.status === 'approved' && state?.approval?.revision === state?.revision;
  const approval = approvalCurrent
    ? `負責人核准了 revision ${state.approval.revision} 的${state.approval.scope === 'limited' ? '有限維持' : '完整'}範圍`
    : state?.approval?.status === 'stale'
      ? `先前核准已失效；revision ${state?.revision ?? '?'} 尚未重新核准`
      : state?.approval?.status === 'changes-requested'
        ? `負責人已退回提案：${state.approval.reasons?.[0] ?? '仍需補件'}`
        : `revision ${state?.revision ?? '?'} 尚未取得負責人核准`;
  const outcome = intent === 'verified'
    ? '因此這次正式交付有相容證據與當前核准。'
    : intent === 'limited'
      ? '最後只維持已核准的有限範圍，沒有冒充完整上線。'
      : intent === 'risk'
        ? '你選擇帶風險硬交；結局仍記為失敗。'
        : '你保留現場並止損；沒有宣稱事故已修好。';
  return {
    chapter: '交班訊息',
    title: intent === 'verified' ? '證據與核准都對得上' : intent === 'limited' ? '保住服務，也把限制留給白天' : intent === 'risk' ? '硬交沒有把缺口變成功' : '現場留下，沒有冒充修好',
    speakerId: state?.strategy === 'rollback' ? 'wei' : 'hui',
    expression: ['verified', 'limited'].includes(intent) ? 'relieved' : intent === 'risk' ? 'worried' : 'skeptical',
    tone: intent === 'verified' ? 'good' : intent === 'risk' ? 'bad' : 'warn',
    line: state?.strategy === 'rollback'
      ? `${compatibility}；${approval}。${outcome}`
      : `${STRATEGY_LINES[state?.strategy] ?? '今晚的策略與代價都留在紀錄裡'} ${approval}。${outcome}`,
    callback: state?.story?.pendingConsequence?.text ? `結局記得：${state.story.pendingConsequence.text}。` : undefined,
  };
}

function portrait(id, expression, active) {
  const cast = CASE04_CAST[id];
  return `<div class="scene-cast ${active ? 'active' : ''}" aria-label="${esc(cast.name)}，${esc(cast.role)}">${castPortraitSvg('case-04', id, expression)}<span><strong>${esc(cast.name)}</strong><small>${esc(cast.role)}</small></span></div>`;
  /* Legacy circle portrait implementation retained as a comparison during the art checkpoint.
  const eyes = expression === 'relieved' ? '<path d="M20 29q4 4 8 0M38 29q4 4 8 0"/>' : expression === 'alarmed' ? '<circle cx="24" cy="29" r="2.4"/><circle cx="42" cy="29" r="2.4"/>' : '<path d="M21 29h6M39 29h6"/>';
  const mouth = expression === 'bright' || expression === 'relieved' ? '<path d="M25 39q8 8 16 0"/>' : expression === 'worried' || expression === 'skeptical' || expression === 'alarmed' ? '<path d="M26 44q7-7 14 0"/>' : '<path d="M27 41h12"/>';
  const mark = id === 'wei' ? '<path class="role-mark" d="M8 15h16v16H8zM11 20h10M11 25h7"/>' : id === 'hui' ? '<path class="role-mark" d="M8 13h16v19H8zM11 18h10M11 23h10M11 28h6"/>' : '<path class="role-mark" d="M8 15h16v15H8zM12 21h2M19 21h2M13 26h6M16 11v4"/>';
  return `<div class="scene-cast ${active ? 'active' : ''}" aria-label="${esc(cast.name)}，${esc(cast.role)}"><svg class="scene-portrait portrait-${cast.color}" viewBox="0 0 66 66" aria-hidden="true"><circle class="portrait-face" cx="33" cy="34" r="24"/>${eyes}${mouth}${mark}</svg><span><strong>${esc(cast.name)}</strong><small>${esc(cast.role)}</small></span></div>`;
  */
}

export function renderCase04Scene(scene) {
  const speaker = CASE04_CAST[scene.speakerId] ?? CASE04_CAST.wei;
  return `<section class="narrative-stage case04-stage scene-tone-${esc(scene.tone ?? 'neutral')}" data-case04-scene aria-label="${esc(scene.title)}"><div class="scene-cast-list">${Object.keys(CASE04_CAST).map((id) => portrait(id, id === scene.speakerId ? scene.expression : 'focused', id === scene.speakerId)).join('')}</div><div class="scene-dialogue"><span class="scene-chapter">${esc(scene.chapter)}</span><h2>${esc(scene.title)}</h2><p><strong>${esc(speaker.name)}：</strong>${esc(scene.line)}</p>${scene.callback ? `<p class="scene-callback"><span>凌晨的帳單回來了</span>${esc(scene.callback)}</p>` : ''}</div></section>`;
}
