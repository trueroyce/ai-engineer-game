import { CARDS, TEMPLATES } from '../narrative/rules.js';
import { CASE02_ACTIONS, CONTRACT_OPTIONS, NORMALIZATION_STRATEGIES } from './rules.js';
import { case02CardLevel, case02PublicView, previewCase02Action } from './engine-v2.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function icon(kind = 'table') {
  const shapes = {
    table: '<rect x="7" y="9" width="50" height="42" rx="5"/><path d="M7 21h50M20 9v42M39 9v42"/>',
    merge: '<path d="M10 12h12v12H10zM10 40h12v12H10zM42 26h12v12H42zM22 18c12 0 8 14 20 14M22 46c12 0 8-14 20-14"/>',
    agent: '<circle cx="20" cy="17" r="8"/><path d="M7 48c1-14 6-21 13-21s12 7 13 21M39 12h18v18H39zM43 36h14"/>',
  };
  return `<svg class="comic-icon" viewBox="0 0 64 64" aria-hidden="true">${shapes[kind]}</svg>`;
}

function shell(content) {
  return `<div class="topbar"><span class="brand">AI 工程接案遊戲 · CASE 02</span><a class="button secondary" href="./index.html">返回接案大廳</a></div>${content}`;
}

export function renderCase02Error(reason) {
  return shell(`<section class="hero"><div class="eyebrow">職涯存檔未就緒</div><h1>先回大廳領識別證</h1><p class="lede">${esc(reason)}。原存檔不會被覆寫；案件 02 只從有效職涯啟動。</p><div class="actions"><a class="button primary" href="./index.html">返回大廳</a><a class="button secondary" href="./classic.html">玩第一版</a></div></section>`);
}

export function renderCase02Intro(career) {
  const template = TEMPLATES[career.templateId];
  const equipped = career.equipped.length
    ? career.equipped.map((id) => `<span class="tag">${esc(CARDS[id].name)} Lv.${career.cards[id]}</span>`).join('')
    : '<span class="tag">沒有裝備卡，也能完成</span>';
  return shell(`<section class="hero">${icon('merge')}<div class="eyebrow">進階案件 · 不鎖等級</div><h1>三張表格，<br>一份真相</h1><p class="lede">客戶說只是把 customers、invoices、refunds 合在一起。三張表分別使用 customer_id、client_no 和自己的日期格式；17:58 還會多一條退款規則。你可以獨作或派模擬 agent，但最後的契約與交付決策仍是你的。</p><p class="notice">這是遊戲內模擬：不會啟動真 sub-agent、不讀外部 CSV、不呼叫模型或連網。</p><div class="owned"><strong>${esc(template.name)} · 需求 ${template.attrs.A}／工程 ${template.attrs.E}／驗證 ${template.attrs.V}</strong><div>${equipped}</div></div><div class="actions"><button class="primary" data-start-case>讀三張表，開始接案</button></div></section><section><h2>公開來源資訊</h2><div class="source-grid"><article class="source-card"><span class="eyebrow">customers.csv</span><h3>客戶主檔</h3><p><code>customer_id</code><code>email</code><code>created_at</code></p><small>日期：ISO；每位客戶一列。</small></article><article class="source-card"><span class="eyebrow">invoices.csv</span><h3>發票匯出</h3><p><code>client_no</code><code>invoice_date</code><code>amount</code></p><small>日期：YYYY/MM/DD；可能重複匯出同發票。</small></article><article class="source-card"><span class="eyebrow">refunds.csv</span><h3>退款紀錄</h3><p><code>customer_id</code><code>processed_at</code><code>amount</code></p><small>日期：ISO；17:58 會補上截止與原因規則。</small></article></div></section>`);
}

function hud(view) {
  return `<div class="hud" aria-label="案件資源"><div class="stat"><span>Token</span><strong>${view.resources.token}</strong></div><div class="stat"><span>壓力</span><strong>${view.resources.stress} / 10</strong></div><div class="stat"><span>工作時間</span><strong>${view.resources.time}</strong></div></div>`;
}

function status(view) {
  const contract = view.contract ? `${view.contract.aligned} / 3 對齊` : '尚未建立';
  const tests = view.tests.testedRevision === null ? '尚未執行' : view.tests.stale ? '舊證據已過期' : `${view.tests.coverage} / 4 覆蓋，${view.tests.failed.length} 失敗`;
  return `<aside class="panel"><h2>單一真相儀表板</h2><ul class="status-list"><li><strong>資料契約：</strong>${esc(contract)}</li><li><strong>正規化：</strong>${view.normalization?.complete ? esc(view.normalization.strategy) : '未完成'}</li><li><strong>整合：</strong>${view.integration?.complete ? `完成，整合債 ${view.integration.unresolvedDebt}` : '未完成'}</li><li><strong>17:58 變更：</strong>${view.change.contractUpdated ? '已寫回契約' : view.change.handled ? '只補輸出，契約漂移' : view.change.announced ? '待玩家決策' : '尚未出現'}</li><li><strong>測試：</strong>${esc(tests)}</li><li><strong>來源追溯：</strong>${view.provenance ? '已建立' : '未建立'}</li></ul><h3>目前交付缺口</h3>${view.blockers.length ? `<ul class="check-list">${view.blockers.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="notice good">全部公開條件已通過，可以正式交付。</p>'}<details><summary>這裡在教什麼？</summary><p>資料整合不是把三張表貼在一起；契約、分工、整合、測試與來源追溯要能對到同一版本。畫面只顯示公開狀態，不透露隱藏路線。</p></details></aside>`;
}

function availability(state, actionId) {
  if (actionId === 'B02' && !state.contract) return '先建立契約';
  if (actionId === 'B03' && !state.normalization?.complete) return '先正規化來源';
  if (actionId === 'B04' && !state.change.announced) return '整合後才會收到變更';
  if (actionId === 'B05' && !state.integration?.complete) return '先完成整合';
  if (['B06', 'B07'].includes(actionId) && !state.integration?.complete) return '先完成整合';
  return '';
}

export function renderCase02Board(state, message = '') {
  const view = case02PublicView(state);
  const actions = Object.values(CASE02_ACTIONS).map((action, index) => {
    const reason = availability(state, action.id);
    return `<article class="action-card ${reason ? 'locked' : ''}"><div><span class="mark">${String(index + 1).padStart(2, '0')}</span><h3>${esc(action.title)}</h3><p>${esc(action.tutorial)}</p></div><button ${reason ? 'disabled' : ''} data-case02-action="${action.id}">${reason ? esc(reason) : '查看成本與選項'}</button></article>`;
  }).join('');
  const tools = view.cards.filter((card) => card.equipped).map((card) => `<span class="tag">${esc(card.name)} Lv.${card.level}</span>`).join('') || '<span class="tag">未裝備卡</span>';
  return shell(`${hud(view)}${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}<div class="layout"><section class="panel"><div class="eyebrow">資料版本 ${view.dataRevision}</div><h1>現在該處理哪個真相？</h1><p>裝備效果：${tools}</p><div class="action-grid">${actions}</div></section>${status(view)}</div>`);
}

function contractControls(options) {
  return ['idPolicy', 'datePolicy', 'duplicatePolicy'].map((key) => `<label class="field"><strong>${{ idPolicy: '共同 ID', datePolicy: '日期格式', duplicatePolicy: '重複列政策' }[key]}</strong><select data-case02-option="${key}">${CONTRACT_OPTIONS[key].map((item) => `<option value="${item.value}" ${options[key] === item.value ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label>`).join('');
}

function radio(name, value, checked, title, detail, disabled = false) {
  return `<label class="radio ${disabled ? 'locked' : ''}"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(title)}</strong><br><small>${esc(detail)}</small></span></label>`;
}

function controls(state, actionId, options, view) {
  if (actionId === 'B01') return contractControls(options);
  if (actionId === 'B02') {
    const strategies = Object.values(NORMALIZATION_STRATEGIES).map((item) => radio('strategy', item.value, options.strategy === item.value, item.label, `基礎：${item.token} Token／${item.time} 時間／${item.baseDebt} 整合債`)).join('');
    const rapid = case02CardLevel(state, 'C2');
    return `<div class="radio-list">${strategies}</div>${rapid ? `<label class="radio"><input type="checkbox" data-case02-check="useRapid" ${options.useRapid ? 'checked' : ''}><span><strong>使用快速原型 Lv.${rapid}</strong><br><small>節省 ${rapid} 時間，固定增加 1 整合債。</small></span></label>` : ''}`;
  }
  if (actionId === 'B04') return `<div class="radio-list">${radio('response', 'contract', options.response === 'contract', '更新資料契約', '花多一點 Token，把退款截止與原因欄位變成可測規則。')}${radio('response', 'patch', options.response === 'patch', '只補最後輸出', '較便宜，但契約與實作漂移；正式交付前仍需修復。')}</div>`;
  if (actionId === 'B05') return `<div class="radio-list">${radio('mode', 'repair', options.mode === 'repair', '回到契約與 mapping 修復', '保留來源，修復後需重跑測試與追溯。')}${radio('mode', 'delete', options.mode === 'delete', '刪掉對不上的列', '快速清零整合債，但留下不可逆的來源缺口。')}</div>`;
  if (actionId === 'B06') return `<div class="radio-list">${radio('scope', 'focused', options.scope === 'focused', '聚焦測試', '基本覆蓋 2 類；測試助理可增加覆蓋。')}${radio('scope', 'full', options.scope === 'full', '完整交叉測試', '列數、孤兒退款、總額與來源追溯全部檢查。')}</div>`;
  if (actionId === 'B09') return `<div class="radio-list">${radio('intent', 'verified', options.intent === 'verified', '正式驗證交付', view.verifiedReady ? '所有公開條件通過。' : `尚缺：${view.blockers.join('；')}`, !view.verifiedReady)}${radio('intent', 'limited', options.intent === 'limited', '有限試用', '清楚列出限制，不宣稱可結帳。')}${radio('intent', 'rush', options.intent === 'rush', '冒險交付', '明知缺口仍交付；可能形成失敗終局。')}${radio('intent', 'stop', options.intent === 'stop', '主動止損', '保留契約與證據，返回大廳。')}</div>`;
  return '';
}

export function renderCase02Preview(state, actionId, options) {
  const view = case02PublicView(state);
  const action = CASE02_ACTIONS[actionId];
  let preview;
  try { preview = previewCase02Action(state, actionId, options); } catch { preview = { token: 0, time: 0, stress: 0 }; }
  const extra = actionId === 'B02' ? `<div><span>brief 品質</span><strong>${preview.briefScore ?? 0}</strong></div><div><span>預估整合債</span><strong>${preview.predictedDebt ?? 0}</strong></div>` : '';
  const selectedDelivery = actionId !== 'B09' || Boolean(options.intent);
  return shell(`${hud(view)}<section class="panel preview" tabindex="-1"><div class="eyebrow">確認工作 · 尚未扣資源</div><h1>${esc(action.title)}</h1><p>${esc(action.tutorial)}</p><div class="receipt"><div><span>Token</span><strong>-${preview.token}</strong></div><div><span>時間</span><strong>-${preview.time}</strong></div><div><span>壓力</span><strong>+${preview.stress}</strong></div>${extra}</div>${controls(state, actionId, options, view)}<details><summary>展開教學：這不是在呼叫真工具</summary><p>畫面中的 agent、contract、merge 與 test 是遊戲狀態機概念。按下確認不會啟動真 sub-agent、CLI 或模型。</p></details><div class="actions sticky"><button class="secondary" data-case02-cancel>取消，回工作板</button><button class="primary" data-case02-confirm ${selectedDelivery ? '' : 'disabled'}>確認執行</button></div></section>`);
}

export function renderCase02Result(state, result) {
  const view = case02PublicView(state);
  const beats = result.process ? [result.process.player, result.process.response, result.process.followUp, result.process.consequence] : [];
  return shell(`${hud(view)}<section class="panel result" tabindex="-1" aria-live="polite"><div class="eyebrow">工作結果 · 公開證據</div><h1>${esc(result.title)}</h1><p class="lede">${esc(result.summary)}</p>${beats.length ? `<div class="process">${beats.map((text, index) => `<article class="beat"><b>${index + 1}</b><p>${esc(text)}</p></article>`).join('')}</div>` : ''}<div class="actions"><button class="primary" data-case02-continue>${view.pendingReward ? '先處理卡片獎勵' : '回工作板'}</button></div></section>`);
}

export function renderCase02Reward(state) {
  const view = case02PublicView(state);
  const cards = view.pendingReward.choices.map((id) => {
    const level = state.cards[id] ?? 0;
    const full = state.equipped.length >= 3 && !state.equipped.includes(id);
    const mode = level ? `融合 Lv.${level} → Lv.${Math.min(2, level + 1)}` : full ? '收藏，不自動換掉裝備' : '收藏並自動裝備';
    return `<button class="reward-card" data-case02-reward="${id}"><span class="eyebrow">${esc(mode)}</span><h3>${esc(CARDS[id].name)}</h3><p>${esc(level ? CARDS[id].upgradeDescription : CARDS[id].description)}</p></button>`;
  }).join('');
  return shell(`${hud(view)}<section class="panel reward-screen"><div class="eyebrow">一次性整合工具獎勵</div><h1>新卡、融合，或先收進卡庫</h1><p class="lede">滿三張裝備也不用丟卡；新卡會收藏。這個 reward ID 每個職涯只會出現一次。</p><div class="reward-grid">${cards}</div></section>`);
}

export function renderCase02Ending(state, settlement) {
  const view = case02PublicView(state);
  const ending = state.ending;
  return shell(`<section class="ending"><div class="hero">${icon('table')}<div class="eyebrow">案件 02 結算 · ${esc(ending.baseId)}</div><h1>${esc(ending.title)}</h1><p class="lede">${esc(ending.text)}</p><p class="notice">本次新增 ${settlement?.expGained ?? 0} EXP；同一 milestone 與卡片 reward 不會重複領取。Token、壓力與時間不帶回大廳。</p>${view.blockers.length ? `<h2>結案時公開缺口</h2><ul>${view.blockers.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="notice good">契約、測試與追溯全部對齊。</p>'}<div class="actions"><a class="button primary" href="./index.html" data-return-lobby>返回接案大廳</a></div></div></section>`);
}
