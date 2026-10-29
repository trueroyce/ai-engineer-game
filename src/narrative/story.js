const clone = (value) => structuredClone(value);

const CHOICES = Object.freeze({
  steady: { id: 'steady', label: '穩住已完成範圍', detail: '花 1 Token，鎖住這次成果；後續仍要面對證據是否跟得上。', token: 1, time: 1, stress: 0 },
  expand: { id: 'expand', label: '趁手感好追加一個願望', detail: '花 2 Token、壓力 +1；範圍重新待確認，之後可能要砍回來。', token: 2, time: 1, stress: 1 },
  prototype: { id: 'prototype', label: '退回可丟棄原型重新問', detail: '花 1 Token；保住理解，但目前成果不再算正式實作。', token: 1, time: 1, stress: 0 },
  trim: { id: 'trim', label: '砍到可驗證的核心範圍', detail: '花 1 Token；留下範圍取捨，避免把失敗硬說成完整。', token: 1, time: 1, stress: 0 },
  force: { id: 'force', label: '硬做並公開留下風險', detail: '花 2 Token、壓力 +2；可以前進，但未解風險會阻擋正式交付。', token: 2, time: 1, stress: 2 },
  citeEvidence: { id: 'cite-evidence', label: '引用紀錄，守住已驗範圍', detail: '花 1 Token；處理這次追問，不擴大承諾。', token: 1, time: 1, stress: 0 },
  polish: { id: 'polish', label: '多補一輪證據再交', detail: '花 2 Token；保留範圍並重跑受影響證據。', token: 2, time: 1, stress: 0 },
  cutBack: { id: 'cut-back', label: '把追加願望排到下一版', detail: '花 1 Token；範圍回到已確認版本，公開記錄延期。', token: 1, time: 1, stress: 0 },
  honorExtra: { id: 'honor-extra', label: '接受追加，但先重訂驗收', detail: '花 2 Token、壓力 +1；保留追加範圍，重新建立證據。', token: 2, time: 1, stress: 1 },
  discardPrototype: { id: 'discard-prototype', label: '丟掉原型，回到最小正式切片', detail: '花 1 Token；原型只留作需求證據。', token: 1, time: 1, stress: 0 },
  promotePrototype: { id: 'promote-prototype', label: '把已確認原型重做成正式切片', detail: '花 2 Token；產物回到實作，但證據必須重跑。', token: 2, time: 1, stress: 0 },
  keepBoundary: { id: 'keep-boundary', label: '守住核心範圍並列出未做清單', detail: '花 1 Token；有限範圍保持真實可交接。', token: 1, time: 1, stress: 0 },
  restoreOne: { id: 'restore-one', label: '只救回一項最重要承諾', detail: '花 2 Token；範圍重新待確認，不會免費變完整。', token: 2, time: 1, stress: 0 },
  isolateRisk: { id: 'isolate-risk', label: '隔離風險，保住已驗切片', detail: '花 1 Token；風險仍公開存在，但不再污染核心。', token: 1, time: 1, stress: 0 },
  repairRisk: { id: 'repair-risk', label: '正面修復並重跑證據', detail: '花 2 Token；只修這個風險，其他問題照舊。', token: 2, time: 1, stress: 0 },
});

const choice = (id) => clone(CHOICES[id]);
const choiceById = (id) => Object.values(CHOICES).find((item) => item.id === id);

export function normalizeCase01Story(value = {}) {
  return {
    openDecision: value?.openDecision ?? null,
    commitment: value?.commitment ?? null,
    followUpWork: Number.isInteger(value?.followUpWork) ? value.followUpWork : 0,
    pendingConsequence: value?.pendingConsequence ?? null,
    history: Array.isArray(value?.history) ? clone(value.history) : [],
  };
}

export function case01StoryChoices(state, actionId) {
  const story = normalizeCase01Story(state.story);
  if (actionId === 'A13') {
    if (!story.openDecision || story.commitment) return [];
    return story.openDecision.outcome === 'success'
      ? [choice('steady'), choice('expand')]
      : [choice('prototype'), choice('trim'), choice('force')];
  }
  if (actionId !== 'A14' || !story.pendingConsequence?.revealed || story.pendingConsequence.resolved) return [];
  return {
    steady: [choice('citeEvidence'), choice('polish')],
    expand: [choice('cutBack'), choice('honorExtra')],
    prototype: [choice('discardPrototype'), choice('promotePrototype')],
    trim: [choice('keepBoundary'), choice('restoreOne')],
    force: [choice('isolateRisk'), choice('repairRisk')],
  }[story.commitment] ?? [];
}

export function previewCase01StoryAction(state, actionId, options = {}) {
  const selected = case01StoryChoices(state, actionId).find((item) => item.id === options.route);
  const overtime = state.timeLeft === 0;
  if (!selected) return { cached: false, cost: 0, timeCost: 1, stress: 0, overtime, choice: null, requiresChoice: true };
  return { cached: false, cost: selected.token + (overtime ? 1 : 0), timeCost: selected.time, stress: selected.stress, overtime, choice: selected };
}

function fixIssue(state, code) {
  for (const item of state.knownIssues ?? []) if (item.code === code && item.status !== 'fixed') item.status = 'fixed';
}

function invalidateEvidence(state, ids) {
  for (const id of ids) {
    if (state.evidence?.[id]) state.evidence[id] = { ...state.evidence[id], result: 'not_run', invalidatedBy: state.artifact.revision };
  }
}

function addIssue(state, code, text, requirements) {
  if (!state.knownIssues.some((item) => item.code === code && item.status !== 'fixed')) {
    state.knownIssues.push({ code, text, requirements, status: 'known', introducedAt: state.artifact.revision });
  }
}

function resultFor(actionId, route, title, summary, consequence) {
  const suffix = ['expand', 'force', 'honor-extra', 'restore-one'].includes(route) ? 'C' : ['prototype', 'trim', 'polish', 'promote-prototype', 'repair-risk'].includes(route) ? 'B' : 'A';
  return {
    type: 'event',
    actionId,
    event: { id: `${actionId}-${suffix}`, title, summary },
    process: {
      player: `你選擇「${choiceById(route).label}」，沒有把它藏在一句「順手處理」。`,
      response: 'Claude 依公開範圍整理影響，沒有替客戶批准新承諾，也沒有把原型冒充正式功能。',
      followUp: consequence,
      consequence: '這個決策已寫進案件歷程；之後只會由真的相關工作改變。',
    },
    semanticOptions: { route },
    outcome: route,
  };
}

export function performCase01StoryAction(state, actionId, options = {}) {
  const preview = previewCase01StoryAction(state, actionId, options);
  if (!preview.choice) throw new Error('請先選擇這次要承擔的路線');
  const story = normalizeCase01Story(state.story);
  const route = options.route;
  let result;
  if (actionId === 'A13') {
    story.commitment = route;
    story.openDecision = null;
    story.followUpWork = 0;
    story.pendingConsequence = { id: `case01-${route}-returns`, revealed: false, resolved: false, sourceActionId: 'A13' };
    if (route === 'expand') {
      state.requirement.scope = 'pending_change';
      addIssue(state, 'phase31-extra-scope', '追加願望尚未重新確認範圍', ['R1', 'R2']);
      result = resultFor(actionId, route, '手感一好，願望也來上班', '你接受一次公開的追加冒險；正式交付暫時多了一個待確認範圍。', '兩次後續工作後，這個承諾會要求你砍回來或重訂驗收。');
    } else if (route === 'steady') {
      result = resultFor(actionId, route, '先把會動的東西鎖好', '你沒有把成功當成免費擴張券；已完成範圍保持不變。', '兩次後續工作後，客戶會追問證據是否真的跟得上。');
    } else if (route === 'prototype') {
      state.artifact.kind = 'prototype';
      result = resultFor(actionId, route, '失敗沒有重開，先退回會說話的原型', '目前產物降為原型；理解保留，但不能冒充正式實作。', '兩次後續工作後，必須決定丟掉或重做成正式切片。');
    } else if (route === 'trim') {
      state.scopeNegotiated = true;
      state.requirement.scope = 'bounded';
      result = resultFor(actionId, route, '範圍瘦身成功，尊嚴暫時保住', '你把工作縮到可驗證核心，未承諾部分明確留在清單。', '兩次後續工作後，客戶會問是否要守住邊界或救回一項。');
    } else {
      addIssue(state, 'phase31-forced-scope', '硬做留下未驗證的範圍風險', ['R1', 'R2', 'R3']);
      result = resultFor(actionId, route, '硬做可以前進，風險也一起打卡', '產物仍可工作，但公開風險會阻擋正式交付。', '兩次後續工作後，必須隔離或真正修復。');
    }
  } else {
    story.pendingConsequence.resolved = true;
    if (route === 'cut-back') {
      state.requirement.scope = 'bounded';
      fixIssue(state, 'phase31-extra-scope');
    } else if (route === 'honor-extra') {
      state.requirement.scope = 'bounded';
      fixIssue(state, 'phase31-extra-scope');
      state.artifact.revision += 1;
      invalidateEvidence(state, ['R1', 'R2']);
    } else if (route === 'promote-prototype') {
      state.artifact.kind = 'implementation';
      state.artifact.revision += 1;
      invalidateEvidence(state, Object.keys(state.functionState));
    } else if (route === 'discard-prototype') {
      state.artifact.kind = 'implementation';
      state.scopeNegotiated = true;
      state.artifact.revision += 1;
      invalidateEvidence(state, ['R1', 'R2', 'R3']);
    } else if (route === 'restore-one') {
      state.requirement.scope = 'pending_change';
    } else if (route === 'isolate-risk') {
      fixIssue(state, 'phase31-forced-scope');
      state.scopeNegotiated = true;
      state.artifact.revision += 1;
      invalidateEvidence(state, ['R1', 'R2', 'R3']);
    } else if (route === 'repair-risk') {
      fixIssue(state, 'phase31-forced-scope');
      state.artifact.revision += 1;
      invalidateEvidence(state, ['R1', 'R2', 'R3']);
      state.repairHistory = true;
    } else if (route === 'polish') {
      state.artifact.revision += 1;
      invalidateEvidence(state, ['R1', 'R2', 'R3']);
    }
    result = resultFor(actionId, route, '先前的選擇回來了，你沒有裝不認識', choiceById(route).detail, '後果已處理；沒有順便清掉其他已知問題。');
  }
  story.history.push({ actionId, route, consequenceId: story.pendingConsequence?.id ?? null });
  state.story = story;
  return { preview, result };
}

export function observeCase01Story(state, actionId, result) {
  const story = normalizeCase01Story(state.story);
  if (actionId === 'A07') {
    story.openDecision = { outcome: result.event?.id === 'A07-A' ? 'success' : 'failure', eventId: result.event?.id ?? null };
    story.commitment = null;
    story.followUpWork = 0;
    story.pendingConsequence = null;
  } else if (!['A12', 'A13', 'A14'].includes(actionId) && story.commitment && story.pendingConsequence && !story.pendingConsequence.resolved) {
    story.followUpWork += 1;
    if (story.followUpWork >= 2) story.pendingConsequence.revealed = true;
  }
  state.story = story;
}
