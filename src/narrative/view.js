import { ACTIONS, CARDS, LIMITS } from './rules.js';
import { availableActions, isActionResultCurrent, previewDelivery, readPreviousActionResult, safeForTrial, upgradeChoices } from './engine.js';

const REQUIREMENT_LABELS = Object.freeze({
  R1: '新增項目', R2: '完成與未完成切換', R3: '單筆刪除正確',
  R4: '重新整理後保留', R5: '關閉再開後保留', R6: '輸入處理與基本安全',
});

const SECONDARY_ACTIONS = new Set(['A03', 'A10']);
const MULTI_SUBJECT_ACTIONS = new Set(['A07', 'A11']);

function presentedTitle(state, action) {
  if (action.id === 'A01' && state.resolvedKeyByAction.A01 && state.requirement.clarity !== 'clear') return '重新理解需求';
  return action.title;
}

function actionHint(state, actionId, hasPrevious) {
  if (actionId === 'A01' && state.resolvedKeyByAction.A01 && state.requirement.clarity !== 'clear') return '這是可略過的補救工作；不重問也能繼續，但歧義會跟著後續實作。';
  if (actionId === 'A07') return '選定工作後再挑實作範圍；不同範圍是不同工作。';
  if (!hasPrevious) return '';
  if (actionId === 'A04' && state.documents.wrongCompletionRule) return '需求文件有已知誤解，可用新修訂訂正後再確認。';
  if (actionId === 'A06') return '新問題是新工作；查看舊畫面回饋不會扣資源。';
  if (actionId === 'A11' && state.knownIssues.some((issue) => issue.status !== 'fixed')) return '可修下一個已知問題，或在有 checkpoint 時選擇回滾。';
  return '';
}

export function projectNarrativeView(state) {
  const available = new Set(availableActions(state));
  const actions = Object.values(ACTIONS)
    .filter((action) => available.has(action.id) || state.resolvedKeyByAction[action.id])
    .map((action) => {
      const id = action.id;
      const previous = readPreviousActionResult(state, id);
      const cached = isActionResultCurrent(state, id);
      const unresolvedDraftRecovery = id === 'A04' && state.documents.wrongCompletionRule;
      const canStart = available.has(id) && (!cached || unresolvedDraftRecovery || MULTI_SUBJECT_ACTIONS.has(id) || id === 'A12');
      return {
        ...action,
        title: presentedTitle(state, action),
        cached,
        hasPrevious: Boolean(previous),
        canStart,
        historyOnly: Boolean(previous) && !canStart,
        previousOptions: previous?.semanticOptions ?? {},
        hint: actionHint(state, id, Boolean(previous)),
      };
    });
  const playable = actions.filter((action) => action.id !== 'A12' && action.canStart);
  const primaryActions = playable.filter((action) => !SECONDARY_ACTIONS.has(action.id));
  const secondaryActions = playable.filter((action) => SECONDARY_ACTIONS.has(action.id));
  const historyActions = actions.filter((action) => action.id !== 'A12' && action.hasPrevious && action.historyOnly);
  const progress = progressView(state);
  const deliveryChoices = [
    ['formal', '正式交付', '已滿足正式交付條件。'],
    ['limited', '有限試用', '核心操作與安全證據足夠，可限制使用範圍。'],
    ['showcase', '展示原型', '這是外觀偏題但可誠實展示的原型。'],
    ['progress', '交接目前進度', '期限或工作上限已到，可留下可重現現況。'],
    ['stop', '主動停止', '保留目前紀錄，不假裝完成。'],
  ].map(([intent, label, readyText]) => {
    const decision = previewDelivery(state, intent);
    return { intent, label, available: decision.allowed, endingId: decision.endingId, detail: decision.allowed ? readyText : decision.message };
  });

  return {
    ruleVersion: state.ruleVersion,
    phase: state.phase,
    stateVersion: state.stateVersion,
    templateId: state.templateId,
    abilities: structuredClone(state.abilities),
    resources: { token: state.token, stress: state.stress, time: state.timeLeft, overtime: state.overtimeUsed },
    tools: state.equipped.map((id) => ({ ...CARDS[id], level: state.cards[id] })),
    actions,
    primaryActions,
    secondaryActions,
    historyActions,
    canRest: state.workCount < LIMITS.hardWork && !(state.timeLeft === 0 && state.overtimeUsed >= 2),
    knownIssues: state.knownIssues.filter((issue) => issue.status !== 'fixed').map((issue) => issue.text),
    statusText: statusText(state),
    progress,
    deliveryChoices,
    lastEvent: state.lastEvent ? {
      actionTitle: ACTIONS[state.lastEvent.actionId]?.title,
      title: state.lastEvent.event.title,
      process: structuredClone(state.lastEvent.process),
      summary: state.lastEvent.event.summary,
      cost: state.lastEvent.cost,
    } : null,
    canLimitedTrial: safeForTrial(state),
    revisionOptions: {
      canNewQuestion: state.requirement.clarity === 'clear' && Boolean(state.resolvedKeyByAction.A01),
      canRepairDraft: Boolean(state.documents.wrongCompletionRule),
      canRefreshContext: Boolean(state.resolvedKeyByAction.A10),
      canAskPrototypeFollowup: Boolean(state.resolvedKeyByAction.A06),
      canRepairNextIssue: Boolean(state.resolvedKeyByAction.A11) && state.knownIssues.some((issue) => issue.status !== 'fixed'),
      canFixIssue: state.knownIssues.some((issue) => issue.status !== 'fixed'),
      canRollback: Boolean(state.rollbackAvailable && state.checkpoint),
    },
    pendingUpgrade: state.pendingUpgrades.length ? { threshold: state.pendingUpgrades[0], choices: upgradeChoices(state) } : null,
    xp: state.xp,
    ending: state.ending ? structuredClone(state.ending) : null,
  };
}

export function actionOptionsForNewWork(state, actionId) {
  const saved = readPreviousActionResult(state, actionId);
  const options = saved?.semanticOptions ? structuredClone(saved.semanticOptions) : {};
  if (actionId !== 'A11') return options;

  const hasOpenIssue = state.knownIssues.some((issue) => issue.status !== 'fixed');
  const canRollback = Boolean(state.rollbackAvailable && state.checkpoint);
  if (options.mode === 'rollback' && !canRollback) options.mode = hasOpenIssue ? 'fix' : undefined;
  if (options.mode === 'fix' && !hasOpenIssue) options.mode = canRollback ? 'rollback' : undefined;
  if (!options.mode) options.mode = hasOpenIssue ? 'fix' : canRollback ? 'rollback' : undefined;
  if (options.mode === undefined) delete options.mode;
  return options;
}

function progressView(state) {
  const checks = Object.entries(REQUIREMENT_LABELS).map(([id, label]) => {
    const evidence = state.evidence[id];
    const current = evidence?.artifactRevision === state.artifact.revision;
    const status = !evidence
      ? '尚未驗證'
      : !current || evidence.result === 'not_run'
        ? '待重驗（內容已變更）'
        : evidence.result === 'pass'
          ? '已驗證'
          : evidence.result === 'fail'
            ? '已發現問題'
            : '尚未驗證';
    return { label, status };
  });
  const openIssues = state.knownIssues.filter((issue) => issue.status !== 'fixed');
  const failedChecks = checks.filter((check) => check.status === '已發現問題').length;
  const issueSummary = openIssues.length
    ? `目前有 ${openIssues.length} 個已確認問題。${failedChecks ? `另有 ${failedChecks} 項現行驗證失敗；兩者可能重疊，分開追蹤診斷與證據。` : ''}`
    : failedChecks
      ? `驗證已觀察到 ${failedChecks} 項失敗，但原因尚未確認；這不等於沒有問題，也不提前替缺陷命名。`
      : '目前沒有已確認的功能或程式問題；文件誤解與待答事項另列在交付缺口。';
  const showcaseDecision = previewDelivery(state, 'showcase');
  const formalMissing = [];
  if (state.artifact.kind !== 'implementation') formalMissing.push('目前還不是完整實作');
  if (state.requirement.clarity !== 'clear' || state.requirement.pendingQuestions.length) formalMissing.push('需求仍有待確認問題');
  if (state.requirement.scope !== 'bounded') formalMissing.push('新增願望仍待協商');
  if (!state.documents.confirmed) formalMissing.push('驗收文件尚未確認');
  if (state.documents.wrongCompletionRule) formalMissing.push('需求文件仍有已知誤解待訂正');
  const unverified = checks.filter((check) => check.status !== '已驗證');
  if (unverified.length) formalMissing.push(`${unverified.length} 項仍沒有現行通過證據`);
  if (openIssues.length) formalMissing.push(`${openIssues.length} 個已知問題尚未修完`);

  return {
    pendingQuestions: [...state.requirement.pendingQuestions],
    documentText: state.documents.wrongCompletionRule
      ? '需求草稿有一段需要訂正'
      : state.documents.confirmed
      ? state.requirement.pendingQuestions.length
        ? `驗收文件已確認，但仍記錄 ${state.requirement.pendingQuestions.length} 個等待客戶回答的假設`
        : '驗收文件與客戶答案均已確認'
      : state.documents.draft
        ? '需求文件已存在，仍待確認'
        : '還沒有需求文件',
    artifactText: state.artifact.kind === 'implementation'
      ? `核心原型與已完成範圍已整合為實作版本 ${state.artifact.revision}；仍以右側現行證據與需求缺口判定能否交付`
      : state.artifact.kind === 'prototype'
        ? `可展示原型版本 ${state.artifact.revision}`
        : '還沒有可操作成果',
    checks,
    issueSummary,
    delivery: {
      showcase: state.artifact.kind
        ? showcaseDecision.allowed
          ? '可查看目前成果，也可選「展示原型」結案'
          : `可查看目前成果，但不能選「展示原型」結案：${showcaseDecision.message}`
        : '目前沒有可查看的成果，也不符合「展示原型」結案條件',
      limited: safeForTrial(state) ? '可有限試用；若有保存限制必須明說' : '核心操作與安全證據不足',
      formal: formalMissing.length ? formalMissing.join('；') : '已滿足正式交付條件',
    },
  };
}

function statusText(state) {
  if (state.requirement.clarity === 'unknown') return '客戶說想要一個簡單待辦；你可以先問清楚，也可以做小原型承擔歧義。';
  if (state.requirement.clarity !== 'clear') return '需求仍有一團很有禮貌的霧；可以重新理解，也可以帶著風險繼續。';
  if (!state.artifact.kind) return '需求已經能驗收；現在可以寫條件、做原型，或直接處理一個明確範圍。';
  const issueCount = state.knownIssues.filter((issue) => issue.status !== 'fixed').length;
  if (issueCount) return `目前有 ${issueCount} 個已知問題；修復、重驗或誠實縮小交付都比假裝沒看到好。`;
  if (state.documents.confirmed) return '規格已確認，成果也在手上；下一步取決於哪些功能還沒驗證。';
  return '已有可操作成果，但文件與驗證還沒完全追上；選一項真正能縮小不確定性的工作。';
}

export function auditView(state) {
  return structuredClone(state);
}
