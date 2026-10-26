// 瀏覽器進入點：DOM 事件 → controller 指令 → 以純函式 renderApp 重繪，並處理焦點、下載與離開警告。
// 所有規則判定都在引擎；指令邏輯在 controller.js（可在 Node 測試）。
import { GameSession } from './session.js';
import { createController } from './controller.js';

const app = document.getElementById('app');
// 測試接縫：真實瀏覽器回歸可在載入前設定 window.__AIEG_TEST_CREATE_OPTIONS__ 注入固定骰序。
// 一般遊玩不設定，每局使用 crypto 隨機種子。
const createOptions = () => globalThis.__AIEG_TEST_CREATE_OPTIONS__ ?? {};
const audit = new URLSearchParams(location.search).get('audit') === '1';
const controller = createController({ session: new GameSession({ createOptions: createOptions() }), audit, createOptions });

function render(focus = null) {
  const activeKey = document.activeElement?.dataset?.key;
  app.innerHTML = controller.html();
  let target = null;
  if (focus === 'result') target = app.querySelector('#result');
  else if (focus === 'heading') target = app.querySelector('#h-screen');
  if (!target) target = app.querySelector('[data-autofocus]');
  if (!target && activeKey) target = app.querySelector(`[data-key="${CSS.escape(activeKey)}"]:not([disabled])`);
  if (!target && focus === 'preview') target = app.querySelector('#h-preview');
  target?.focus();
}

function download({ filename, text }) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function run(cmd, data) {
  const out = controller.dispatch(cmd, data);
  if (out.download) download(out.download);
  render(out.focus);
}

app.addEventListener('click', (event) => {
  const el = event.target.closest('button[data-cmd]');
  if (!el || el.disabled) return;
  if (el.getAttribute('aria-disabled') === 'true' && el.dataset.cmd !== 'openPreview') return;
  if (el.dataset.cmd === 'confirmAction') el.disabled = true; // 提交中立即停用，避免同一畫面重複觸發
  run(el.dataset.cmd, { ...el.dataset });
});

app.addEventListener('change', (event) => {
  const el = event.target.closest('input[data-cmd]');
  if (!el) return;
  run(el.dataset.cmd, { ...el.dataset, value: el.value, checked: el.checked });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') run('escape');
});

window.addEventListener('beforeunload', (event) => {
  if (!controller.shouldWarnBeforeUnload()) return;
  event.preventDefault();
  event.returnValue = '';
});

render();
