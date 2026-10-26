// UI 指令層（不碰 DOM）：把使用者操作轉成 session 提交並維護 UI 暫態，main.js 只負責 DOM 事件與焦點。
// 可在 Node 中測試；所有規則判定都在引擎。
import { RULES } from '../core/rules.js';
import { renderApp, initialUi } from './render.js';

export function createController({ session, newOperationId = () => globalThis.crypto.randomUUID(), audit = false, createOptions = () => ({}) }) {
  const c = { session, audit, ui: initialUi() };

  // 成功後的焦點目標；若這次提交讓整局結束，改為結算標題（結算畫面沒有結果區）。
  const afterSubmit = (result, focus = null) => {
    c.ui.message = result.ok ? null : result.error.message;
    if (!result.ok) return { focus: null };
    return { focus: session.state.phase === 'ended' ? 'heading' : focus };
  };

  const resetDraft = () => {
    c.ui.draftChoice = null;
    c.ui.replace = null;
  };

  const commands = {
    template({ template }) {
      const t = RULES.templates[template];
      c.ui.setup = { A: t.A, E: t.E, V: t.V };
      c.ui.setupTemplate = template;
    },
    setAttr({ attr, value }) {
      const v = Number.parseInt(value, 10);
      c.ui.setup = { ...c.ui.setup, [attr]: Number.isNaN(v) ? 0 : v };
    },
    startGame() {
      const t = RULES.templates[c.ui.setupTemplate];
      const same = t && t.A === c.ui.setup.A && t.E === c.ui.setup.E && t.V === c.ui.setup.V;
      return afterSubmit(session.submit('setAttributes', same ? { template: c.ui.setupTemplate } : { attributes: { ...c.ui.setup } }));
    },
    pickOpening({ cardId, checked }) {
      c.ui.draftPick = checked ? [...c.ui.draftPick.filter((x) => x !== cardId), cardId] : c.ui.draftPick.filter((x) => x !== cardId);
    },
    confirmOpening() {
      const result = session.submit('chooseOpening', { cardIds: [...c.ui.draftPick] });
      if (result.ok) c.ui.draftPick = [];
      return afterSubmit(result);
    },
    accept({ project }) {
      c.ui.preview = null;
      return afterSubmit(session.submit('accept', { projectId: project }));
    },
    abandon() {
      c.ui.preview = null;
      return afterSubmit(session.submit('abandon'), 'result');
    },
    askSettle() {
      c.ui.confirmSettle = true;
    },
    cancelSettle() {
      c.ui.confirmSettle = false;
    },
    earlySettle() {
      c.ui.confirmSettle = false;
      c.ui.preview = null;
      return afterSubmit(session.submit('earlySettle'), 'heading');
    },
    // 每次開啟預覽產生一個 operationId：同一預覽連按確認只送同一 ID，引擎只結算一次；下一次預覽是新 ID。
    openPreview({ action }) {
      c.ui.preview = { action, toggles: {}, operationId: newOperationId() };
      c.ui.message = null;
      return { focus: 'preview' };
    },
    toggle({ card, checked }) {
      if (!c.ui.preview) return;
      c.ui.preview = { ...c.ui.preview, toggles: { ...c.ui.preview.toggles, [card]: checked } };
    },
    cancelPreview() {
      c.ui.preview = null;
    },
    confirmAction() {
      if (!c.ui.preview || c.ui.submitting) return;
      const { action, toggles, operationId } = c.ui.preview;
      c.ui.submitting = true;
      try {
        const result = session.submit('action', { action, toggles: { ...toggles } }, operationId);
        if (result.ok) c.ui.preview = null;
        return afterSubmit(result, 'result');
      } finally {
        c.ui.submitting = false;
      }
    },
    pickDraft({ cardId }) {
      c.ui.draftChoice = cardId;
      c.ui.replace = null;
    },
    pickReplace({ cardId }) {
      c.ui.replace = cardId;
    },
    confirmDraft() {
      const choice = { type: 'take', cardId: c.ui.draftChoice };
      if (c.ui.replace) choice.replace = c.ui.replace;
      const result = session.submit('chooseDraft', { choice });
      if (result.ok) resetDraft();
      return afterSubmit(result, 'result');
    },
    forfeitDraft() {
      const result = session.submit('chooseDraft', { choice: { type: 'forfeit' } });
      if (result.ok) resetDraft();
      return afterSubmit(result, 'result');
    },
    askNewGame() {
      if (!c.shouldWarnBeforeUnload()) return commands.confirmNewGame();
      c.ui.confirmNewGame = true;
      return { focus: 'autofocus' };
    },
    cancelNewGame() {
      c.ui.confirmNewGame = false;
    },
    confirmNewGame() {
      const sidebarOpen = c.ui.sidebarOpen;
      session.newGame(createOptions());
      c.ui = { ...initialUi(), sidebarOpen };
      return { focus: 'heading' };
    },
    toggleSidebar() {
      c.ui.sidebarOpen = !c.ui.sidebarOpen;
    },
    escape() {
      if (c.ui.confirmNewGame) c.ui.confirmNewGame = false;
      else if (c.ui.preview) c.ui.preview = null;
      else if (c.ui.confirmSettle) c.ui.confirmSettle = false;
    },
    exportLog() {
      const phase = session.state.phase;
      if (phase !== 'ended' && !c.audit) return { download: null };
      const log = session.exportLog();
      return { download: { filename: `aieg-${log.gameId}-audit-log.json`, text: JSON.stringify(log, null, 2) } };
    },
  };

  c.dispatch = (cmd, data = {}) => {
    const fn = commands[cmd];
    if (!fn) return {};
    return fn(data) ?? {};
  };
  c.viewModel = () => session.viewModel(c.ui, { audit: c.audit });
  c.html = () => renderApp(c.viewModel(), c.ui);
  // 有進行中的局（已配點、尚未結束）時，離開或重新整理會失去當局，須先警告。
  c.shouldWarnBeforeUnload = () => !['characterSetup', 'ended'].includes(session.state.phase);
  return c;
}
