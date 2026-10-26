import { CARDS, TEMPLATES } from '../narrative/rules.js';
import { CASE03_ACTIONS, STRATEGIES } from './rules.js';
import { case03PublicView, previewCase03Action } from './engine.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const shell = (body) => `<div class="topbar"><span class="brand">AI 工程接案遊戲 · CASE 03</span><a class="button secondary" href="./index.html">返回接案大廳</a></div>${body}`;
const icon = () => '<svg class="comic-icon" viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="12" width="48" height="40" rx="7"/><path d="M8 24h48M20 7v11M44 7v11M19 34h10M35 34h10M19 43h10"/></svg>';

function hud(view) {
  return `<div class="hud" aria-label="案件資源"><div class="stat"><span>Token</span><strong>${view.resources.token}</strong></div><div class="stat"><span>壓力</span><strong>${view.resources.stress} / 10</strong></div><div class="stat"><span>工作時間</span><strong>${view.resources.time}</strong></div></div>`;
}

export function renderCase03Error(reason) {
  return shell(`<section class="hero"><div class="eyebrow">職涯存檔未就緒</div><h1>先回大廳選角色</h1><p class="lede">${esc(reason)}</p><a class="button primary" href="./index.html">返回大廳</a></section>`);
}

export function renderCase03Intro(career) {
  const template = TEMPLATES[career.templateId];
  const equipped = career.equipped.length ? career.equipped.map((id) => `<span class="tag">${esc(CARDS[id].name)} Lv.${career.cards[id]}</span>`).join('') : '<span class="tag">沒有裝備卡也能開局</span>';
  return shell(`<section class="hero">${icon()}<div class="eyebrow">進階案件 · NPC 協作</div><h1>大家都說<br>只改一點點</h1><p class="lede">做一套預約／借用管理：客戶負責決策，設計師負責狀態，工程師負責 API，你負責讓三個人不要在同一張截圖裡講三種規格。</p><p class="notice">NPC、sub-agent、review、merge 與測試都是遊戲模擬；不會連線多人、啟動 CLI 或呼叫模型。</p><div class="owned"><strong>${esc(template.name)} · 需求 ${template.attrs.A}／工程 ${template.attrs.E}／驗證 ${template.attrs.V}</strong><div>${equipped}</div></div><div class="actions"><button class="primary" data-start-case>打開排程表，開始案件</button></div></section><section><h2>合作角色</h2><div class="source-grid"><article class="source-card"><span class="eyebrow">NPC 客戶</span><h3>決策擁有者</h3><p>決定取消、時區、借用上限；agent 不能代簽。</p></article><article class="source-card"><span class="eyebrow">NPC 設計師</span><h3>介面與狀態</h3><p>確認空狀態、衝突與錯誤訊息。</p></article><article class="source-card"><span class="eyebrow">NPC 工程師</span><h3>API 與合併</h3><p>維護 payload、review 與回歸證據。</p></article></div></section>`);
}

function reason(state, id) {
  if (id === 'C02' && !state.requirements) return '先處理需求';
  if (id === 'C03' && !state.contract?.approved) return '等待客戶核准';
  if (id === 'C04' && !state.implementation?.complete) return '先完成實作';
  if (id === 'C05' && !state.merge?.complete) return '先合併 review';
  if (id === 'C06' && !state.change.announced) return '需求變更尚未出現';
  if (id === 'C08' && !state.integrationDebt && !state.evidence.failed.length) return '目前無修復缺口';
  return '';
}

export function renderCase03Board(state, message = '') {
  const view = case03PublicView(state);
  const cards = view.cards.filter((card) => card.equipped).map((card) => `<span class="tag">${esc(card.name)} Lv.${card.level}</span>`).join('') || '<span class="tag">未裝備卡</span>';
  const actions = Object.values(CASE03_ACTIONS).map((action, index) => {
    const locked = reason(state, action.id);
    return `<article class="action-card ${locked ? 'locked' : ''}"><div><span class="mark">${String(index + 1).padStart(2, '0')}</span><h3>${esc(action.title)}</h3><p>${esc(action.tutorial)}</p></div><button data-case03-action="${action.id}" ${locked ? 'disabled' : ''}>${locked || '查看成本與選項'}</button></article>`;
  }).join('');
  return shell(`${hud(view)}${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}<div class="layout"><section class="panel"><div class="eyebrow">artifact revision ${view.artifactRevision}</div><h1>今天要協調哪一團？</h1><p>啟用工具：${cards}</p><div class="action-grid">${actions}</div></section><aside class="panel"><h2>公開狀態</h2><ul class="status-list"><li><strong>需求：</strong>${view.requirements?.clear ? '已收斂' : view.requirements ? '仍有矛盾' : '未處理'}</li><li><strong>契約：</strong>${view.contract?.approved ? '客戶已核准' : '未核准'}</li><li><strong>分工：</strong>${esc(view.implementation?.strategy ?? '未安排')}</li><li><strong>合併債：</strong>${view.integrationDebt}</li><li><strong>變更：</strong>${view.change.handled ? '已簽入契約' : view.change.announced ? '仍未決' : '尚未出現'}</li><li><strong>證據：</strong>${view.evidence.revision === view.artifactRevision ? `目前版 ${view.evidence.coverage}/4` : '尚未重驗目前版'}</li></ul><h3>正式交付缺口</h3>${view.blockers.length ? `<ul class="check-list">${view.blockers.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="notice good">全部公開條件已對齊。</p>'}<details><summary>這是真多人或真 agent 嗎？</summary><p>不是。角色、分工、事件與工具名稱都是遊戲內模擬，不會連線或花模型費用。</p></details></aside></div>`);
}

const radio = (name, value, selected, title, detail, disabled = false) => `<label class="radio ${disabled ? 'locked' : ''}"><input type="radio" name="${name}" value="${value}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(title)}</strong><br><small>${esc(detail)}</small></span></label>`;

function controls(state, actionId, options, view) {
  if (actionId === 'C01') return `<div class="radio-list">${radio('scope', 'core', options.scope === 'core', '先收斂核心預約', '較省 Token／時間，但不含完整借用與取消責任，只能有限交付。')}${radio('scope', 'full', options.scope === 'full', '納入借用、取消與衝突', '多 1 Token、1 時間並承擔完整驗收責任，可走正式交付。')}</div>`;
  if (actionId === 'C02') return `<div class="radio-list">${radio('policy', 'explicit', options.policy === 'explicit', '客戶逐項核准', '較穩但需要明確回答。')}${radio('policy', 'async', options.policy === 'async', '留言核准整份契約', '較快，仍必須由客戶本人決定。')}</div>`;
  if (actionId === 'C03') return `<div class="radio-list">${Object.entries(STRATEGIES).map(([id, item]) => radio('strategy', id, options.strategy === id, item.label, `${item.token} Token／${item.time} 時間／基礎債 ${item.debt}`)).join('')}</div>`;
  if (actionId === 'C04') return `<div class="radio-list">${radio('mergeMode', 'strict', options.mergeMode === 'strict', '逐項 review 後合併', '成本較高，成功機會較穩。')}${radio('mergeMode', 'fast', options.mergeMode === 'fast', '快速合併', '省資源但固定增加 1 點公開債。')}</div>`;
  if (actionId === 'C05') return `<div class="radio-list">${radio('response', 'negotiate', options.response === 'negotiate', '協商範圍與代價', '要求客戶留下決策。')}${radio('response', 'accept', options.response === 'accept', '先接受再補文件', '壓力較高，仍可能留下未決。')}</div>`;
  if (actionId === 'C06') return `<div class="radio-list">${radio('scope', 'focused', options.scope === 'focused', '聚焦回歸', '較省成本，追溯可能不足。')}${radio('scope', 'full', options.scope === 'full', '完整回歸與追溯', '覆蓋目前 revision 的四類證據。')}</div>`;
  if (actionId === 'C07') return `<div class="radio-list">${radio('intent', 'verified', options.intent === 'verified', '正式交付', view.verifiedReady ? '條件已滿足。' : `尚缺：${view.blockers.join('；')}`, !view.verifiedReady)}${radio('intent', 'limited', options.intent === 'limited', '有限試用', state.implementation?.complete ? '交付已完成的子集並明示限制。' : '尚無已完成子集，不能有限試用。', !state.implementation?.complete)}${radio('intent', 'risk', options.intent === 'risk', '帶風險硬交', '結果會誠實記為失敗。')}${radio('intent', 'stop', options.intent === 'stop', '止損並交接', '保留現況後回大廳。')}</div>`;
  return '<p class="notice">這是付費恢復；失敗也會留下下一步，不會免費重骰。</p>';
}

function complete(actionId, options) {
  const key = { C01: 'scope', C02: 'policy', C03: 'strategy', C04: 'mergeMode', C05: 'response', C06: 'scope', C07: 'intent' }[actionId];
  return key ? Boolean(options[key]) : true;
}

export function renderCase03Preview(state, actionId, options) {
  const view = case03PublicView(state);
  let preview = null;
  try { preview = previewCase03Action(state, actionId, options); } catch { /* explicit choice pending */ }
  return shell(`${hud(view)}<section class="panel preview" tabindex="-1"><div class="eyebrow">確認工作 · 沒有預選答案</div><h1>${esc(CASE03_ACTIONS[actionId].title)}</h1><p>${esc(CASE03_ACTIONS[actionId].tutorial)}</p><div class="receipt"><div><span>Token</span><strong>${preview ? `-${preview.token}` : '待選'}</strong></div><div><span>時間</span><strong>${preview ? `-${preview.time}` : '待選'}</strong></div><div><span>壓力</span><strong>${preview ? `+${preview.stress}` : '待選'}</strong></div><div><span>事件</span><strong>能力＋卡片＋新樣本</strong></div></div>${controls(state, actionId, options, view)}<p class="notice">公開選項會改變成本與事件條件；不顯示隱藏骰值，也不偷偷推薦正解。</p><details><summary>折疊教學：這次會模擬什麼？</summary><p>只模擬客戶、設計師、工程師與 agent 的協作過程。它不會啟動真工具、真 CLI 或網路服務。</p></details><div class="actions sticky"><button class="secondary" data-case03-cancel>取消，不扣資源</button><button class="primary" data-case03-confirm ${complete(actionId, options) ? '' : 'disabled'}>確認執行</button></div></section>`);
}

export function renderCase03Result(state, result) {
  const view = case03PublicView(state);
  const beats = result.process ? Object.values(result.process) : [];
  return shell(`${hud(view)}<section class="panel result" tabindex="-1" aria-live="polite"><div class="eyebrow">協作事件結果</div><h1>${esc(result.title)}</h1><p class="lede">${esc(result.summary)}</p>${beats.length ? `<div class="process">${beats.map((text, index) => `<article class="beat"><b>${index + 1}</b><p>${esc(text)}</p></article>`).join('')}</div>` : ''}<div class="actions"><button class="primary" data-case03-continue>${state.pendingReward ? '處理中段卡片獎勵' : '回工作板'}</button></div></section>`);
}

export function renderCase03Reward(state) {
  const view = case03PublicView(state);
  const cards = view.pendingReward.choices.map((id) => {
    const old = state.cards[id] ?? 0;
    const mode = old ? `融合 Lv.${old} → Lv.${old + 1}` : state.equipped.length >= 3 ? '收藏，不強迫丟卡' : '收藏並自動啟用';
    return `<button class="reward-card" data-case03-reward="${id}"><span class="eyebrow">${esc(mode)}</span><h3>${esc(CARDS[id].name)}</h3><p>${esc(old ? CARDS[id].upgradeDescription : CARDS[id].description)}</p></button>`;
  }).join('');
  return shell(`${hud(view)}<section class="panel reward-screen"><div class="eyebrow">中段交接工具獎勵</div><h1>收藏、融合，或留在卡庫</h1><p class="lede">最多仍只啟用三張；拿獎不需要先丟卡。領完後仍有 merge、變更、測試與交付玩法。</p><div class="reward-grid">${cards}</div></section>`);
}

export function renderCase03Ending(state, settlement) {
  return shell(`<section class="ending"><div class="hero">${icon()}<div class="eyebrow">案件 03 結算 · ${esc(state.ending.baseId)}</div><h1>${esc(state.ending.title)}</h1><p class="lede">${esc(state.ending.text)}</p><p class="notice">本次新增 ${settlement.expGained} EXP；相同 milestone 與 reward 不重複領取。Token、壓力與時間不帶回大廳。</p><div class="actions"><a class="button primary" data-return-lobby href="./index.html">返回接案大廳</a></div></div></section>`);
}
