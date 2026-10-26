// 玩家視圖／稽核視圖。玩家視圖由完整狀態單一投影產生：
// 不含隱藏缺陷 H、秘密缺陷骰與其判定、亂數內部狀態、請求紀錄與操作快取。
// 單機版只承諾正常介面不洩漏，不宣稱能防止玩家自行檢視記憶體或原始碼。

const UNKNOWN_RISK = '可能仍有未發現問題';

function maskProjects(projects) {
  return Object.fromEntries(Object.entries(projects).map(([id, p]) => {
    const { hiddenDefects, ...visible } = p;
    return [id, visible];
  }));
}

function maskSnapshot(snap) {
  return snap ? { ...snap, projects: maskProjects(snap.projects) } : snap;
}

function maskOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') return outcome;
  const { defectAdded, ...rest } = outcome;
  return rest;
}

export function projectPlayerEvent(event) {
  return {
    ...event,
    dice: event.dice.filter((d) => d.stream !== 'defect'),
    before: maskSnapshot(event.before),
    after: maskSnapshot(event.after),
    outcome: maskOutcome(event.outcome),
  };
}

export function projectPlayerView(state) {
  const { rng, log, operationResults, events, projects, ...rest } = structuredClone(state);
  return {
    ...rest,
    projects: maskProjects(projects),
    events: events.map(projectPlayerEvent),
    successDiceUsed: rng.success.cursor,
    unknownRiskNotice: state.activeProject ? UNKNOWN_RISK : null,
  };
}

// 稽核視圖：完整狀態（含 H 與秘密骰），只供明確開啟的稽核模式或匯出檔使用。
export function projectAuditView(state) {
  const { operationResults, ...rest } = structuredClone(state);
  return rest;
}
