import { ACTIONS, CARDS, SIMULATION_NOTICE, TEMPLATES } from '../narrative/rules.js';
import { ACTION_SCENES } from '../narrative/narrative-copy.js';
import {
  actionIllustration,
  cardIllustration,
  caseScene,
  characterPortrait,
  endingIllustration,
  eventTone,
  hudIcon,
  processIcon,
} from './art.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const PURPOSES = Object.freeze({
  A01: '先用 /plan 把問題拆清楚，不讓寫程式搶跑。',
  A02: '用 Read 對照原文，再用 /diff 檢查翻譯是否偷加承諾。',
  A03: '用 Read 與 Edit 保存範圍取捨，別讓延後項目半夜翻牆回來。',
  A04: '先規劃驗收條件，寫入文件後用 /diff 找出自作主張。',
  A05: '讀需求、做最小修改、用 Bash 檢查，再看 /diff 確認沒有順手蓋城市。',
  A06: '啟動本機畫面，以實際操作提問，把回答寫回需求。',
  A07: '先鎖定範圍，再修改、測試並審查差異。',
  A08: '自動檢查與瀏覽器操作都要跑；看見綠字不等於使用者真的能用。',
  A09: '/code-review 找問題，Bash 重現問題；評論本身不是證據。',
  A10: '/context 用來檢視目前脈絡；/compact 才是壓縮脈絡，兩者不是同一招。',
  A11: '/rewind 回到舊狀態，Edit 與 Bash 則做最小修復與重驗。',
  A12: '讀取需求、產物、測試與已知問題，選擇事實允許的交付層級。',
});

export function renderIntro(setup) {
  const templates = Object.values(TEMPLATES).map((template) => `
    <button class="card template-card ${setup.templateId === template.id ? 'selected' : ''}" data-template="${template.id}" aria-pressed="${setup.templateId === template.id}">
      <span class="portrait-wrap">${characterPortrait(template.id)}</span>
      <span class="template-copy"><span class="difficulty">${esc(template.difficulty)}</span>
      <strong>${esc(template.name)}</strong><span>${esc(template.description)}</span></span>
    </button>`).join('');
  return `<section class="hero screen intro-screen"><div class="stage-header"><div class="stage-copy"><div class="eyebrow">AI 工程接案遊戲 · 案件 01</div><h1>把一個待辦清單，做得像個人話</h1><p class="lede">十二次正常工作時間、最多兩次加班，以及一位說「簡單就好」但腦中有完整宇宙的客戶。</p><div class="actions lead-actions"><button class="button" data-next="cards">選好角色，去抽工具卡</button></div></div><div class="intro-tableau">${caseScene({ progress: { checks: [] } })}<span class="art-caption">案件已放上桌。咖啡沒有。</span></div></div><p class="notice">${esc(SIMULATION_NOTICE)}</p><div class="section-heading"><div><span class="section-number">01</span><h2>挑一位今天要上班的人</h2></div><p>能力藏在角色個性裡，不用配點，也不把選角做成報稅。</p></div><div class="grid template-grid">${templates}</div><div class="selection-footer intro-footer"><p class="selection-count">角色選好了？工具卡還在後面排隊。</p><button class="button" data-next="cards">帶這位工程師去抽卡</button></div></section>`;
}

export function renderCards(setup) {
  const cards = setup.draw.map((id) => `<button class="card tool-card ${setup.selected.includes(id) ? 'selected' : ''}" data-card="${id}" aria-pressed="${setup.selected.includes(id)}">${cardIllustration(id)}<span class="card-copy"><span class="card-kicker">工具卡 · Lv.1</span><strong>${esc(CARDS[id].name)}</strong><span>${esc(CARDS[id].description)}</span></span></button>`).join('');
  return `<section class="hero screen card-screen"><div class="stage-header compact"><div class="stage-copy"><div class="eyebrow">開場工具 · 三選一</div><h1>先帶一張，別把工具箱扛成房貸</h1><p class="lede">案件約完成三分之一與三分之二時，會再各抽三張選一張；抽到已持有卡可以融合。</p></div><div class="pick-ticket"><span>本輪額度</span><strong>選 1 張</strong><small>三張候選，不買斷人生</small></div></div><div class="grid tool-grid">${cards}</div><div class="selection-footer"><p class="selection-count">已選 <strong>${setup.selected.length}</strong> / 1</p><div class="actions"><button class="button secondary" data-back="intro">返回選角</button><button class="button" data-start ${setup.selected.length === 1 ? '' : 'disabled'}>帶著它開始接案</button></div></div></section>`;
}

export function renderHud(view) {
  const stats = [
    ['token', 'Token', view.resources.token, 30, `${view.resources.token}`],
    ['stress', '壓力', view.resources.stress, 10, `${view.resources.stress} / 10`],
    ['time', '工作時間', view.resources.time, 12, `${view.resources.time}`],
    ['overtime', '加班', view.resources.overtime, 2, `${view.resources.overtime} / 2`],
  ];
  return `<div class="hud" aria-label="目前資源">${stats.map(([kind, label, value, max, display]) => `<div class="stat stat-${kind}">${hudIcon(kind)}<span>${label}</span><strong>${display}</strong><i aria-hidden="true"><b style="width:${Math.max(0, Math.min(100, Number(value) / max * 100))}%"></b></i></div>`).join('')}</div>`;
}

function actionButton(action) {
  const cost = action.cost === 0 ? '不消耗工作時間' : `${action.cost} Token 起`;
  const hint = action.hint ? `<p class="work-hint">${esc(action.hint)}</p>` : '';
  const history = action.hasPrevious ? `<button class="button secondary" data-view-result="${action.id}">查看上次結果</button>` : '';
  const work = action.canStart ? `<button class="button" data-action="${action.id}">${action.id === 'A01' && action.hasPrevious ? '重新理解需求' : '選這項工作'}</button>` : '';
  return `<div class="card work"><div class="work-mark">${actionIllustration(action.id)}</div><div class="work-copy"><strong>${esc(action.title)}</strong><p>${esc(action.risk)}</p><p class="work-cost">${cost}</p>${hint}</div><div class="actions work-actions">${history}${work}</div></div>`;
}

function historyButton(action) {
  return `<button class="button secondary" data-view-result="${action.id}">${esc(action.title)}：查看上次結果</button>`;
}

function renderProgress(progress) {
  const questions = progress.pendingQuestions.length
    ? `<ul>${progress.pendingQuestions.map((question) => `<li>${esc(question)}</li>`).join('')}</ul>`
    : '<p class="muted">目前沒有等待客戶回答的問題。</p>';
  const checks = progress.checks.map((check) => `<li><span>${esc(check.label)}</span><strong>${esc(check.status)}</strong></li>`).join('');
  return `<details class="progress" open><summary>案件進度</summary><h3>客戶待確認</h3>${questions}<h3>目前成果</h3><p>${esc(progress.documentText)}<br>${esc(progress.artifactText)}</p><h3>驗證狀態</h3><ul class="check-list">${checks}</ul><h3>交付缺口</h3><dl><dt>可展示</dt><dd>${esc(progress.delivery.showcase)}</dd><dt>有限試用</dt><dd>${esc(progress.delivery.limited)}</dd><dt>正式交付</dt><dd>${esc(progress.delivery.formal)}</dd></dl></details>`;
}

export function renderPlay(view) {
  const primary = view.primaryActions.length
    ? view.primaryActions.map(actionButton).join('')
    : '<p class="muted">目前沒有新的主要工作；可以交付、停止，或查看過去結果。</p>';
  const secondaryItems = [
    ...view.secondaryActions.map(actionButton),
    ...(view.canRest ? ['<button class="button secondary" data-rest>真的休息一下</button>'] : []),
  ].join('');
  const secondary = secondaryItems ? `<details class="secondary-actions"><summary>次要行動</summary><div class="work-list">${secondaryItems}</div></details>` : '';
  const history = view.historyActions.length ? `<details class="history-actions"><summary>過去工作（唯讀）</summary><div class="actions">${view.historyActions.map(historyButton).join('')}</div></details>` : '';
  return `${renderHud(view)}<div class="layout"><section class="panel caseboard"><div class="case-banner"><div class="case-copy"><div class="eyebrow">案件進行中 · 待辦清單案</div><h1>現在最值得做什麼？</h1><p class="status-sentence">${esc(view.statusText)}</p></div>${caseScene(view)}</div><div class="case-tab">下一步</div><div class="work-list">${primary}</div>${secondary}${history}<div class="delivery-drawer"><div><strong>想收工了嗎？</strong><span>交付畫面會先把目前能承諾的層級說清楚。</span></div><button class="button warning" data-action="A12">檢查交付選項</button></div></section><aside class="panel dossier">${renderProgress(view.progress)}<section class="dossier-section"><h2>已確認問題與驗證異常</h2><p class="muted">${esc(view.progress.issueSummary)}</p>${view.knownIssues.length ? `<ul>${view.knownIssues.map((issue) => `<li>${esc(issue)}</li>`).join('')}</ul>` : ''}</section><section class="dossier-section"><h2>工具卡</h2><div class="tools">${view.tools.map((tool) => `<span class="tool"><b>${esc(tool.name)}</b> Lv.${tool.level}</span>`).join('')}</div></section><section class="xp-stamp"><span>案件經驗</span><strong>${view.xp} XP</strong></section></aside></div>`;
}

function tutorial(actionId) {
  const scene = ACTION_SCENES[actionId] ?? { transcript: ACTIONS[actionId].command };
  return `<details class="tutorial"><summary>這招怎麼用？</summary><p>${esc(PURPOSES[actionId])}</p><div class="terminal" aria-label="Claude Code 教學範例">${esc(scene.transcript)}</div></details>`;
}

function optionControls(view, actionId, options) {
  const owns = (id) => view.tools.some((tool) => tool.id === id);
  const target = actionId === 'A07' ? `<label class="option-control decision-control"><span class="control-kicker">這會改變工作對象與這次工作結果</span><strong>這次處理哪個範圍？</strong><select data-option="target"><option value="persistence">保存與重新開啟</option><option value="core">新增、完成與刪除</option><option value="delete">單筆刪除</option></select></label>` : '';
  const repair = actionId === 'A11' ? `<label class="option-control decision-control"><strong>這次怎麼處理？</strong><select data-option="mode"><option value="fix" ${view.revisionOptions.canFixIssue ? '' : 'disabled'}>小範圍修復</option><option value="rollback" ${view.revisionOptions.canRollback ? '' : 'disabled'}>回到可用 checkpoint</option></select></label>` : '';
  const optional = [
    owns('C2') && ['A05', 'A07'].includes(actionId) ? '<label class="radio"><input type="checkbox" data-option-check="useC2"><span><strong>用快速原型省一點</strong><br><span class="muted">少花 Token，但合法不利分支會更有機會出現。</span></span></label>' : '',
    owns('C3') && ['A08', 'A09'].includes(actionId) ? '<label class="radio"><input type="checkbox" data-option-check="useC3"><span><strong>加做一次交叉檢查</strong><br><span class="muted">多花 1 Token，增加這次檢查覆蓋；它不會把舊結果變成新工作。</span></span></label>' : '',
    actionId === 'A07' ? '<label class="radio"><input type="checkbox" data-option-check="checkDelete"><span><strong>同時操作兩筆同名項目檢查刪除</strong><br><span class="muted">這是本次檢查做法，不是新的工作版本。</span></span></label>' : '',
    actionId === 'A04' && view.revisionOptions.canRepairDraft ? '<label class="radio revision-option"><input type="checkbox" data-option-check="repairDraft"><span><strong>訂正需求文件後再確認</strong><br><span class="muted">先建立真正的新文件修訂，再執行這項工作。</span></span></label>' : '',
    actionId === 'A06' && view.revisionOptions.canAskPrototypeFollowup ? '<label class="radio revision-option"><input type="checkbox" data-option-check="newRevision"><span><strong>換一個具體問題追問</strong><br><span class="muted">新問題會建立新的回答版本。</span></span></label>' : '',
    actionId === 'A10' && view.revisionOptions.canRefreshContext ? '<label class="radio revision-option"><input type="checkbox" data-option-check="repairDraft"><span><strong>依目前變更整理新摘要</strong></span></label>' : '',
    actionId === 'A11' && view.revisionOptions.canRepairNextIssue ? '<label class="radio revision-option"><input type="checkbox" data-option-check="repairDraft"><span><strong>修下一個仍開放的問題</strong></span></label>' : '',
  ].filter(Boolean).join('');
  return `${target}${repair}${optional ? `<details class="work-options"><summary>調整這次做法</summary>${optional}</details>` : ''}`;
}

export function renderPreview(view, actionId, options = {}, preview) {
  const action = ACTIONS[actionId];
  const scene = ACTION_SCENES[actionId] ?? { intro: '' };
  const previewStory = actionId === 'A07'
    ? `你把大工程切成單一範圍；這次選的是「${{ persistence: '保存與重新開啟', core: '新增、完成與刪除', delete: '單筆刪除' }[options.target ?? 'persistence']}」。做完只代表這個範圍完成，證據仍要重跑。`
    : actionId === 'A11' && view.knownIssues.length
      ? `這次優先處理「${view.knownIssues[0]}」。目前共有 ${view.knownIssues.length} 個公開問題；結果會依本次實際關閉範圍逐項列出。修訂會產生新的付費嘗試。`
      : scene.intro;
  const resolved = preview ?? { cached: false, cost: action.cost, overtime: false };
  const cachedNote = resolved.cached ? '<p class="notice"><strong>這個工作對象沒有改變。</strong>請回工作區免費查看上次結果；工具開關不能拿來重抽同一份內容。</p>' : '';
  const retryNote = !resolved.cached && (options.repairDraft || options.newRevision)
    ? '<p class="notice"><strong>這是新的付費嘗試。</strong>它會正常扣除資源並留下新的結果；仍可能再次失敗，但不會只是重播舊紀錄。</p>'
    : '';
  const delivery = actionId === 'A12' ? `<fieldset class="choice-row"><legend>這次交付意圖</legend>${view.deliveryChoices
    .map((choice) => `<label class="radio${choice.available ? '' : ' unavailable'}"><input type="radio" name="intent" value="${choice.intent}" ${options.intent === choice.intent && choice.available ? 'checked' : ''} ${choice.available ? '' : 'disabled'}><span><strong>${esc(choice.label)}${choice.available ? '' : '（目前不可用）'}</strong><br><span class="muted">${esc(choice.detail)}</span></span></label>`)
    .join('')}</fieldset>` : '';
  const selectedDelivery = actionId !== 'A12' || view.deliveryChoices.some((choice) => choice.intent === options.intent && choice.available);
  const confirmDisabled = (actionId === 'A12' && !selectedDelivery) || resolved.cached;
  const costText = actionId === 'A12'
    ? '免費檢查與結案，不消耗 Token、工作時間或加班'
    : resolved.cached
      ? '沒有新工作，不會扣費'
      : `${resolved.cost} Token、一次工作時間${resolved.overtime ? '，並使用一次加班' : ''}`;
  return `${renderHud(view)}<section class="panel result preview-screen" tabindex="-1"><div class="result-heading">${actionIllustration(actionId)}<div><div class="eyebrow">工作預覽 · 還沒扣款</div><h1>${esc(action.title)}</h1></div></div>${cachedNote}${retryNote}<p class="story preview-story">${esc(previewStory)}</p><div class="risk-ticket"><p><span>預計成本</span><strong>${esc(costText)}</strong></p><p><span>要承擔的風險</span><strong>${esc(action.risk)}</strong></p></div>${optionControls(view, actionId, options)}${delivery}${tutorial(actionId)}<div class="actions sticky-actions"><button class="button secondary" data-cancel>先不要，回工作區</button><button class="button" data-confirm ${confirmDisabled ? 'disabled' : ''}>${resolved.cached ? '請查看舊結果' : '確認執行'}</button></div></section>`;
}

function resultOptionText(options = {}) {
  const labels = [];
  if (options.target) labels.push(`範圍：${{ persistence: '保存與重新開啟', core: '新增、完成與刪除', delete: '單筆刪除' }[options.target] ?? options.target}`);
  if (options.mode) labels.push(`處理：${options.mode === 'rollback' ? '回到 checkpoint' : '小範圍修復'}`);
  if (options.useC2) labels.push('使用快速原型');
  if (options.useC3) labels.push('使用交叉檢查');
  if (options.checkDelete) labels.push('操作兩筆同名項目檢查刪除');
  return labels.length ? labels.join('；') : '使用當時的基本做法';
}

function processBlock(process, tone) {
  if (!process) return '';
  const beats = [['player', '01', '你怎麼說', process.player], ['response', '02', 'Claude／對方怎麼理解', process.response], ['follow', '03', '你怎麼追', process.followUp], ['consequence', '04', '事情怎麼落地', process.consequence]];
  return `<div class="process-story tone-${tone}">${beats.map(([kind, number, label, text], index) => `<section class="process-beat beat-${kind}">${processIcon(kind, tone)}<div><span><b>${number}</b>${label}</span><p class="${index === 3 ? 'story' : ''}">${esc(text)}</p></div></section>`).join('')}</div>`;
}

export function renderResult(view, result) {
  if (result.type === 'not-applicable' || result.type === 'gap') return `${renderHud(view)}<section class="panel result simple-result" tabindex="-1" aria-live="polite"><div class="result-heading">${actionIllustration('A12')}<div><div class="eyebrow">這一步還不能做</div><h1>先看清楚缺口</h1></div></div><p class="story">${esc(result.message)}</p><div class="actions"><button class="button" data-continue>回工作區</button></div></section>`;
  if (result.type === 'rest') return `${renderHud(view)}<section class="panel result simple-result" tabindex="-1" aria-live="polite"><div class="result-heading">${cardIllustration('C5')}<div><div class="eyebrow">工具沒有動，你先動去休息</div><h1>程式沒變，你恢復了一點</h1></div></div><p class="story">Token 回來一些，壓力也下降；時間照常前進${result.overtime ? '，而且這次休息算在加班裡' : ''}。</p><div class="actions"><button class="button" data-continue>回工作區</button></div></section>`;
  const event = result.event;
  const tone = eventTone(event.id);
  const scopeLabel = result.historical ? '當時範圍' : '本次範圍';
  const scope = result.actionId === 'A07' && result.semanticOptions?.target ? `<p class="result-scope"><strong>${scopeLabel}：</strong>${esc({ persistence: '保存與重新開啟', core: '新增、完成與刪除', delete: '單筆刪除' }[result.semanticOptions.target])}</p>` : '';
  const historical = result.historical
    ? `<p class="notice"><strong>這是先前結果，只供查看。</strong>沒有重新抽取、扣費或取得 XP；${result.currentlyValid ? '工作對象仍相同。' : '內容後來已變更，舊證據不代表現在有效。'}</p><p class="muted">當時做法：${esc(resultOptionText(result.semanticOptions))}<br>當時結束：Token ${result.resourcesAfter.token}、壓力 ${result.resourcesAfter.stress}、時間 ${result.resourcesAfter.timeLeft}。</p>`
    : result.cached ? '<p class="notice"><strong>這是先前結果。</strong>沒有重新抽取或扣費。</p>' : '';
  return `${renderHud(view)}<section class="panel result event-result tone-${tone}" tabindex="-1" aria-live="polite"><div class="result-heading">${actionIllustration(result.actionId)}<div><div class="eyebrow">${result.historical ? '先前工作紀錄' : '工作過程與結果'}</div><h1>${esc(event.title)}</h1><span class="outcome-stamp">${tone === 'good' ? '進展' : tone === 'warn' ? '出包' : '有變化'}</span></div></div>${historical}${scope}${processBlock(result.process, tone)}<div class="result-receipt"><p class="summary">${esc(event.summary)}</p><p class="muted">${result.historical || result.cached ? '這次是唯讀查看，資源沒有變動。' : `這項工作使用 ${result.cost} Token${result.overtime ? '，並使用一次加班' : ''}。`}</p></div>${tutorial(result.actionId)}<div class="actions sticky-actions"><button class="button" data-continue>收好結果，繼續</button></div></section>`;
}

export function renderUpgrade(view) {
  const reward = view.pendingUpgrade;
  const index = reward.threshold === 2 ? 1 : 2;
  const owned = Object.fromEntries(view.tools.map((tool) => [tool.id, tool.level]));
  const cards = reward.choices.map((id) => {
    const level = owned[id] ?? 0;
    const mode = level ? `融合升級 · Lv.${level} → Lv.${level + 1}` : '取得新卡 · Lv.1';
    const effect = level ? CARDS[id].upgradeDescription : CARDS[id].description;
    return `<button class="card tool-card upgrade-card" data-upgrade="${id}">${cardIllustration(id, level + 1)}<span class="card-copy"><span class="card-kicker">${esc(mode)}</span><strong>${esc(CARDS[id].name)}</strong><span>${esc(effect)}</span></span></button>`;
  }).join('');
  return `${renderHud(view)}<section class="hero screen upgrade-screen"><div class="stage-header compact"><div class="stage-copy"><div class="eyebrow">第 ${index} / 2 次中途工具獎勵 · ${reward.threshold} XP</div><h1>新卡，還是把舊卡焊得更兇？</h1><p class="lede">每輪三張是不同卡；已持有卡可融合成更強的 Lv.2，不增加卡槽。滿級卡不會來佔位。</p></div><div class="fusion-diagram" aria-hidden="true"><span></span><b>+</b><span></span><b>=</b><span class="fused"></span></div></div><div class="grid tool-grid">${cards}</div></section>`;
}

export function renderEnding(view) {
  const outcomeLabels = { E01: '正式交付', E02: '正式交付', E03: '正式交付', E04: '有限試用', E05: '展示原型', E06: '正式交付', E07: '進度交接', E08: '主動停止' };
  const facetLabels = { recovered: '修復後交付', 'high-stress': '高壓完成', 'on-time': '期限內完成', 'token-rich': 'Token 守財奴', 'token-gravekeeper': '額度的守墓人' };
  const facets = view.ending.facets?.length ? `<p class="muted">狀態尾聲：${view.ending.facets.map((facet) => esc(facetLabels[facet])).join('、')}</p>` : '';
  return `${renderHud(view)}<section class="hero ending ending-${esc(view.ending.baseId.toLowerCase())}" aria-live="polite"><div class="ending-tableau">${endingIllustration(view.ending.baseId, view.ending.facets)}<div class="ending-stamp"><span>案件結算</span><strong>${esc(outcomeLabels[view.ending.baseId])}</strong></div></div><div class="ending-copy"><div class="eyebrow">主要結果：${esc(outcomeLabels[view.ending.baseId])}</div><h1>${esc(view.ending.title)}</h1><p class="story">${esc(view.ending.text)}</p>${facets}<p class="muted">主要交付結果先由成果與證據決定；資源和歷程只會改變尾聲，不會把沒完成說成完美交付。</p><div class="coach-export"><strong>交給賽後教練</strong><p>下載檔只含本局公開遊戲資料，不含姓名、帳號、金鑰、seed 或未揭露缺陷。下載後手動放進專案 <code>runs</code> 資料夾。</p><p class="muted" data-export-status aria-live="polite"></p></div><div class="actions"><button class="button secondary" data-export-run>匯出賽後教練紀錄</button><button class="button" data-new>用新種子再接一案</button></div></div></section>`;
}
