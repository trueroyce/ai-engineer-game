// 稽核紀錄匯出與重播。紀錄含建局設定（種子或注入序列）與所有提交過的請求（含被拒絕者），
// 因此能從初始狀態逐步重建出深度相等的最終狀態。紀錄含秘密資訊，只屬稽核層級。
import { RULE_VERSION } from './rules.js';
import { createGame, submit } from './engine.js';

export const LOG_FORMAT = 'ai-engineer-game/audit-log@1';

export function exportAuditLog(state) {
  return {
    format: LOG_FORMAT,
    ruleVersion: state.ruleVersion,
    gameId: state.gameId,
    containsSecrets: true,
    createOptions: structuredClone(state.log.createOptions),
    requests: structuredClone(state.log.requests),
    events: structuredClone(state.events),
    finalStateVersion: state.stateVersion,
  };
}

export function replay(log) {
  if (log.ruleVersion !== RULE_VERSION) {
    throw new Error(`規則版本不符：紀錄為 ${log.ruleVersion}，引擎為 ${RULE_VERSION}`);
  }
  let state = createGame(log.createOptions);
  for (const request of log.requests) state = submit(state, request).state;
  return state;
}
