import { CARDS } from '../career/cards.js';
import { CASE02_ACTIONS } from '../case-02/rules.js';
import { case02PublicView } from '../case-02/engine-v2.js';
import { CASE03_ACTIONS } from '../case-03/rules.js';
import { case03PublicView } from '../case-03/engine.js';
import { TEMPLATES } from '../narrative/rules.js';
import { RUN_LIMITS, RUN_SCHEMA_VERSION, validateRunRecord } from './run-schema.js';

const CASE_META = Object.freeze({
  'case-02': {
    prefix: 'case02',
    actions: CASE02_ACTIONS,
    delivery: 'B09',
    view: case02PublicView,
    tiers: Object.freeze({ 'C02-VERIFIED': '正式交付', 'C02-LIMITED': '有限試用', 'C02-FAILED': '風險交付', 'C02-STOP': '誠實止損' }),
  },
  'case-03': {
    prefix: 'case03',
    actions: CASE03_ACTIONS,
    delivery: 'C07',
    view: case03PublicView,
    tiers: Object.freeze({ 'C03-VERIFIED': '正式交付', 'C03-LIMITED': '有限試用', 'C03-FAILED': '風險交付', 'C03-STOP': '誠實止損' }),
  },
});

const OPTION_KEYS = Object.freeze(new Set([
  'idPolicy', 'datePolicy', 'duplicatePolicy', 'strategy', 'useRapid', 'useFastMerge',
  'response', 'mode', 'scope', 'mergeMode', 'intent',
]));

function clipped(value, max = RUN_LIMITS.maxLongText) {
  const source = String(value ?? '');
  return source.length <= max ? source : `${source.slice(0, Math.max(0, max - 6))}…[截短]`;
}

function resources(value = {}, workCount = 0) {
  return {
    token: Number.isInteger(value.token) ? value.token : 0,
    stress: Number.isInteger(value.stress) ? value.stress : 0,
    time: Number.isInteger(value.time) ? value.time : Number.isInteger(value.timeLeft) ? value.timeLeft : 0,
    overtime: 0,
    workCount: Math.min(14, Number.isInteger(value.workCount) ? value.workCount : workCount),
  };
}

function publicChoices(value = {}) {
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => OPTION_KEYS.has(key) && ['string', 'boolean', 'number'].includes(typeof item))
    .slice(0, 8));
}

function publicProcess(value) {
  if (!value) return undefined;
  return {
    player: clipped(value.player),
    response: clipped(value.response),
    followUp: clipped(value.followUp),
    consequence: clipped(value.consequence),
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

function resultFor(results, used, actionId) {
  const index = results.findIndex((item, candidate) => !used.has(candidate)
    && (item?.actionId === actionId || item?.ending || item?.process || item?.title));
  if (index < 0) return null;
  used.add(index);
  return results[index];
}

function timelineFrom(state, meta) {
  const results = Object.values(state.operationResults ?? {});
  const used = new Set();
  let previous = { token: 18, stress: 0, time: 12 };
  let workCount = 0;
  return (state.log ?? []).slice(0, RUN_LIMITS.maxTimeline).map((item, index) => {
    const result = resultFor(results, used, item.actionId);
    const after = item.resources ?? {
      token: result?.resourcesAfter?.token ?? previous.token,
      stress: result?.resourcesAfter?.stress ?? previous.stress,
      time: result?.resourcesAfter?.timeLeft ?? result?.resourcesAfter?.time ?? previous.time,
    };
    const delivery = item.actionId === meta.delivery;
    if (!delivery) workCount += 1;
    const kind = delivery ? 'delivery' : item.actionId === 'B08' ? 'rest' : 'work';
    const ending = result?.ending ?? (delivery ? state.ending : null);
    const outcomeTitle = result?.title ?? ending?.title ?? '公開工作結果';
    const outcomeSummary = result?.summary ?? ending?.text ?? `結果：${item.outcome ?? '已記錄'}`;
    const entry = {
      sequence: index + 1,
      kind,
      decision: {
        actionKey: item.actionId,
        label: clipped(meta.actions[item.actionId]?.title ?? (delivery ? '結案' : '工作'), RUN_LIMITS.maxShortText),
        choices: publicChoices(item.options),
      },
      resourceCost: {
        token: Math.max(0, previous.token - after.token),
        workTime: Math.min(1, Math.max(0, previous.time - after.time)),
        overtimeUsed: false,
      },
      observedOutcome: {
        title: clipped(outcomeTitle, RUN_LIMITS.maxShortText),
        summary: clipped(outcomeSummary),
        ...(result?.process ? { process: publicProcess(result.process) } : {}),
      },
      resourcesAfter: resources(after, workCount),
    };
    previous = after;
    return entry;
  });
}

function endingFacets(ending) {
  const source = ending?.playFacets?.length ? ending.playFacets : ending?.facets ?? [];
  return source.map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean).slice(0, 4);
}

function publicProgress(state, view) {
  if (state.caseId === 'case-02') {
    const checks = [
      ['資料契約', view.contract ? (view.contract.clarity === false ? '仍有歧義' : '已建立') : '未建立'],
      ['三源整合', view.integration?.complete ? `完成；債務 ${view.integration.unresolvedDebt}` : '未完成'],
      ['跨源測試', `${view.tests?.coverage ?? 0}/4；失敗 ${(view.tests?.failed ?? []).length}`],
      ['來源追溯', view.provenance ? '已建立' : '未建立'],
    ];
    return {
      pendingQuestions: view.blockers.slice(0, 12).map((item) => clipped(item, RUN_LIMITS.maxShortText)),
      documentText: clipped(view.contract ? `ID=${view.contract.idPolicy}；日期=${view.contract.datePolicy}；重複=${view.contract.duplicatePolicy}` : '尚未建立資料格式契約。'),
      artifactText: clipped(`資料 revision ${view.dataRevision ?? state.dataRevision}；整合債務 ${view.integration?.unresolvedDebt ?? 0}；來源追溯${view.provenance ? '完成' : '未完成'}。`),
      checks: checks.map(([label, status]) => ({ label, status: clipped(status, RUN_LIMITS.maxShortText) })),
      knownIssues: view.blockers.slice(0, RUN_LIMITS.maxKnownIssues).map(clipped),
      issueSummary: clipped(view.blockers.length ? `仍有 ${view.blockers.length} 個公開交付缺口。` : '公開交付條件均已完成。'),
    };
  }
  const checks = [
    ['需求決策', view.requirements?.clear ? '已確認' : view.requirements ? '仍有歧義' : '未處理'],
    ['介面契約', view.contract?.approved ? '客戶已核准' : '未核准'],
    ['實作與合併', view.implementation?.complete ? `已實作；合併債務 ${view.integrationDebt}` : '未完成'],
    ['目前證據', view.evidence?.revision === view.artifactRevision ? `${view.evidence.coverage}/4` : '尚未覆蓋目前 revision'],
  ];
  return {
    pendingQuestions: view.blockers.slice(0, 12).map((item) => clipped(item, RUN_LIMITS.maxShortText)),
    documentText: clipped(`範圍=${view.requirements?.scope ?? '未決'}；契約=${view.contract?.policy ?? '未核准'}；變更=${view.change?.handled ? '已處理' : '待處理'}。`),
    artifactText: clipped(`artifact revision ${view.artifactRevision}；策略=${view.implementation?.strategy ?? '未實作'}；合併債務 ${view.integrationDebt}。`),
    checks: checks.map(([label, status]) => ({ label, status: clipped(status, RUN_LIMITS.maxShortText) })),
    knownIssues: view.blockers.slice(0, RUN_LIMITS.maxKnownIssues).map(clipped),
    issueSummary: clipped(view.blockers.length ? `仍有 ${view.blockers.length} 個公開協作缺口。` : '公開協作與驗收條件均已完成。'),
  };
}

export function buildCareerCaseRunRecord(state) {
  const meta = CASE_META[state?.caseId];
  if (!meta || state.phase !== 'ended' || !state.ending) throw new Error('只有已結案的案件 02／03 可以輸出');
  const view = meta.view(state);
  const template = TEMPLATES[state.templateId];
  const timeline = timelineFrom(state, meta);
  const workCount = timeline.filter((item) => item.kind !== 'delivery').length;
  const base = {
    schemaVersion: RUN_SCHEMA_VERSION,
    gameRuleVersion: state.ruleVersion,
    caseId: state.caseId,
    knowledgeBoundary: {
      playerVisibleOnly: true,
      hiddenTerminalTruthIncluded: false,
      note: '只包含玩家在本局已看見的決策、過程、公開狀態與結果；不含 seed、骰流、事件權重、操作快取或隱藏終端真相。',
    },
    character: { templateId: state.templateId, name: clipped(template.name, RUN_LIMITS.maxShortText), difficulty: clipped(template.difficulty, RUN_LIMITS.maxShortText) },
    cards: state.equipped.slice(0, RUN_LIMITS.maxCards).map((id) => ({ id, name: clipped(CARDS[id].name, RUN_LIMITS.maxShortText), level: state.cards[id] })),
    initialResources: { token: 18, stress: 0, time: 12, overtime: 0, workCount: 0 },
    finalResources: resources(state, workCount),
    ending: {
      baseId: state.ending.baseId,
      tier: meta.tiers[state.ending.baseId] ?? '案件結案',
      title: clipped(state.ending.title, RUN_LIMITS.maxShortText),
      text: clipped(state.ending.text),
      facets: endingFacets(state.ending),
    },
    publicProgress: publicProgress(state, view),
    timeline,
  };
  const runId = `${meta.prefix}-${fnv64(JSON.stringify(base))}`;
  const record = { schemaVersion: base.schemaVersion, runId, ...Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'schemaVersion')) };
  validateRunRecord(record);
  return record;
}
