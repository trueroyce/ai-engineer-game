import { ACTIONS, CARDS, LIMITS, TEMPLATES } from '../narrative/rules.js';
import { projectNarrativeView } from '../narrative/view.js';
import { RUN_LIMITS, RUN_SCHEMA_VERSION, validateRunRecord } from './run-schema.js';

const OUTCOME_TIERS = Object.freeze({ E01: '正式交付', E02: '正式交付', E03: '正式交付', E04: '有限試用', E05: '展示原型', E06: '正式交付', E07: '進度交接', E08: '主動停止' });
const INTENT_LABELS = Object.freeze({ formal: '正式交付', limited: '有限試用', showcase: '展示原型', progress: '交接目前進度', stop: '主動停止' });
const OPTION_LABELS = Object.freeze({
  target: 'target', mode: 'mode', useC2: 'useC2', useC3: 'useC3', checkDelete: 'checkDelete', newRevision: 'newRevision', repairDraft: 'repairDraft', intent: 'intent',
});

function clipped(value, max = RUN_LIMITS.maxLongText) {
  const source = String(value ?? '');
  if (source.length <= max) return source;
  return `${source.slice(0, Math.max(0, max - 6))}…[截斷]`;
}

function resources(value = {}) {
  return {
    token: Number.isInteger(value.token) ? value.token : 0,
    stress: Number.isInteger(value.stress) ? value.stress : 0,
    time: Number.isInteger(value.time) ? value.time : Number.isInteger(value.timeLeft) ? value.timeLeft : 0,
    overtime: Number.isInteger(value.overtime) ? value.overtime : Number.isInteger(value.overtimeUsed) ? value.overtimeUsed : 0,
    workCount: Number.isInteger(value.workCount) ? value.workCount : 0,
  };
}

function publicChoices(options = {}) {
  const output = {};
  for (const [key, value] of Object.entries(options)) {
    if (OPTION_LABELS[key] && ['string', 'boolean', 'number'].includes(typeof value)) output[OPTION_LABELS[key]] = value;
  }
  return output;
}

function publicProcess(process) {
  if (!process) return undefined;
  return {
    player: clipped(process.player),
    response: clipped(process.response),
    followUp: clipped(process.followUp),
    consequence: clipped(process.consequence),
  };
}

function fnv64(source) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function findResult(results, used, item) {
  const match = results.find((result, index) => !used.has(index)
    && result.actionId === item.actionId
    && result.event?.id === item.eventId
    && result.resourcesAfter?.workCount === item.work);
  if (!match) return null;
  const index = results.indexOf(match);
  used.add(index);
  return match;
}

function timelineFrom(state) {
  const results = Object.values(state.resolved ?? {}).filter((item) => item?.type === 'event');
  const used = new Set();
  return (state.log ?? []).slice(0, RUN_LIMITS.maxTimeline).map((item, index) => {
    const sequence = index + 1;
    if (item.actionId === 'REST') {
      return {
        sequence, kind: 'rest',
        decision: { actionKey: 'REST', label: '真的休息一下', choices: {} },
        resourceCost: { token: item.overtime ? 1 : 0, workTime: 1, overtimeUsed: Boolean(item.overtime) },
        observedOutcome: { title: '休息', summary: '恢復 Token、降低壓力；時間照常前進。' },
        resourcesAfter: resources(item.resourcesAfter),
      };
    }
    if (item.actionId === 'UPGRADE') {
      const card = CARDS[item.cardId];
      return {
        sequence, kind: 'upgrade',
        decision: { actionKey: 'UPGRADE', label: item.kind === 'fusion' ? `融合 ${card?.name ?? item.cardId}` : `取得 ${card?.name ?? item.cardId}`, choices: { cardId: item.cardId, level: item.nextLevel } },
        resourceCost: { token: 0, workTime: 0, overtimeUsed: false },
        observedOutcome: { title: '工具獎勵', summary: item.kind === 'fusion' ? `卡片融合到 Lv.${item.nextLevel}` : '取得一張新工具卡' },
        resourcesAfter: resources(item.resourcesAfter),
      };
    }
    if (item.actionId === 'A12') {
      return {
        sequence, kind: 'delivery',
        decision: { actionKey: 'A12', label: INTENT_LABELS[item.intent] ?? '結束案件', choices: { intent: item.intent ?? 'unknown' } },
        resourceCost: { token: 0, workTime: 0, overtimeUsed: false },
        observedOutcome: { title: clipped(state.ending?.title), summary: clipped(state.ending?.text) },
        resourcesAfter: resources(item.resourcesAfter ?? state),
      };
    }
    const result = findResult(results, used, item);
    return {
      sequence, kind: 'work',
      decision: { actionKey: item.actionId, label: clipped(ACTIONS[item.actionId]?.title ?? '工作'), choices: publicChoices(item.options) },
      resourceCost: { token: result?.cost ?? item.cost ?? 0, workTime: 1, overtimeUsed: Boolean(result?.overtime) },
      observedOutcome: {
        title: clipped(result?.event?.title ?? '公開結果未保留'),
        summary: clipped(result?.event?.summary ?? '這個舊紀錄沒有可用的公開摘要。'),
        ...(result?.process ? { process: publicProcess(result.process) } : {}),
      },
      resourcesAfter: resources(result?.resourcesAfter ?? item.resourcesAfter),
    };
  });
}

export function buildRunRecord(state) {
  if (!state || state.phase !== 'ended' || !state.ending) throw new Error('只有已結束的案件可以匯出');
  const view = projectNarrativeView(state);
  const template = TEMPLATES[state.templateId];
  const base = {
    schemaVersion: RUN_SCHEMA_VERSION,
    gameRuleVersion: state.ruleVersion,
    caseId: state.caseId,
    knowledgeBoundary: {
      playerVisibleOnly: true,
      hiddenTerminalTruthIncluded: false,
      note: '只含玩家在當局已看見的選擇、結果與公開狀態；沒有 seed、事件權重、內部缺陷真值或未發生分支。',
    },
    character: { templateId: state.templateId, name: clipped(template.name, RUN_LIMITS.maxShortText), difficulty: clipped(template.difficulty, RUN_LIMITS.maxShortText) },
    cards: state.equipped.map((cardId) => ({ id: cardId, name: clipped(CARDS[cardId].name, RUN_LIMITS.maxShortText), level: state.cards[cardId] })),
    initialResources: { token: LIMITS.token, stress: 0, time: LIMITS.deadline, overtime: 0, workCount: 0 },
    finalResources: resources(state),
    ending: {
      baseId: state.ending.baseId,
      tier: OUTCOME_TIERS[state.ending.baseId] ?? '案件結束',
      title: clipped(state.ending.title, RUN_LIMITS.maxShortText),
      text: clipped(state.ending.text),
      facets: (state.ending.facets ?? []).slice(0, 4),
    },
    publicProgress: {
      pendingQuestions: view.progress.pendingQuestions.slice(0, 12).map((item) => clipped(item, RUN_LIMITS.maxShortText)),
      documentText: clipped(view.progress.documentText),
      artifactText: clipped(view.progress.artifactText),
      checks: view.progress.checks.slice(0, RUN_LIMITS.maxChecks).map((check) => ({ label: clipped(check.label, RUN_LIMITS.maxShortText), status: clipped(check.status, RUN_LIMITS.maxShortText) })),
      knownIssues: view.knownIssues.slice(0, RUN_LIMITS.maxKnownIssues).map((item) => clipped(item)),
      issueSummary: clipped(view.progress.issueSummary),
    },
    timeline: timelineFrom(state),
  };
  const runId = `case01-${fnv64(JSON.stringify(base))}`;
  const record = { schemaVersion: base.schemaVersion, runId, ...Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'schemaVersion')) };
  validateRunRecord(record);
  return record;
}

export function serializeRunRecord(record) {
  validateRunRecord(record);
  return `${JSON.stringify(record, null, 2)}\n`;
}

export async function saveRunRecord(record, capability, environment = globalThis) {
  validateRunRecord(record);
  if (!capability
    || capability.schema !== 'ai-engineer-game.local-coach.v1'
    || capability.endpoint !== '/api/local-coach/runs'
    || typeof capability.csrfToken !== 'string'
    || !/^[A-Za-z0-9_-]{32,128}$/.test(capability.csrfToken)) {
    throw new Error('本機賽後教練連線資訊無效');
  }
  const response = await environment.fetch(capability.endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-AIEG-CSRF': capability.csrfToken,
    },
    body: serializeRunRecord(record),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('本機賽後教練回應格式無效'); }
  if (!response.ok || result?.ok !== true || result.runId !== record.runId) {
    throw new Error(result?.error?.message ?? `本機儲存失敗（HTTP ${response.status}）`);
  }
  return {
    runId: result.runId,
    fileName: result.fileName,
    created: Boolean(result.created),
    idempotent: Boolean(result.idempotent),
  };
}

function validCapability(capability) {
  return capability
    && capability.schema === 'ai-engineer-game.local-coach.v1'
    && capability.endpoint === '/api/local-coach/runs'
    && capability.analysisEndpoint === '/api/local-coach/analyze'
    && capability.cancelEndpoint === '/api/local-coach/cancel'
    && typeof capability.csrfToken === 'string'
    && /^[A-Za-z0-9_-]{32,128}$/.test(capability.csrfToken);
}

async function localCoachPost(endpoint, body, capability, environment) {
  if (!validCapability(capability)) throw new Error('本機賽後教練連線資訊無效');
  const response = await environment.fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-AIEG-CSRF': capability.csrfToken,
    },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('本機賽後教練回應格式無效'); }
  if (!response.ok || result?.ok !== true) throw new Error(result?.error?.message ?? `本機賽後教練失敗（HTTP ${response.status}）`);
  return result;
}

export async function analyzeRun(runId, capability, { reanalyze = false } = {}, environment = globalThis) {
  if (typeof runId !== 'string' || !/^case0[123]-[a-f0-9]{16}$/.test(runId)) throw new Error('runId 格式無效');
  const result = await localCoachPost(capability.analysisEndpoint, { runId, reanalyze }, capability, environment);
  if (result.runId !== runId || !result.critique || typeof result.critique !== 'object') throw new Error('Claude 講評回應不完整');
  return result;
}

export async function cancelRunAnalysis(runId, capability, environment = globalThis) {
  if (typeof runId !== 'string' || !/^case0[123]-[a-f0-9]{16}$/.test(runId)) throw new Error('runId 格式無效');
  return localCoachPost(capability.cancelEndpoint, { runId }, capability, environment);
}

export function downloadRunRecord(record, environment = globalThis) {
  const json = serializeRunRecord(record);
  const blob = new environment.Blob([json], { type: 'application/json;charset=utf-8' });
  const url = environment.URL.createObjectURL(blob);
  const link = environment.document.createElement('a');
  link.href = url;
  link.download = `${record.runId}.json`;
  link.hidden = true;
  environment.document.body.append(link);
  link.click();
  link.remove();
  environment.setTimeout(() => environment.URL.revokeObjectURL(url), 0);
  return { fileName: link.download, bytes: new TextEncoder().encode(json).byteLength };
}
