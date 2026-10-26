// 完整第一版的純函式渲染：viewModel（玩家可見資訊；稽核模式另附稽核視圖）→ HTML 字串。
// 所有數字來自引擎的玩家視圖、合法行動與 previewAction；這裡不重寫任何規則算式。
import { RULES } from '../core/rules.js';
import { validateAttributes } from '../core/engine.js';
import { settlementSummary } from '../core/summary.js';
import { formatEvent, cardLabel, projectLabel, statusText } from './text.js';
import { CLI_ROWS, CLI_NOTE, CLI_BOUNDARY, CLI_CHECKED_DATE } from './cli.js';

const FICTION = '遊戲虛構工具，不代表真實 Claude Code 功能';
const DESIGNATED = '指定候選樣本（測試注入），不是隨機抽中';
const IN_PROGRESS = new Set(['openingDraft', 'turnStart', 'actionSelection', 'levelDraft']);

export function initialUi() {
  return {
    setup: { A: 2, E: 2, V: 2 }, setupTemplate: 'balanced', draftPick: [], preview: null, draftChoice: null, replace: null,
    confirmSettle: false, confirmNewGame: false, sidebarOpen: false, submitting: false, message: null,
  };
}

export function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const e = escapeHtml;

function designatedNote(draft) {
  return draft.designated ? `<p class="hint" role="note">⚑ ${e(DESIGNATED)}</p>` : '';
}

function message(ui) {
  return ui.message ? `<p class="message" role="alert">✕ ${e(ui.message)}</p>` : '';
}

function cardDetail(id) {
  const c = RULES.cards[id];
  return `<span class="card-name">${e(id)} ${e(c.name)}</span><span class="card-role">定位：${e(c.role)}${c.toggle ? '｜需手動開啟，預設關閉' : '｜自動生效'}</span>
    <span class="card-level">L1：${e(c.levels[0])}</span><span class="card-level">L2：${e(c.levels[1])}</span>
    <span class="card-cost">代價：${e(c.cost)}</span><span class="fiction">${e(FICTION)}</span>`;
}

function toolsText(equipped) {
  return equipped.length ? equipped.map((c) => cardLabel(c.id, c.level)).join('、') : '（無）';
}

// ---- 稽核模式（?audit=1）：只在 vm.audit 存在時輸出 H 與秘密骰 ----

function auditBanner(vm) {
  return vm.audit ? '<p class="audit-banner" role="note"><strong>⚠ 稽核模式：畫面顯示隱藏缺陷與秘密骰</strong>（主持與除錯用；一般遊玩請使用不帶 ?audit=1 的網址）</p>' : '';
}

function auditProject(vm, id) {
  if (!vm.audit) return '';
  return `<br><span class="audit">【稽核】隱藏缺陷 H=${vm.audit.projects[id].hiddenDefects}</span>`;
}

function auditEventLine(vm, seq) {
  if (!vm.audit) return '';
  const ev = vm.audit.events.find((x) => x.seq === seq);
  const die = ev?.dice.find((d) => d.stream === 'defect');
  if (!die) return '';
  const added = ev.outcome.defectAdded;
  return `<br><span class="audit">【稽核】秘密骰 h${die.index}=${die.value} ${added ? '≤' : '>'} q${ev.q} → ${added ? '新增 1 個隱藏缺陷' : '未新增'}</span>`;
}

// ---- 共用區塊 ----

function header(vm, ui) {
  const inProgress = IN_PROGRESS.has(vm.view.phase);
  const restart = inProgress ? '<button type="button" class="small" data-cmd="askNewGame" data-key="restart">重新開始</button>' : '';
  const confirm = ui.confirmNewGame
    ? `<div class="confirm" role="alertdialog" aria-labelledby="h-newgame" aria-describedby="d-newgame">
        <h2 id="h-newgame">確認重新開始？</h2>
        <p id="d-newgame">重新開始會失去目前這一局（首版不存檔），成長、工具與資源全部重置。</p>
        <button type="button" class="danger" data-cmd="confirmNewGame" data-autofocus>確認重新開始</button>
        <button type="button" data-cmd="cancelNewGame">取消（Esc）</button>
      </div>`
    : '';
  return `<header><div class="titlebar"><h1>AI 工程接案遊戲 <small>規則 ${e(vm.view.ruleVersion)}</small></h1>${restart}</div>${auditBanner(vm)}${confirm}</header>`;
}

function statusBar(view) {
  const left = RULES.totalTurns - view.turn + 1;
  const crashAt = RULES.stress.crashAt;
  const risk = view.stress >= crashAt - 3 ? '<span class="risk high">⚠ 接近崩潰</span>' : '';
  const nextXp = RULES.xp.thresholds.find((t) => view.xp < t);
  return `<dl class="status" aria-label="目前狀態">
    <div><dt>時間</dt><dd>回合 ${view.turn}／${RULES.totalTurns}（含本回合剩 ${left} 回合）</dd></div>
    <div><dt>Token</dt><dd>${view.token}／${RULES.token.cap}</dd></div>
    <div><dt>壓力</dt><dd>${view.stress}（≥${crashAt} 崩潰）${risk}</dd></div>
    <div><dt>分數</dt><dd>${view.score}</dd></div>
    <div><dt>經驗</dt><dd>XP ${view.xp}／Lv${view.level}${nextXp ? `（下一級 ${nextXp}）` : '（已封頂）'}</dd></div>
    <div><dt>能力</dt><dd>A${view.attributes.A}／E${view.attributes.E}／V${view.attributes.V}</dd></div>
    <div><dt>工具</dt><dd>${e(toolsText(view.equipped))}</dd></div>
  </dl>`;
}

function sidebar(ui) {
  const rows = CLI_ROWS.map((r) => `<article class="cli-row">
      <h4><code>${e(r.command)}</code></h4>
      <p><strong>真實用途：</strong>${e(r.real)}</p>
      <p><strong>遊戲對照：</strong>${e(r.game)}</p>
      <p><strong>限制：</strong>${e(r.limit)}</p>
    </article>`).join('');
  const panel = ui.sidebarOpen
    ? `<div id="cli-panel" class="cli-panel">
        <p class="hint">查核日期 ${CLI_CHECKED_DATE}。${e(CLI_NOTE)}</p>
        ${rows}
        <p class="hint">${e(CLI_BOUNDARY)}各版本與平台可能不同。旁欄只供學習，不影響任何遊戲數值。</p>
      </div>`
    : '';
  return `<aside class="sidebar" aria-label="Claude Code 教學旁欄">
    <button type="button" data-cmd="toggleSidebar" aria-expanded="${ui.sidebarOpen}" aria-controls="cli-panel" data-key="sidebar">${ui.sidebarOpen ? '收起' : '展開'} Claude Code 教學旁欄</button>
    ${panel}
  </aside>`;
}

// ---- 角色建立 ----

function renderSetup(ui) {
  const a = ui.setup;
  const sum = a.A + a.E + a.V;
  const problem = validateAttributes(a);
  const templates = Object.entries(RULES.templates).map(([key, t]) => {
    const pressed = ui.setupTemplate === key && t.A === a.A && t.E === a.E && t.V === a.V;
    return `<button type="button" data-cmd="template" data-template="${e(key)}" aria-pressed="${pressed}" data-key="tpl-${e(key)}">${e(t.name)}（A${t.A}／E${t.E}／V${t.V}）</button>`;
  }).join('');
  const field = (k, label) => `<label class="attr">${e(label)} ${k}
      <input type="number" inputmode="numeric" min="${RULES.attributes.min}" max="${RULES.attributes.max}" value="${a[k]}" data-cmd="setAttr" data-attr="${k}" data-key="attr-${k}">
    </label>`;
  const remaining = RULES.attributes.total - sum;
  return `<section class="screen" aria-labelledby="h-screen">
    <h2 id="h-screen" tabindex="-1">角色建立</h2>
    <p class="goal">目標：在 ${RULES.totalTurns} 回合內接案、交付作品累積分數；三個專案各自有工期，壓力達 ${RULES.stress.crashAt} 立即崩潰。</p>
    <p>每項能力 ${RULES.attributes.min}–${RULES.attributes.max}，三項總和 ${RULES.attributes.total}。模板只是快捷鍵，沒有額外點數或被動。</p>
    <div class="templates" role="group" aria-label="快速模板">${templates}</div>
    <fieldset class="attrs"><legend>自由配點</legend>
      ${field('A', '分析')}${field('E', '實作')}${field('V', '驗證')}
      <p class="remaining">${remaining > 0 ? `剩餘可分配 ${remaining} 點` : remaining < 0 ? `超出 ${-remaining} 點` : '點數已分配完'}</p>
    </fieldset>
    ${problem ? `<p class="invalid" role="status">⚠ 不能開局：${e(problem)}</p>` : ''}
    <button type="button" class="primary" data-cmd="startGame"${problem ? ' disabled aria-disabled="true"' : ''} data-key="start">確認配點並抽工具</button>
  </section>`;
}

// ---- 開局抽 4 選 2 ----

function renderOpening(vm, ui) {
  const pick = ui.draftPick;
  const cards = vm.view.pendingDraft.candidates.map((c) => {
    const checked = pick.includes(c.id);
    const disabled = !checked && pick.length >= RULES.draft.openingPick;
    return `<label class="card${checked ? ' selected' : ''}" data-card="${e(c.id)}">
      <input type="checkbox" data-cmd="pickOpening" data-card-id="${e(c.id)}" data-key="pick-${e(c.id)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
      ${cardDetail(c.id)}
    </label>`;
  }).join('');
  const ready = pick.length === RULES.draft.openingPick;
  return `<section class="screen" aria-labelledby="h-screen">
    <h2 id="h-screen" tabindex="-1">開局抽卡：4 選 ${RULES.draft.openingPick}</h2>
    <p>候選已固定，重繪或返回此畫面不會重抽。開局皆為 L1，最多 ${RULES.slots} 個工具槽。</p>
    ${designatedNote(vm.view.pendingDraft)}
    <div class="cards">${cards}</div>
    <p class="remaining">已選 ${pick.length}／${RULES.draft.openingPick}</p>
    <button type="button" class="primary" data-cmd="confirmOpening"${ready ? '' : ' disabled aria-disabled="true"'} data-key="confirm-opening">確認這 ${RULES.draft.openingPick} 張</button>
  </section>`;
}

// ---- 回合畫面 ----

function projectsPanel(vm) {
  const { view } = vm;
  const left = RULES.totalTurns - view.turn + 1;
  const rows = Object.values(view.projects).map((p) => {
    const def = RULES.projects[p.projectId];
    const name = projectLabel(p.projectId);
    let body = `<strong>${e(name)}</strong>：難度 D${def.difficulty}、需要進度 ${def.target}、工期 ${def.duration} 行動、報酬 Token ${def.rewardToken}／分數 ${def.rewardScore}
      <br><span class="tag">狀態：${e(statusText(p.status))}</span>`;
    if (p.status === 'unaccepted') {
      body += left < def.duration
        ? `<br><span class="warn">⚠ ${e(name)}：剩餘 ${left} 回合少於工期 ${def.duration}，第 ${RULES.totalTurns} 回合結束前未交付就不計分</span>`
        : `<br><span class="hint">${e(name)}：工期 ${def.duration} 行動，本局剩 ${left} 回合</span>`;
    }
    if (p.status === 'active') {
      body += `<br>進度 ${p.progress}／${def.target}｜已知缺陷 ${p.knownDefects}｜準備 B${p.preparationBonus}／N${p.preparationUses}｜剩餘工期 ${def.duration - p.age} 行動（含本回合）
        <br><span class="unknown">❓ ${e(view.unknownRiskNotice)}</span>${auditProject(vm, p.projectId)}`;
    }
    if (p.status === 'expired' || p.status === 'abandoned') body += `<br><span class="hint">進度停在 ${p.progress}／${def.target}，不能重接</span>`;
    return `<li class="project status-${p.status}">${body}</li>`;
  }).join('');
  return `<section aria-labelledby="h-projects"><h3 id="h-projects">專案（一次一案，每案只能接一次）</h3><ul class="projects">${rows}</ul>
    <p class="hint">難度越高，工期越長；工期仍受整局剩餘回合限制。</p></section>`;
}

function windowPanel(vm, ui) {
  const { view } = vm;
  if (view.phase !== 'turnStart') return '';
  const w = view.turnWindow;
  const buttons = [];
  if (!w.accepted && !w.abandoned) buttons.push('<button type="button" data-cmd="askSettle" data-key="settle">提前結算</button>');
  if (view.activeProject && !w.accepted) buttons.push(`<button type="button" class="danger" data-cmd="abandon" data-key="abandon">放棄 ${e(projectLabel(view.activeProject))}（壓力 +${RULES.abandonStress}）</button>`);
  if (!view.activeProject) {
    for (const p of Object.values(view.projects)) {
      if (p.status === 'unaccepted') buttons.push(`<button type="button" data-cmd="accept" data-project="${e(p.projectId)}" data-key="accept-${e(p.projectId)}">接 ${e(projectLabel(p.projectId))}</button>`);
    }
  }
  const allDone = Object.values(view.projects).every((p) => p.status !== 'unaccepted' && p.status !== 'active');
  let confirm = '';
  if (ui.confirmSettle) {
    const pending = Object.values(view.projects).filter((p) => p.status === 'active')
      .map((p) => `<li>${e(projectLabel(p.projectId))}：進度 ${p.progress}／${RULES.projects[p.projectId].target}${p.progress >= RULES.projects[p.projectId].target ? '（已達標但未交付）' : ''}</li>`).join('');
    confirm = `<div class="confirm" role="alertdialog" aria-labelledby="h-settle">
      <h4 id="h-settle">確認提前結算？</h4>
      <p>只計已交付分數（目前 ${view.score} 分）；未交付案不會自動交付、不計分，也不兌換剩餘回合。</p>
      ${pending ? `<ul>${pending}</ul>` : ''}
      <button type="button" class="danger" data-cmd="earlySettle" data-autofocus>確認提前結算</button>
      <button type="button" data-cmd="cancelSettle">取消（Esc）</button>
    </div>`;
  }
  return `<section aria-labelledby="h-window"><h3 id="h-window">回合開始</h3>
    <p class="hint">順序：提前結算 → 放棄 → 接案；接案後本回合不能再放棄。也可以直接選行動。</p>
    ${allDone ? '<p class="hint">三案都已結束，可以提前結算，不必空轉。</p>' : ''}
    <div class="buttons">${buttons.join('')}</div>${confirm}</section>`;
}

function actionsPanel(vm) {
  const buttons = vm.legal.map(({ action, legal, reason }) => {
    const name = RULES.actions[action].name;
    return `<li><button type="button" data-cmd="openPreview" data-action="${action}" aria-disabled="${!legal}" data-key="act-${action}">${legal ? '' : '✕ '}${e(name)}</button>${legal ? '' : `<span class="reason">${e(reason.message)}</span>`}</li>`;
  }).join('');
  return `<section aria-labelledby="h-actions"><h3 id="h-actions">主要行動（每回合一個）</h3><ul class="actions">${buttons}</ul></section>`;
}

function signed(n) {
  return n >= 0 ? `+${n}` : `−${-n}`;
}

function previewPanel(vm, ui) {
  const pv = vm.preview;
  if (!pv) return '';
  const toggles = Object.keys(pv.toggles).filter((id) => vm.view.equipped.some((c) => c.id === id)).map((id) => {
    const lv = vm.view.equipped.find((c) => c.id === id).level;
    return `<label class="toggle"><input type="checkbox" data-cmd="toggle" data-card="${id}" data-key="toggle-${id}"${pv.toggles[id] ? ' checked' : ''}> 開啟 ${e(cardLabel(id, lv))}：${e(RULES.cards[id].levels[lv - 1])}</label>`;
  }).join('');
  const costLine = pv.costParts.map((x) => `${x.label} ${signed(x.delta)}`).join('，');
  const pLines = pv.pDetail?.steps?.length
    ? `<li>成功率：${e(pv.pDetail.steps.map((x) => `${x.label} ${signed(x.delta)}`).join('，'))} ＝ ${pv.pDetail.raw} → 截斷 20–95 得 ${pv.pDetail.general}${e(pv.pDetail.post.map((x) => `；${x.label} ${signed(x.delta)}`).join(''))} → 最終 ${pv.p}%</li>`
    : '';
  const qLine = pv.q === null ? '' : `<li>缺陷風險 q：${e(pv.qParts.map((x) => `${x.label} ${signed(x.delta)}`).join('，'))} → 截斷 5–60 得 ${pv.q}%（另擲秘密骰判定，結果不公開）</li>`;
  const warnings = pv.warnings.map((w) => `<li>⚠ ${e(w)}</li>`).join('');
  const busy = ui.submitting;
  return `<section class="preview" aria-labelledby="h-preview" data-preview-cost="${pv.cost ?? ''}" data-preview-p="${pv.p ?? ''}" data-preview-q="${pv.q ?? ''}">
    <h3 id="h-preview" tabindex="-1">預覽：${e(RULES.actions[pv.action].name)}</h3>
    <p class="summary">${e(pv.summary)}</p>
    ${toggles ? `<div class="toggles">${toggles}</div>` : ''}
    ${warnings ? `<ul class="warnings">${warnings}</ul>` : ''}
    <details><summary>展開算式</summary><ul>
      <li>費用：${e(costLine)} → ${pv.cost} Token（目前 ${vm.view.token}）</li>${pLines}${qLine}
    </ul></details>
    ${pv.legal ? '' : `<p class="invalid" role="status">✕ 不能執行：${e(pv.reason.message)}</p>`}
    <div class="buttons">
      <button type="button" class="primary" data-cmd="confirmAction" data-key="confirm-action"${pv.legal && !busy ? ' data-autofocus' : ' disabled aria-disabled="true"'}>${busy ? '處理中…' : '確認執行'}</button>
      <button type="button" data-cmd="cancelPreview" data-key="cancel-preview"${pv.legal ? '' : ' data-autofocus'}>取消（Esc）</button>
    </div>
  </section>`;
}

function resultPanel(vm) {
  const events = vm.view.events;
  const last = events.at(-1);
  const recent = events.slice(-8, -1).reverse().map((ev) => `<li>#${ev.seq} ${e(formatEvent(ev))}${auditEventLine(vm, ev.seq)}</li>`).join('');
  return `<section aria-labelledby="h-result"><h3 id="h-result">結果</h3>
    <p id="result" class="result" aria-live="polite" tabindex="-1">${last ? `#${last.seq} ${e(formatEvent(last))}${auditEventLine(vm, last.seq)}` : '尚無'}</p>
    ${recent ? `<details><summary>較早紀錄</summary><ul class="log">${recent}</ul></details>` : ''}</section>`;
}

function exportBlock(vm) {
  if (vm.view.phase !== 'ended' && !vm.audit) return '';
  return `<p><button type="button" data-cmd="exportLog" data-key="export">匯出紀錄（JSON）</button>
    <span class="hint">匯出檔含隱藏缺陷與秘密骰（稽核層級），可用於重播核對。</span></p>`;
}

function renderTurn(vm, ui) {
  return `<section class="screen" aria-labelledby="h-screen">
    <h2 id="h-screen" tabindex="-1">第 ${vm.view.turn} 回合</h2>
    ${statusBar(vm.view)}
    <div class="columns">
      <div>${projectsPanel(vm)}${windowPanel(vm, ui)}${actionsPanel(vm)}</div>
      <div>${previewPanel(vm, ui)}${resultPanel(vm)}${exportBlock(vm)}</div>
    </div>
  </section>`;
}

// ---- 升級抽選 ----

function renderLevelDraft(vm, ui) {
  const { view } = vm;
  const full = view.equipped.length >= RULES.slots;
  const options = view.pendingDraft.candidates.map((c) => {
    const label = c.kind === 'upgrade' ? `現有工具升級：${c.id} L1→L2` : `新工具：${c.id} L1`;
    const effect = RULES.cards[c.id].levels[c.level - 1];
    return `<label class="card${ui.draftChoice === c.id ? ' selected' : ''}">
      <input type="radio" name="draft" data-cmd="pickDraft" data-card-id="${e(c.id)}" data-key="draft-${e(c.id)}"${ui.draftChoice === c.id ? ' checked' : ''}>
      <span class="card-name">${e(label)}（${e(RULES.cards[c.id].name)}）</span><span class="card-level">${e(effect)}</span><span class="fiction">${e(FICTION)}</span>
    </label>`;
  }).join('');
  const chosen = view.pendingDraft.candidates.find((c) => c.id === ui.draftChoice);
  let replace = '';
  if (chosen && chosen.kind === 'new' && full) {
    const opts = view.equipped.map((c) => `<label class="replace"><input type="radio" name="replace" data-cmd="pickReplace" data-card-id="${e(c.id)}" data-key="replace-${e(c.id)}"${ui.replace === c.id ? ' checked' : ''}>
      將失去 ${e(cardLabel(c.id, c.level))}（${e(RULES.cards[c.id].levels[c.level - 1])}），將得到 ${e(cardLabel(chosen.id, 1))}（${e(RULES.cards[chosen.id].levels[0])}）</label>`).join('');
    replace = `<fieldset><legend>工具槽已滿：選一張替換（被換掉的卡效果立即移除，之後再抽到時為 L1）</legend>${opts}</fieldset>`;
  }
  const ready = chosen && (chosen.kind === 'upgrade' || !full || ui.replace);
  return `<section class="screen" aria-labelledby="h-screen">
    <h2 id="h-screen" tabindex="-1">升級抽選（Lv${view.level}）：3 選 1</h2>
    ${statusBar(view)}
    <p>升級不補資源、不加能力，只能選一個工具獎勵或放棄。候選已固定，不會重抽。</p>
    ${designatedNote(view.pendingDraft)}
    <div class="cards">${options}</div>${replace}
    <div class="buttons">
      <button type="button" class="primary" data-cmd="confirmDraft" data-key="confirm-draft"${ready ? '' : ' disabled aria-disabled="true"'}>確認選擇</button>
      <button type="button" data-cmd="forfeitDraft" data-key="forfeit-draft">放棄本次獎勵</button>
    </div>
    ${resultPanel(vm)}
  </section>`;
}

// ---- 整局結算 ----

function endReasonText(view) {
  if (view.endReason === 'deadline') return `第 ${view.turn} 回合期限結算`;
  if (view.endReason === 'earlySettle') return `第 ${view.turn} 回合開始時提前結算`;
  return `第 ${view.turn} 回合壓力達 ${view.stress}，崩潰（失敗結局）`;
}

function renderSettlement(vm) {
  const { view } = vm;
  const sum = settlementSummary(view);
  const delivered = sum.delivered.map((d) => `<li>${e(projectLabel(d.projectId))}：分數 +${d.score}（第 ${d.turn} 回合交付）</li>`).join('') || '<li>（沒有交付作品）</li>';
  const failed = [
    ...sum.notDelivered.map((p) => `<li>${e(projectLabel(p.projectId))}：${p.status === 'active' ? '未交付' : e(statusText(p.status))}（進度 ${p.progress}／${p.target}，不計分）</li>`),
    ...sum.unaccepted.map((id) => `<li>${e(projectLabel(id))}：未接</li>`),
  ].join('');
  const keys = sum.keyChoices.map((k) => `<li>${e(k.text)}</li>`).join('') || '<li>（本局沒有可引用的關鍵事件）</li>';
  const all = view.events.map((ev) => `<li>#${ev.seq} ${e(formatEvent(ev))}${auditEventLine(vm, ev.seq)}</li>`).join('');
  const f = sum.final;
  return `<section class="screen" aria-labelledby="h-screen">
    <h2 id="h-screen" tabindex="-1">整局結算</h2>
    <p class="ending">結局：${e(sum.ending.name)}</p>
    <p>${e(endReasonText(view))}；總分 ${sum.score}。分數只計已交付作品。</p>
    <div class="columns">
      <div>
        <h3>交付作品</h3><ul class="summary-list">${delivered}</ul>
        <h3>失敗、放棄或未交付</h3><ul class="summary-list">${failed || '<li>（無）</li>'}</ul>
        <h3>關鍵選擇（可在事件紀錄中查到）</h3><ul class="summary-list">${keys}</ul>
      </div>
      <div>
        <h3>最終狀態</h3>
        <dl class="status">
          <div><dt>能力</dt><dd>A${f.attributes.A}／E${f.attributes.E}／V${f.attributes.V}</dd></div>
          <div><dt>工具</dt><dd>${e(toolsText(f.equipped))}</dd></div>
          <div><dt>資源</dt><dd>Token ${f.token}、壓力 ${f.stress}</dd></div>
          <div><dt>成長</dt><dd>XP ${f.xp}／Lv${f.level}</dd></div>
        </dl>
        ${exportBlock(vm)}
        <details><summary>全部事件紀錄（${view.events.length} 筆）</summary><ol class="log">${all}</ol></details>
        <button type="button" class="primary" data-cmd="askNewGame" data-key="new-game">開始新局</button>
      </div>
    </div>
  </section>`;
}

export function renderApp(vm, ui) {
  const phase = vm.view.phase;
  let body;
  if (phase === 'characterSetup') body = renderSetup(ui);
  else if (phase === 'openingDraft') body = renderOpening(vm, ui);
  else if (phase === 'levelDraft') body = renderLevelDraft(vm, ui);
  else if (phase === 'ended') body = renderSettlement(vm);
  else body = renderTurn(vm, ui);
  return `${header(vm, ui)}${message(ui)}<main class="layout">${body}${sidebar(ui)}</main>`;
}
