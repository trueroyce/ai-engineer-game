// UI 與引擎之間的唯一橋樑：持有完整狀態，但只對外提供玩家視圖、合法行動與預覽（皆不含 H）。
// 稽核視圖只在明確開啟稽核模式時提供。
import { createGame, submit as engineSubmit, previewAction, legalActions } from '../core/engine.js';
import { projectPlayerView, projectAuditView } from '../core/view.js';
import { exportAuditLog } from '../core/log.js';

function newOperationId() {
  return globalThis.crypto.randomUUID();
}

export class GameSession {
  constructor({ createOptions = {} } = {}) {
    this.createOptions = createOptions;
    this.newGame(createOptions);
  }

  newGame(createOptions = {}) {
    this.state = createGame(createOptions);
    this.sent = new Map();
    this.lastResult = null;
  }

  // 同一 operationId 重送時，送出與第一次完全相同的請求（含當時的 stateVersion），由引擎回傳快取結果。
  submit(type, payload = {}, operationId = newOperationId()) {
    let request = this.sent.get(operationId);
    if (!request) {
      request = { operationId, expectedStateVersion: this.state.stateVersion, type, ...payload };
      this.sent.set(operationId, request);
    }
    const out = engineSubmit(this.state, request);
    this.state = out.state;
    this.lastResult = out.result;
    return out.result;
  }

  exportLog() {
    return exportAuditLog(this.state);
  }

  viewModel(ui, { audit = false } = {}) {
    const view = projectPlayerView(this.state);
    return {
      view,
      legal: legalActions(this.state),
      preview: ui?.preview ? previewAction(this.state, ui.preview) : null,
      lastResult: this.lastResult,
      audit: audit ? projectAuditView(this.state) : null,
    };
  }
}
