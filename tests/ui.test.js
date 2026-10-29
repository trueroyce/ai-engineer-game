// 完整第一版 UI：純函式渲染（HTML 字串）、session 與 controller 行為。真實瀏覽器操作另見 tests/browser/。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/ui/session.js';
import { renderApp, initialUi } from '../src/ui/render.js';
import { createController } from '../src/ui/controller.js';
import { formatEvent } from '../src/ui/text.js';
import { previewAction } from '../src/core/engine.js';
import { replay } from '../src/core/log.js';
import { injected } from './helpers.js';

const CARD = [['C1', 'C2', 'C5', 'C4'], ['C4', 'C5', 'C1'], ['C1', 'C3', 'C6'], ['C3', 'C6', 'C1']];
function session({ success = [], defect = [], card = CARD } = {}) {
  return new GameSession({ createOptions: { gameId: 'ui', rng: injected({ success, defect, card }) } });
}
function toTurn(s) {
  assert.equal(s.submit('setAttributes', { template: 'balanced' }).ok, true);
  assert.equal(s.submit('chooseOpening', { cardIds: ['C5', 'C2'] }).ok, true);
  return s;
}
const html = (s, ui = initialUi(), opts = {}) => renderApp(s.viewModel(ui, opts), ui);
function controller(opts = {}) {
  let n = 0;
  return createController({ session: session(opts), newOperationId: () => `op-${++n}`, audit: opts.audit ?? false });
}

test('5.1 完整版不再顯示單案切片限制', () => {
  const s = session();
  for (const step of [() => {}, () => s.submit('setAttributes', { template: 'balanced' }), () => s.submit('chooseOpening', { cardIds: ['C5', 'C2'] })]) {
    step();
    const out = html(s);
    assert.doesNotMatch(out, /單案切片|本切片|開發里程碑/);
  }
});

test('角色建立：先看到遊戲目標與期限；四模板一鍵套用；非法配置顯示原因且不能開局', () => {
  const s = session();
  const ui = initialUi();
  let out = renderApp(s.viewModel(ui), ui);
  assert.match(out, /18 回合/);
  assert.match(out, /壓力達 10 立即崩潰/);
  for (const name of ['均衡工程師', '需求分析型', '衝刺實作型', '品質驗證型']) assert.ok(out.includes(name), name);
  assert.match(out, /data-cmd="template" data-template="analyst"/);
  ui.setup = { A: 3, E: 3, V: 1 };
  out = renderApp(s.viewModel(ui), ui);
  assert.match(out, /三項總和必須為 6，目前為 7/);
  assert.match(out, /data-cmd="startGame"[^>]*disabled/);
  ui.setup = { A: 1, E: 2, V: 2 };
  assert.match(renderApp(s.viewModel(ui), ui), /剩餘可分配 1 點/);
  ui.setup = { A: 1, E: 2, V: 3 };
  assert.doesNotMatch(renderApp(s.viewModel(ui), ui), /data-cmd="startGame"[^>]*disabled/);
});

test('開局選卡：4 張候選含 L1/L2 效果與代價、虛構標示；選滿 2 張才可確認；重繪不重抽', () => {
  const s = session();
  s.submit('setAttributes', { template: 'balanced' });
  const ui = initialUi();
  const out = renderApp(s.viewModel(ui), ui);
  for (const id of ['C1', 'C2', 'C5', 'C4']) assert.match(out, new RegExp(`data-card="${id}"`));
  assert.ok(out.includes('遊戲虛構工具，不代表真實 Claude Code 功能'));
  assert.ok(out.includes('L1：') && out.includes('L2：'));
  assert.match(out, /data-cmd="confirmOpening"[^>]*disabled/);
  ui.draftPick = ['C5', 'C2'];
  assert.doesNotMatch(renderApp(s.viewModel(ui), ui), /data-cmd="confirmOpening"[^>]*disabled/);
  assert.equal(html(s), html(s));
  assert.equal(s.state.rng.card.cursor, 1);
});

test('5.1 三案都公開且可接：J1／J2／J3 皆有接案鈕，可依任意順序接', () => {
  const s = toTurn(session());
  const out = html(s);
  for (const id of ['J1', 'J2', 'J3']) assert.match(out, new RegExp(`data-cmd="accept" data-project="${id}"`));
  assert.ok(out.includes('回合 1／18'));
  assert.equal(s.submit('accept', { projectId: 'J3' }).ok, true);
  assert.equal(s.state.activeProject, 'J3');
});

test('5.1 工期剩餘提示：剩餘回合少於工期時警告；高難度案提醒總回合限制', () => {
  const s = toTurn(session());
  s.state.turn = 12;
  const out = html(s);
  assert.ok(out.includes('J3 Agent原型：剩餘 7 回合少於工期 10'), out.match(/剩餘[^<]*/g)?.join(' | '));
  assert.ok(out.includes('J1 待辦工具：工期 6 行動，本局剩 7 回合'));
  s.state.turn = 1;
  assert.match(html(s), /難度越高，工期越長；工期仍受整局剩餘回合限制/);
});

test('5.1 放棄與逾期：已放棄／逾期案標示狀態且沒有接案鈕；三案皆終止時提示可提前結算', () => {
  const s = toTurn(session());
  for (const id of ['J1', 'J2', 'J3']) s.state.projects[id].status = id === 'J1' ? 'delivered' : id === 'J2' ? 'expired' : 'abandoned';
  const out = html(s);
  assert.doesNotMatch(out, /data-cmd="accept"/);
  assert.ok(out.includes('狀態：已交付') && out.includes('狀態：逾期') && out.includes('狀態：已放棄'));
  assert.ok(out.includes('三案都已結束，可以提前結算，不必空轉'));
});

test('預覽：數字與 previewAction 一致；C2 開關即時更新；取消不改狀態；一句話摘要＋可展開算式', () => {
  const s = toTurn(session({ success: [1], defect: [100] }));
  s.submit('accept', { projectId: 'J1' });
  const ui = initialUi();
  ui.preview = { action: 'rush', toggles: { C2: false }, operationId: 'preview-1' };
  let out = renderApp(s.viewModel(ui), ui);
  const pv = previewAction(s.state, { action: 'rush', toggles: { C2: false } });
  assert.ok(out.includes(pv.summary));
  assert.match(out, new RegExp(`data-preview-cost="${pv.cost}"`));
  assert.match(out, new RegExp(`data-preview-p="${pv.p}"`));
  assert.match(out, new RegExp(`data-preview-q="${pv.q}"`));
  assert.match(out, /<details/);
  ui.preview.toggles = { C2: true };
  out = renderApp(s.viewModel(ui), ui);
  const pv2 = previewAction(s.state, { action: 'rush', toggles: { C2: true } });
  assert.match(out, new RegExp(`data-preview-cost="${pv2.cost}"`));
  assert.notEqual(pv.cost, pv2.cost);
  const before = structuredClone(s.state);
  ui.preview = null;
  renderApp(s.viewModel(ui), ui);
  assert.deepEqual(s.state, before);
  assert.match(html(s), /data-action="repair"[^>]*aria-disabled="true"/);
  assert.ok(html(s).includes('沒有已知缺陷可修復'));
});

test('C3 開關只在持有 C3 且為驗證時出現', () => {
  const s = toTurn(session());
  s.submit('accept', { projectId: 'J1' });
  const ui = initialUi();
  ui.preview = { action: 'verify', toggles: {}, operationId: 'p' };
  assert.doesNotMatch(renderApp(s.viewModel(ui), ui), /data-card="C3"/);
  s.state.equipped = [{ id: 'C3', level: 1 }];
  s.state.projects.J1.progress = 1;
  assert.match(renderApp(s.viewModel(ui), ui), /data-cmd="toggle" data-card="C3"/);
});

test('R05 玩家介面不洩漏 H：H=0 與 H=2 的渲染完全相同', () => {
  const a = toTurn(session({ success: [1], defect: [1] }));
  const b = toTurn(session({ success: [1], defect: [100] }));
  for (const s of [a, b]) {
    s.submit('accept', { projectId: 'J1' });
    assert.equal(s.submit('action', { action: 'implement', toggles: {} }).ok, true);
  }
  assert.equal(a.state.projects.J1.hiddenDefects, 1);
  assert.equal(b.state.projects.J1.hiddenDefects, 0);
  assert.equal(html(a), html(b));
  assert.doesNotMatch(html(a), /hiddenDefects|稽核|秘密骰 h/);
  assert.ok(html(a).includes('可能仍有未發現問題'));
});

test('結果回饋文字：公開骰與 p、成敗、前後變化、里程碑；退件只說未通過；沒有重複句號', () => {
  const s = toTurn(session({ success: [23], defect: [100] }));
  s.submit('accept', { projectId: 'J1' });
  s.state.projects.J1.preparationBonus = 10;
  s.state.projects.J1.preparationUses = 1;
  s.submit('action', { action: 'implement', toggles: {} });
  const text = formatEvent(s.viewModel(initialUi()).view.events.at(-1));
  assert.match(text, /骰 23 ≤ 80 成功，進度 \+2/);
  assert.match(text, /Token 18→15/);
  assert.match(text, /半程 XP \+1/);
  const r = toTurn(session());
  r.submit('accept', { projectId: 'J1' });
  Object.assign(r.state.projects.J1, { progress: 4, hiddenDefects: 2 });
  r.submit('action', { action: 'deliver', toggles: {} });
  const t2 = formatEvent(r.viewModel(initialUi()).view.events.at(-1));
  assert.match(t2, /驗收未通過，仍有未定位問題/);
  assert.doesNotMatch(t2, /2 個|。。/);
});

test('5.5 升級抽選：標示新工具／現有工具升級；滿槽選新卡顯示失去與得到並須指定替換；可放棄', () => {
  const s = toTurn(session({ success: [1, 1, 1], defect: [100, 100] }));
  s.state.equipped = [{ id: 'C5', level: 1 }, { id: 'C2', level: 1 }, { id: 'C6', level: 1 }];
  s.submit('accept', { projectId: 'J1' });
  s.submit('action', { action: 'implement', toggles: {} });
  s.submit('action', { action: 'implement', toggles: {} });
  s.submit('action', { action: 'verify', toggles: {} });
  const ui = initialUi();
  let out = renderApp(s.viewModel(ui), ui);
  assert.ok(out.includes('升級抽選'));
  assert.ok(out.includes('現有工具升級：C5 L1→L2'));
  assert.ok(out.includes('新工具：C4 L1'));
  assert.match(out, /data-cmd="forfeitDraft"/);
  ui.draftChoice = 'C4';
  out = renderApp(s.viewModel(ui), ui);
  assert.ok(out.includes('工具槽已滿'));
  assert.match(out, /將失去 C5 節奏管理 L1[^<]*將得到 C4 除錯手冊 L1/);
  assert.match(out, /data-cmd="confirmDraft"[^>]*disabled/);
  ui.replace = 'C6';
  assert.doesNotMatch(renderApp(s.viewModel(ui), ui), /data-cmd="confirmDraft"[^>]*disabled/);
});

test('5.6 提前結算確認：列出未交付案（含 P 已滿者），說明不自動交付', () => {
  const s = toTurn(session());
  s.submit('accept', { projectId: 'J1' });
  s.state.phase = 'turnStart';
  s.state.turnWindow = { accepted: false, abandoned: false };
  s.state.projects.J1.progress = 4;
  const ui = initialUi();
  ui.confirmSettle = true;
  const out = renderApp(s.viewModel(ui), ui);
  assert.ok(out.includes('確認提前結算？'));
  assert.ok(out.includes('J1 待辦工具：進度 4／4（已達標但未交付）'));
  assert.ok(out.includes('未交付案不會自動交付、不計分'));
});

function finishCareful() {
  // careful_revised 前 6 回合後提前結算：交付 J1 → 2 分
  const c = controller({ success: [76, 23, 93, 10, 40], defect: [55, 49, 100], card: [['C1', 'C2', 'C5', 'C4'], ['C4', 'C5', 'C1']] });
  const s = c.session;
  toTurn(s);
  s.submit('accept', { projectId: 'J1' });
  for (const a of ['analyze', 'implement', 'implement', 'implement', 'verify']) s.submit('action', { action: a, toggles: {} });
  s.submit('chooseDraft', { choice: { type: 'take', cardId: 'C5' } });
  s.submit('action', { action: 'deliver', toggles: {} });
  s.submit('earlySettle');
  return c;
}

test('5.7 整局結算畫面：結局、交付作品與分數、未交付案、最終能力／工具／資源、兩個附事件序號的關鍵選擇、匯出', () => {
  const c = finishCareful();
  const out = c.html();
  assert.ok(out.includes('整局結算'));
  assert.ok(out.includes('結局：初階接案'));
  assert.ok(out.includes('提前結算'));
  assert.match(out, /J1 待辦工具：分數 \+2（第 6 回合交付）/);
  assert.ok(out.includes('J2 資料整合：未接') && out.includes('J3 Agent原型：未接'));
  assert.match(out, /A2／E2／V2/);
  assert.ok(out.includes('C5 節奏管理 L2'));
  assert.match(out, /關鍵選擇[\s\S]*#\d+ 第 6 回合交付 J1 待辦工具，分數 \+2/);
  assert.match(out, /#\d+ 第 5 回合升級：C5 升為 L2/);
  assert.match(out, /data-cmd="exportLog"/);
  assert.ok(out.includes('匯出檔含隱藏缺陷與秘密骰'));
  assert.match(out, /data-cmd="askNewGame"|data-cmd="confirmNewGame"/);
});

test('5.7 匯出 JSON：controller 匯出的檔案可由 replay 重建相同最終狀態', () => {
  const c = finishCareful();
  const out = c.dispatch('exportLog');
  assert.match(out.download.filename, /^aieg-ui-audit-log\.json$/);
  const log = JSON.parse(out.download.text);
  assert.deepEqual(replay(log), c.session.state);
});

test('5.6 崩潰與期限結算畫面', () => {
  const crash = controller({ success: [100, 100, 100, 100], defect: [1, 1, 1, 1] });
  toTurn(crash.session);
  crash.session.submit('accept', { projectId: 'J1' });
  for (let i = 0; i < 4; i++) crash.session.submit('action', { action: 'rush', toggles: {} });
  crash.session.submit('action', { action: 'deliver', toggles: {} });
  crash.session.submit('action', { action: 'deliver', toggles: {} });
  assert.ok(crash.html().includes('結局：壓力崩潰'));
  assert.ok(crash.html().includes('J1 待辦工具：未交付'));
  const dl = controller();
  toTurn(dl.session);
  for (let i = 0; i < 18; i++) dl.session.submit('action', { action: 'rest', toggles: {} });
  assert.ok(dl.html().includes('結局：交件落空'));
  assert.ok(dl.html().includes('第 18 回合期限結算'));
});

test('5.8 離開警告：開局前不警告、進行中警告、結束後不警告；重新開始需確認', () => {
  const c = controller();
  assert.equal(c.shouldWarnBeforeUnload(), false);
  toTurn(c.session);
  assert.equal(c.shouldWarnBeforeUnload(), true);
  c.dispatch('askNewGame');
  assert.match(c.html(), /重新開始會失去目前這一局/);
  c.dispatch('cancelNewGame');
  assert.equal(c.session.state.phase, 'turnStart');
  c.dispatch('askNewGame');
  c.dispatch('confirmNewGame');
  assert.equal(c.session.state.phase, 'characterSetup');
  assert.deepEqual([c.session.state.token, c.session.state.xp, c.session.state.equipped.length], [18, 0, 0]);
  const ended = finishCareful();
  assert.equal(ended.shouldWarnBeforeUnload(), false);
});

test('6.3 防重送：同一預覽連按確認只結算一次；每次重新開啟預覽產生新 operationId；提交中確認鈕停用', () => {
  const c = controller({ success: [1, 1], defect: [100, 100] });
  toTurn(c.session);
  c.session.submit('accept', { projectId: 'J1' });
  c.dispatch('openPreview', { action: 'implement' });
  const pending = { ...c.ui.preview };
  c.dispatch('confirmAction');
  c.ui.preview = pending; // 模擬第二次點擊仍帶著同一預覽
  c.dispatch('confirmAction');
  assert.equal(c.session.state.events.filter((e) => e.type === 'action').length, 1);
  assert.equal(c.session.state.token, 15);
  c.dispatch('openPreview', { action: 'implement' });
  c.dispatch('confirmAction');
  const ids = c.session.state.events.filter((e) => e.type === 'action').map((e) => e.operationId);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  c.dispatch('openPreview', { action: 'rest' });
  c.ui.submitting = true;
  assert.match(c.html(), /data-cmd="confirmAction"[^>]*disabled/);
});

test('6.1 鍵盤：Esc 依序關閉預覽、提前結算確認、重新開始確認；結果區 aria-live；互動元素皆為原生 button／input', () => {
  const c = controller();
  toTurn(c.session);
  c.dispatch('openPreview', { action: 'rest' });
  assert.ok(c.ui.preview);
  c.dispatch('escape');
  assert.equal(c.ui.preview, null);
  c.dispatch('askSettle');
  c.dispatch('escape');
  assert.equal(c.ui.confirmSettle, false);
  c.dispatch('askNewGame');
  c.dispatch('escape');
  assert.equal(c.ui.confirmNewGame, false);
  const out = c.html();
  assert.match(out, /id="result"[^>]*aria-live="polite"/);
  const interactive = out.match(/<[a-z]+[^>]*data-cmd=/g);
  assert.ok(interactive.every((t) => /^<(button|input)/.test(t)), interactive.filter((t) => !/^<(button|input)/.test(t)).join(' '));
});

test('6.4 CLI 教學旁欄：開關不改引擎狀態；列五個指令的真實用途／遊戲對照／限制與查核日期', () => {
  const c = controller();
  toTurn(c.session);
  const before = structuredClone(c.session.state);
  assert.match(c.html(), /data-cmd="toggleSidebar"[^>]*aria-expanded="false"/);
  c.dispatch('toggleSidebar');
  const out = c.html();
  assert.match(out, /data-cmd="toggleSidebar"[^>]*aria-expanded="true"/);
  for (const cmd of ['/context', '/compact', '/clear', '/rename', '/resume']) assert.ok(out.includes(cmd), cmd);
  for (const h of ['真實用途', '遊戲對照', '限制']) assert.ok(out.includes(h), h);
  assert.ok(out.includes('2026-10-24'));
  assert.ok(out.includes('未在使用者電腦實跑'));
  assert.ok(out.includes('不冒充官方slash command'));
  c.dispatch('toggleSidebar');
  assert.deepEqual(c.session.state, before);
});

test('6.5 稽核模式：一般模式不顯示 H／秘密骰；稽核模式常駐標示並顯示 H 與秘密骰', () => {
  const normal = controller({ success: [1], defect: [1] });
  const audit = controller({ success: [1], defect: [1], audit: true });
  for (const c of [normal, audit]) {
    toTurn(c.session);
    c.session.submit('accept', { projectId: 'J1' });
    c.session.submit('action', { action: 'implement', toggles: {} });
  }
  const n = normal.html();
  const a = audit.html();
  assert.doesNotMatch(n, /稽核模式|隱藏缺陷 H=|秘密骰 h/);
  assert.match(a, /稽核模式：畫面顯示隱藏缺陷與秘密骰/);
  assert.match(a, /隱藏缺陷 H=1/);
  assert.match(a, /秘密骰 h1=1 ≤ q15 → 新增 1 個隱藏缺陷/);
  assert.match(a, /data-cmd="exportLog"/, '稽核模式進行中也可匯出');
  assert.doesNotMatch(n, /data-cmd="exportLog"/, '一般模式進行中不提供含秘密的匯出');
});

test('指定候選（測試注入）標為指定樣本；種子模式不顯示', () => {
  const s = session();
  s.submit('setAttributes', { template: 'balanced' });
  assert.ok(html(s).includes('指定候選樣本（測試注入），不是隨機抽中'));
  const r = new GameSession({ createOptions: { gameId: 'seeded', rng: { success: { seed: 1 }, defect: { seed: 2 }, card: { seed: 3 } } } });
  r.submit('setAttributes', { template: 'balanced' });
  assert.ok(!html(r).includes('指定候選樣本'));
});

test('session：每次提交不同 operationId 並帶目前 stateVersion；同 ID 重送回原結果', () => {
  const s = toTurn(session({ success: [1, 1], defect: [100, 100] }));
  const ids = s.state.log.requests.map((r) => r.operationId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(s.state.log.requests.map((r) => r.expectedStateVersion), [0, 1]);
  s.submit('accept', { projectId: 'J1' });
  const a = s.submit('action', { action: 'implement', toggles: {} }, 'confirm-xyz');
  const b = s.submit('action', { action: 'implement', toggles: {} }, 'confirm-xyz');
  assert.deepEqual(b, a);
  assert.equal(s.state.token, 15);
});

test('HTML 跳脫', async () => {
  const { escapeHtml } = await import('../src/ui/render.js');
  assert.equal(escapeHtml('<b>"x"&\''), '&lt;b&gt;&quot;x&quot;&amp;&#39;');
});

test('6.1 焦點：行動導致整局結束時，焦點目標是結算標題（結算畫面沒有結果區）', () => {
  const c = controller();
  toTurn(c.session);
  for (let i = 0; i < 17; i++) c.session.submit('action', { action: 'rest', toggles: {} });
  c.dispatch('openPreview', { action: 'rest' });
  const out = c.dispatch('confirmAction');
  assert.equal(c.session.state.phase, 'ended');
  assert.equal(out.focus, 'heading');
  assert.match(c.html(), /id="h-screen"[^>]*tabindex="-1"/);
});
