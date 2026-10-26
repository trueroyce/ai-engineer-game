import { CARDS, TEMPLATES } from '../narrative/rules.js';
import { CAREER_LEVELS, createCareer, loadCareer, resetCareer, saveCareer, toggleEquipped } from './state.js';

const root = document.querySelector('#app');
let loaded = loadCareer();
let selectedTemplate = 'balanced';
let resetArmed = false;
let message = '';

const esc = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function icon(kind) {
  const paths = {
    person: '<circle cx="24" cy="15" r="7"/><path d="M10 42c1-11 7-17 14-17s13 6 14 17"/>',
    case: '<rect x="7" y="14" width="34" height="27" rx="4"/><path d="M17 14V9h14v5M7 25h34M20 25h8"/>',
    cards: '<rect x="8" y="10" width="24" height="30" rx="3"/><path d="m18 7 23 7-8 26M14 18h12M14 24h9"/>',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[kind]}</svg>`;
}

function templatesHtml() {
  return Object.values(TEMPLATES).map((template) => `<button class="choice ${selectedTemplate === template.id ? 'selected' : ''}" data-template="${template.id}" aria-pressed="${selectedTemplate === template.id}"><span class="choice-top"><strong>${esc(template.name)}</strong><small>${esc(template.difficulty)}</small></span><span>${esc(template.description)}</span><span class="stats">需求 ${template.attrs.A} · 實作 ${template.attrs.E} · 驗證 ${template.attrs.V}</span></button>`).join('');
}

function renderOnboarding(error = '') {
  root.innerHTML = `<header class="mast"><div><span class="eyebrow">AI 工程接案遊戲 · 擴充職涯</span><h1>先選今天要上班的自己</h1><p>每個職涯各自累積 EXP、卡庫與融合等級。換角色就是重新開始，不讓全能戰士的履歷偷偷塞進初心者口袋。</p></div>${icon('person')}</header>${error ? `<p class="alert">${esc(error)}</p>` : ''}<section aria-labelledby="character-title"><div class="section-title"><span>01</span><div><h2 id="character-title">建立新職涯</h2><p>角色能力固定；案件不會暗中配合你變難。</p></div></div><div class="choice-grid">${templatesHtml()}</div><button class="primary" data-create>建立職涯，進接案大廳</button></section><footer><a href="./classic.html">回到第一版三案玩法</a> · <a href="./case-01.html">直接玩第一版案件 01</a></footer>`;
}

function renderRecovery() {
  const unavailable = loaded.status === 'unavailable';
  root.innerHTML = `<header class="mast"><div><span class="eyebrow">AI 工程接案遊戲 · 擴充職涯</span><h1>這份本機存檔需要處理</h1><p>${esc(loaded.reason)}。系統沒有覆寫原字串，也不會偷偷猜版本。</p></div>${icon('person')}</header><section class="save-panel"><div><h2>${unavailable ? '本機儲存目前不可用' : '保留或清除，由你決定'}</h2><p>${unavailable ? '請允許這個本機網站使用瀏覽器儲存後重新整理。' : '清除後才能建立新職涯；這會移除舊 EXP、卡庫與結案紀錄。'}</p></div>${unavailable ? '<a class="project-start" href="./index.html">重新整理</a>' : resetArmed ? '<div class="reset-confirm"><p>確定清除這份不可讀或不支援的存檔？</p><button class="danger" data-recovery-confirm>確定清除</button><button data-reset-cancel>取消</button></div>' : '<button class="danger" data-recovery>清除舊存檔，重新開始</button>'}</section><footer><a href="./classic.html">第一版三案玩法（不使用職涯存檔）</a> · <a href="./case-01.html">第一版案件 01 直達</a></footer>`;
}

const PROJECT_STATUS = Object.freeze({
  '01': { available: true, href: './case-01.html?mode=career' },
  '02': { available: true, href: './case-02.html?mode=career', copy: 'CSV 整合與稽核；實際包含模擬 sub-agent 分工、資料契約、機率事件、整合、測試與可恢復失敗。', tags: ['已實作', '進階', '模擬分工'] },
  '03': { available: true, href: './case-03.html?mode=career', copy: '預約／借用管理；實際包含 NPC 客戶、設計師、工程師協調、介面契約、模擬 agent 分工、merge review、需求變更與可恢復失敗。', tags: ['已製作', '進階', 'NPC 協作'] },
});

function projectCard({ number, title, copy, tags }) {
  const status = PROJECT_STATUS[number];
  const actualCopy = status.copy ?? copy;
  const actualTags = status.tags ?? tags;
  return `<article class="project ${status.available ? 'available' : 'preparing'}"><div class="project-number">${number}</div><div><div class="tag-row">${actualTags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div><h3>${esc(title)}</h3><p>${esc(actualCopy)}</p>${status.available ? `<a class="project-start" href="${status.href}">開始案件</a>` : '<strong class="coming">籌備中 · 沒有假按鈕</strong>'}</div></article>`;
}

function renderLobby(career) {
  const template = TEMPLATES[career.templateId];
  const level = CAREER_LEVELS.find((entry) => entry.level === career.level);
  const next = CAREER_LEVELS.find((entry) => entry.level === career.level + 1);
  const cards = Object.entries(career.cards).map(([id, cardLevel]) => {
    const active = career.equipped.includes(id);
    const applicableCases = CARDS[id].case01 === false ? '適用案件 02、03' : '適用案件 01、02';
    return `<button class="owned-card ${active ? 'active' : ''}" data-toggle-card="${id}" aria-pressed="${active}"><span><strong>${esc(CARDS[id].name)}</strong> · Lv.${cardLevel}</span><small>${esc(applicableCases)} · ${active ? '啟用中（點一下停用）' : career.equipped.length >= 3 ? '收藏中（啟用槽已滿）' : '收藏中（點一下啟用）'}</small></button>`;
  }).join('') || '<p class="empty">卡庫還是空的。案件 01 開場會先抽三張選一張。</p>';
  const played = career.completedCases['case-01']?.plays ?? 0;
  root.innerHTML = `<header class="mast compact"><div><span class="eyebrow">接案大廳 · 資料只存在這個瀏覽器</span><h1>${esc(template.name)}的職涯</h1><p>${esc(level.title)} · Lv.${career.level} · ${career.exp} EXP${next ? `（距離 Lv.${next.level} 還差 ${next.minExp - career.exp}）` : '（目前封頂）'}</p></div>${icon('case')}</header>${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}<section class="career-strip" aria-label="職涯摘要"><div><span>角色</span><strong>${esc(template.name)}</strong></div><div><span>案件 01</span><strong>${played ? `已結束 ${played} 次` : '尚未結束'}</strong></div><div><span>啟用工具</span><strong>${career.equipped.length} / 3</strong></div><div><span>本機存檔</span><strong>career v1</strong></div></section><section><div class="section-title"><span>01</span><div><h2>選一個案子</h2><p>「進階」只是提醒，不是門禁。現在只有第一案完成可玩。</p></div></div><div class="projects">${projectCard({ number: '01', title: '管好自己', copy: '把一個待辦清單做得像個人話：釐清需求、實作、驗證，最後誠實交付或止損。', tags: ['已實作', '第一版規則'], available: true })}${projectCard({ number: '02', title: '三張表格，一份真相', copy: 'CSV 整合與稽核；規劃模擬 sub-agent 分工、資料契約、整合與測試。', tags: ['進階', '模擬分工'], available: false })}${projectCard({ number: '03', title: '大家都說只改一點點', copy: '預約與借用管理；規劃 NPC 客戶、設計師、工程師協調，以及介面變更、review 與合併。', tags: ['進階', 'NPC 協作'], available: false })}</div></section><section><div class="section-title"><span>02</span><div><h2>卡庫與啟用</h2><p>持有不等於啟用；最多三張生效。新獎勵在滿槽時會先收藏，不逼你丟卡。</p></div></div><div class="owned-grid">${cards}</div></section><section class="save-panel"><div><h2>存檔與重設</h2><p>職涯結算後自動寫入 <code>localStorage</code>；案件中的 Token、壓力與時間不跨案，也不保存未結束進度。</p></div>${resetArmed ? '<div class="reset-confirm"><p>確定清空這個職涯？EXP、卡庫、融合與結案紀錄都會消失。</p><button class="danger" data-reset-confirm>確定清空</button><button data-reset-cancel>取消</button></div>' : '<button class="danger" data-reset>重新選角色，開新職涯</button>'}</section><footer><a href="./classic.html">第一版三案玩法（保留）</a> · <a href="./case-01.html">第一版案件 01 直達</a></footer>`;
}

function enableCase02(career) {
  const project = root.querySelectorAll('.project')[1];
  if (!project) return;
  const plays = career.completedCases['case-02']?.plays ?? 0;
  if (plays) {
    const status = document.createElement('small');
    status.className = 'project-history';
    status.textContent = `已完成 ${plays} 次`;
    project.querySelector('h3')?.after(status);
  }
  const chooserCopy = root.querySelector('.section-title p');
  if (chooserCopy) chooserCopy.textContent = '「進階」只是提示，不是門鎖；案件 01 與 02 都可直接開局。';
}

function render() {
  if (loaded.status === 'ready') {
    renderLobby(loaded.career);
    enableCase02(loaded.career);
    const chooserCopy = root.querySelector('.section-title p');
    if (chooserCopy) chooserCopy.textContent = '「進階」只是提示，不是門鎖；案件 01、02 與 03 都可直接開局。';
  }
  else if (loaded.status === 'empty') renderOnboarding();
  else renderRecovery();
}

root.addEventListener('click', (event) => {
  const template = event.target.closest('[data-template]');
  if (template) { selectedTemplate = template.dataset.template; render(); return; }
  if (event.target.closest('[data-create]')) {
    if (loaded.status !== 'empty') return;
    const id = `career-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
    const career = createCareer({ careerId: id, templateId: selectedTemplate });
    loaded = { status: 'ready', career: saveCareer(career) };
    message = '新職涯已建立。第一案會使用全新的短期資源。';
    render(); return;
  }
  const card = event.target.closest('[data-toggle-card]');
  if (card && loaded.status === 'ready') {
    try {
      const career = toggleEquipped(loaded.career, card.dataset.toggleCard);
      loaded = { status: 'ready', career: saveCareer(career) };
      message = '啟用工具已更新；卡庫與融合等級沒有改變。';
    } catch (error) { message = error.message; }
    render(); return;
  }
  if (event.target.closest('[data-reset]')) { resetArmed = true; render(); return; }
  if (event.target.closest('[data-recovery]')) { resetArmed = true; render(); return; }
  if (event.target.closest('[data-reset-cancel]')) { resetArmed = false; render(); return; }
  if (event.target.closest('[data-recovery-confirm]')) {
    resetCareer(); loaded = { status: 'empty' }; resetArmed = false; render(); return;
  }
  if (event.target.closest('[data-reset-confirm]')) {
    resetCareer(); loaded = { status: 'empty' }; resetArmed = false; message = ''; render();
  }
});

render();
