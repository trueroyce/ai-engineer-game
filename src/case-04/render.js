import { CARDS } from '../career/cards.js';
import { TEMPLATES } from '../narrative/rules.js';
import { cardIllustration, characterPortrait } from '../narrative-ui/art.js';
import { renderLocalCoachPanel } from '../postgame/coach-ui.js';
import { case04PublicView, previewCase04Action } from './engine.js';
import { CASE04_ACTIONS, STRATEGIES } from './rules.js';
import { case04BoardScene, case04EndingScene, case04SceneForAction, renderCase04Scene } from './scene.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const actionChoiceCounts = Object.freeze({ D01: 2, D02: 4, D03: 2, D05: 3, D07: 2, D08: 2, D09: 4, D10: 2, D11: 2 });
const actionChoiceCount = (state, id) => {
  if (id === 'D04') return state.story.outcome === 'success' && state.equipped.includes('C5') ? 3 : 2;
  if (id === 'D06') return state.equipped.includes('C4') || state.equipped.includes('C15') ? 3 : 2;
  return actionChoiceCounts[id] ?? 1;
};
function renderRoutePreview(state) {
  const compatibilityReady = state.strategy !== 'rollback' || Boolean(
    state.compatibilityDecision?.revision === state.revision
      && ['compatible', 'adapter', 'isolated'].includes(state.dataCompatibility),
  );
  const steps = [
    { label: '1. 界定事故', done: Boolean(state.diagnosis), current: !state.diagnosis, currentText: '現在：先確認可重現範圍', lockedText: '' },
    { label: '2. 選定策略', done: Boolean(state.strategy), current: Boolean(state.diagnosis && !state.strategy), currentText: '現在：比較補丁、調查、重構或回滾', lockedText: '先完成事故界定' },
    { label: '3. 穩定服務', done: state.service.attempted, current: Boolean(state.strategy && !state.service.attempted), currentText: state.strategy === 'rollback' && !compatibilityReady ? '現在：回滾前先決定資料相容處理' : '現在：選擇穩定化方式', lockedText: '先選定救援策略' },
    { label: '4. 根因與回歸', done: Boolean(state.rootCause && state.evidence.revision === state.revision), current: Boolean(state.service.attempted && !(state.rootCause && state.evidence.revision === state.revision)), currentText: '現在：確認根因、回歸與延遲後果', lockedText: '先執行第一輪穩定化' },
    { label: '5. 核准與交接', done: Boolean(state.handoff.complete && state.approval?.status === 'approved'), current: Boolean(state.rootCause && state.evidence.revision === state.revision && !(state.handoff.complete && state.approval?.status === 'approved')), currentText: '現在：補齊負責人核准、交接與結案', lockedText: '先形成當前 revision 的回歸證據' },
  ];
  const items = steps.map((step) => {
    const status = step.done ? 'done' : step.current ? 'current' : 'locked';
    const statusText = step.done ? '已完成' : step.current ? step.currentText : `尚未開放：${step.lockedText}`;
    return `<li class="route-step ${status}"><strong>${esc(step.label)}</strong><small>${esc(statusText)}</small></li>`;
  }).join('');
  return `<section class="route-preview" aria-labelledby="case04-route-title"><h2 id="case04-route-title">救火路線</h2><ol class="route-steps">${items}</ol><p class="route-note">止損或帶風險結案始終可開啟，但不等於完成後續工程證據。</p></section>`;
}
const outcomeLabel = (value) => ({ success: '成功', partial: '部分成功', failure: '未成功' }[value] ?? '已記錄');
const shell = (body) => `<div class="topbar"><span class="brand">AI 工程接案遊戲 · CASE 04</span><a class="button secondary" href="./index.html">返回接案大廳</a></div>${body}`;
const art = (label = 'LEGACY ON FIRE', good = false, templateId = null, expression = 'focused') => `<span class="case04-art raster-case04-art ${good ? 'good' : 'bad'}" role="img" aria-label="${esc(label)}">${templateId ? characterPortrait(templateId, expression) : ''}<i class="ending-emblem" aria-hidden="true">${good ? '✓' : '!'}</i></span>`;
function hud(view) { return `<div class="hud"><div class="stat"><span>Token</span><strong>${view.resources.token}</strong></div><div class="stat"><span>壓力</span><strong>${view.resources.stress}/10</strong></div><div class="stat"><span>上線前時間</span><strong>${view.resources.time}</strong></div></div>`; }
const radio = (name, value, selected, title, detail, disabled = false) => `<label class="radio ${disabled ? 'locked' : ''}"><input type="radio" name="${name}" value="${value}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(title)}</strong><br><small>${esc(detail)}</small></span></label>`;

export function renderCase04Error(reason) { return shell(`<section class="hero"><h1>先回大廳整理值班表</h1><p class="lede">${esc(reason)}</p><a class="button primary" href="./index.html">返回大廳</a></section>`); }
export function renderCase04Intro(career) {
  const template = TEMPLATES[career.templateId]; const loadout = career.loadoutsByCase['case-04'];
  return shell(`<section class="hero">${art('昨天還好好的')}<div class="eyebrow">案件 04 · 上線前一天</div><h1>你只要小改一下<br>就好</h1><p class="lede">前人留下的系統突然出事。補丁、根因、重構與回滾都能救命，也都可能把問題送到凌晨三點。</p><p class="notice">sub-agent、log、Git、部署與 NPC 都是遊戲模擬；不會執行真 CLI、連線多人或呼叫模型。</p><div class="owned"><strong>${esc(template.name)}</strong><div>${loadout.map((id) => `<span class="tag">${esc(CARDS[id].name)} Lv.${career.cards[id]}</span>`).join('') || '<span class="tag">無卡也能玩</span>'}</div></div><button class="primary" data-start-case>接下值班手機</button></section>`);
}

export function renderCase04Board(state, message = '') {
  const view = case04PublicView(state);
  const stage = renderCase04Scene(case04BoardScene(state));
  const actions = view.availableActions.map((id, index) => {
    const count = actionChoiceCount(state, id);
    return `<article class="action-card"><div><span class="mark">${String(index + 1).padStart(2, '0')}</span><h3>${esc(CASE04_ACTIONS[id].title)}</h3><p>${esc(CASE04_ACTIONS[id].tutorial)}</p><span class="action-choice-count">內含 ${count} 種做法</span></div><button data-case04-action="${id}">打開 ${count} 種做法與成本</button></article>`;
  }).join('');
  const pending = view.story.pendingConsequence;
  const approvalStatus = view.approval?.status === 'approved'
    ? `${esc(view.approval.owner)}核准 ${esc(view.approval.scope)} · rev ${view.approval.revision}`
    : view.approval?.status === 'stale'
      ? '舊核准已因變更失效'
      : view.approval?.status === 'changes-requested'
        ? `負責人退回：${esc(view.approval.reasons?.join('；') ?? '需要補件')}${view.approval.suggestedScope === 'limited' ? '；可縮限重提' : ''}`
        : '尚未取得負責人核准';
  return shell(`${hud(view)}${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}<div class="layout"><section class="panel">${art(`REV ${view.revision} · ${view.strategy ?? '尚未選策略'}`, view.service.stable)}${stage}<div class="eyebrow">上線倒數 · revision ${view.revision}</div><h1>現在先救哪一層？</h1><div class="story-strip"><strong>早期決策留下什麼</strong><span>${pending ? pending.revealed ? esc(pending.text) : `已承諾；再完成 ${Math.max(0, 2 - view.story.followUpWork)} 次後續工作會回來` : '尚未形成策略承諾'}</span></div>${renderRoutePreview(state)}<div class="action-grid">${actions}</div></section><aside class="panel"><h2>公開事故狀態</h2><ul class="status-list"><li><strong>策略：</strong>${esc(view.strategy ? STRATEGIES[view.strategy].label : '未選')}</li><li><strong>服務：</strong>${view.service.stable ? '目前穩定' : view.service.attempted ? '仍不穩定' : '尚未處置'}</li><li><strong>資料相容：</strong>${esc(view.dataCompatibility)}${view.compatibilityDecision ? ` · rev ${view.compatibilityDecision.revision}` : ' · 尚未決策'}</li><li><strong>範圍核准：</strong>${approvalStatus}</li><li><strong>證據：</strong>${view.evidence.revision === view.revision ? `revision ${view.revision} · ${view.evidence.coverage}/4` : '目前版尚未重驗'}</li><li><strong>交接：</strong>${view.handoff.complete ? '完成' : '未完成'}</li></ul><h3>具名問題</h3><ul class="check-list">${view.issues.map((item) => `<li class="issue-${item.status}">${esc(item.text)}</li>`).join('') || '<li>目前尚無已揭露問題。</li>'}</ul><h3>正式交付缺口</h3><ul class="check-list">${view.blockers.map((item) => `<li>${esc(item)}</li>`).join('') || '<li>公開條件已對齊。</li>'}</ul></aside></div>`);
}

function controls(state, actionId, options) {
  if (actionId === 'D01') return radio('method', 'logs', options.method === 'logs', '先讀 log 與部署差異', '快，但可能只看到症狀。') + radio('method', 'reproduce', options.method === 'reproduce', '建立可重現輸入', '多花時間，後續判斷較穩。');
  if (actionId === 'D02') return Object.entries(STRATEGIES).map(([id, item]) => radio('strategy', id, options.strategy === id, item.label, `${item.token} Token／${item.time} 時間；不保證成功。`)).join('');
  if (actionId === 'D03') return radio('agentMode', 'sequential', options.agentMode === 'sequential', '逐份診斷', '較慢但依賴清楚。') + radio('agentMode', 'parallel', options.agentMode === 'parallel', '平行 sub-agent', '較快，但矛盾診斷需玩家裁決。');
  if (actionId === 'D10') return radio('compatibility', 'inspect', options.compatibility === 'inspect', '比對舊／新 schema 與真實資料樣本', '成功才可把目前 revision 標為相容；失敗會留下公開阻擋。') + radio('compatibility', 'isolate', options.compatibility === 'isolate', '停止新寫入並隔離資料路徑', '保服務的安全出口，但只能有限維持且限制持續公開。');
  if (actionId === 'D04') return state.story.outcome === 'success' ? radio('route', 'freeze', options.route === 'freeze', '凍結已穩定結果', '少做一點，保住證據。') + radio('route', 'improve', options.route === 'improve', '趁成功追加改善', 'revision 改變，舊證據失效。') + (state.equipped.includes('C5') ? radio('route', 'pace', options.route === 'pace', '節奏管理：先休整再凍結', '花 1 時間，回復 Token 並降低壓力；不會消除策略後果。') : '') : radio('route', 'alternate', options.route === 'alternate', '換方法並關閉部分功能', '保服務但只能有限維持。') + radio('route', 'hard', options.route === 'hard', '硬做並公開風險', '能往前，但留下未驗證路徑。');
  if (actionId === 'D11') return radio('proposal', 'verified', options.proposal === 'verified', '請負責人核准完整範圍', '負責人會依公開證據決定核准或退回；revision 改變後失效。') + radio('proposal', 'limited', options.proposal === 'limited', state.approval?.suggestedScope === 'limited' ? '依退回意見縮限重提' : '請負責人核准有限維持範圍', '明列關閉功能、資料限制與後續責任；缺補件仍會被退回。');
  if (actionId === 'D05') return radio('cause', 'code', options.cause === 'code', '程式缺陷', '修程式並用回歸驗證。') + radio('cause', 'requirement', options.cause === 'requirement', '需求／驗收本來就錯', '先修決策，不讓程式替需求背鍋。') + radio('cause', 'deploy', options.cause === 'deploy', '部署設定漂移', '保留程式，修環境與回復步驟。');
  if (actionId === 'D07') return radio('scope', 'focused', options.scope === 'focused', '聚焦回歸', '省資源，只能支撐有限結論。') + radio('scope', 'full', options.scope === 'full', '完整回歸', '覆蓋目前 revision 的四類證據。');
  if (actionId === 'D06') {
    const rescueCard = state.equipped.includes('C4') || state.equipped.includes('C15');
    return radio('response', 'contain', options.response === 'contain', '手工隔離後果', '無卡也能走；快，但限制仍須公開。')
      + radio('response', 'repair', options.response === 'repair', '定向修復', '無卡也能走；改 revision，必須再跑回歸。')
      + (rescueCard ? radio('response', 'isolate', options.response === 'isolate', '救援卡：鎖住壞接點', '少花一段時間並保住目前證據；隔離不等於修好。') : '');
  }
  if (actionId === 'D08') return radio('depth', 'minimal', options.depth === 'minimal', '最小值班交接', '列出目前版與關閉開關。') + radio('depth', 'complete', options.depth === 'complete', '完整 runbook', '補資料相容、責任人與回復步驟。');
  if (actionId === 'D09') { const view = case04PublicView(state); return radio('intent', 'verified', options.intent === 'verified', '正式上線', view.blockers.length ? `尚缺：${view.blockers.join('；')}` : '所有公開條件完成。', Boolean(view.blockers.length)) + radio('intent', 'limited', options.intent === 'limited', '有限維持／關功能', view.limitedBlockers.length ? `尚缺：${view.limitedBlockers.join('；')}` : '安全限制、負責人核准與交接均已公開。', Boolean(view.limitedBlockers.length)) + radio('intent', 'risk', options.intent === 'risk', '帶風險硬交', '結局會誠實記為失敗。') + radio('intent', 'stop', options.intent === 'stop', '保留現場並止損', '交出證據與下一步。'); }
  return '';
}
const optionKey = (id) => ({ D01:'method', D02:'strategy', D03:'agentMode', D10:'compatibility', D04:'route', D11:'proposal', D05:'cause', D07:'scope', D06:'response', D08:'depth', D09:'intent' }[id]);
export function renderCase04Preview(state, actionId, options) {
  const view = case04PublicView(state); let preview = null; try { preview = previewCase04Action(state, actionId, options); } catch { /* choice pending */ }
  return shell(`${hud(view)}<section class="panel preview" tabindex="-1">${art(CASE04_ACTIONS[actionId].title)}${renderCase04Scene(case04SceneForAction(state, actionId, options))}<div class="eyebrow">沒有預選正解</div><h1>${esc(CASE04_ACTIONS[actionId].title)}</h1><p>${esc(CASE04_ACTIONS[actionId].tutorial)}</p><div class="receipt"><div><span>Token</span><strong>${preview ? `-${preview.token}` : '待選'}</strong></div><div><span>時間</span><strong>${preview ? `-${preview.time}` : '待選'}</strong></div><div><span>壓力</span><strong>${preview ? `+${preview.stress}` : '待選'}</strong></div></div><div class="radio-list">${controls(state, actionId, options)}</div>${preview?.attempt ? `<p class="notice good">公開成功率 ${preview.attempt.chance}% · 累積理解 ${preview.attempt.learning}。失敗後才抽情境。</p>` : ''}<div class="actions sticky"><button class="secondary" data-case04-cancel>取消，不扣資源</button><button class="primary" data-case04-confirm ${options[optionKey(actionId)] ? '' : 'disabled'}>確認執行</button></div></section>`);
}
export function renderCase04Result(state, output) {
  const view = case04PublicView(state);
  const beats = Object.values(output.process ?? {});
  const latest = state.log[state.log.length - 1] ?? {};
  const stage = renderCase04Scene(case04SceneForAction(state, latest.actionId, latest.options ?? {}, output));
  return shell(`${hud(view)}<section class="panel result" tabindex="-1" aria-live="polite">${art(output.title, output.outcome === 'success')}${stage}<div class="eyebrow">舊系統事件結果</div><h1>${esc(output.title)}</h1><p class="lede">${esc(output.summary)}</p>${output.attempt ? `<p class="notice">公開機率 ${output.attempt.chance}% · ${outcomeLabel(output.attempt.outcome)}${output.attempt.retry ? ` · 重試理解 +${output.attempt.retryLearningGain}` : ''}</p>` : ''}<div class="process">${beats.map((text, index) => `<article class="beat"><b>${index + 1}</b><p>${esc(text)}</p></article>`).join('')}</div><button class="primary" data-case04-continue>${state.pendingReward ? '處理成長獎勵' : '回工作板'}</button></section>`);
}
export function renderCase04Reward(state) { const view = case04PublicView(state); return shell(`${hud(view)}<section class="panel reward-screen"><div class="eyebrow">本局成長 ${view.pendingReward.slot}/2</div><h1>三選一：收藏或融合</h1><div class="reward-grid">${view.pendingReward.choices.map((id) => { const option = view.pendingReward.options?.find((item) => item.id === id || item.cardId === id); if (option?.kind !== 'card') return `<button class="reward-card" data-case04-reward="${esc(id)}"><h3>${esc(option.title)}</h3><p>${esc(option.description)}</p></button>`; return `<button class="reward-card" data-case04-reward="${id}">${cardIllustration(id, state.cards[id] ? 2 : 1)}<h3>${esc(CARDS[id].name)}</h3><p>${esc(state.cards[id] ? CARDS[id].upgradeDescription : CARDS[id].description)}</p></button>`; }).join('')}</div></section>`); }
export function renderCase04Ending(state, settlement, coachView = null) {
  const verified = state.ending.baseId === 'C04-VERIFIED';
  const expression = verified ? 'relieved' : state.ending.baseId === 'C04-LIMITED' ? 'skeptical' : 'worried';
  return shell(`<section class="ending"><div class="hero">${art(state.ending.title, verified, state.templateId, expression)}${renderCase04Scene(case04EndingScene(state))}<div class="eyebrow">案件 04 結算</div><h1>${esc(state.ending.title)}</h1><p class="lede">${esc(state.ending.text)}</p>${state.ending.playFacets.map((facet) => `<article class="source-card"><span class="eyebrow">本局稱號</span><h3>${esc(facet.title)}</h3><p>${esc(facet.text)}</p></article>`).join('')}<p class="notice">新增 ${settlement.expGained} EXP；Token、壓力與時間不帶回大廳。</p>${renderLocalCoachPanel(coachView)}<a class="button primary" href="./index.html">返回接案大廳</a></div></section>`);
}
