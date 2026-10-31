import { drawD100 } from './rng.js';
import { applyRequirementRevision, createAttemptState, payRetry, previewAttempt, previewRetry, resolveAttempt } from './attempt.js';

const clone = (value) => structuredClone(value);

export const CAREER_TEMPLATE_ATTEMPT_MODIFIERS = Object.freeze({
  beginner: Object.freeze({ id: 'beginner-guidance', label: '教學引導：按流程拆解問題', value: 30 }),
  ultimate: Object.freeze({ id: 'ultimate-focus', label: '全能戰士：跨域熟練', value: 5 }),
});

export function initializeCaseAttempts(state) {
  state.attempts ??= createAttemptState();
  state.attemptHistory ??= {};
  state.eventAudit ??= [];
  return state;
}

function requestFor(state, config, operationId = 'preview') {
  const templateModifier = state.progression ? CAREER_TEMPLATE_ATTEMPT_MODIFIERS[state.templateId] : null;
  return {
    operationId,
    semanticKey: config.semanticKey,
    baseChance: config.baseChance,
    partialMargin: config.partialMargin ?? 4,
    minChance: 10,
    maxChance: 95,
    boundaryAction: Boolean(config.boundaryAction),
    cards: state.cards,
    equipped: state.equipped,
    modifiers: [
      { id: `ability-${config.ability}`, label: `${config.ability} 能力`, value: state.abilities[config.ability] * 5 },
      ...(templateModifier ? [templateModifier] : []),
      ...(config.modifiers ?? []),
    ],
    events: config.events,
  };
}

function retryPreview(state, semanticKey) {
  if (!(state.attemptHistory?.[semanticKey] > 0)) return null;
  return previewRetry(state.attempts, { semanticKey, tokenCost: 0, timeCost: 1, cards: state.cards, equipped: state.equipped });
}

export function previewCaseAttempt(original, config) {
  const state = initializeCaseAttempts(clone(original));
  const retry = retryPreview(state, config.semanticKey);
  let attempts = state.attempts;
  if (retry) attempts = payRetry(attempts, { semanticKey: config.semanticKey, tokenCost: 0, timeCost: 1, token: 0, time: 1, cards: state.cards, equipped: state.equipped }).state;
  return { ...previewAttempt(attempts, requestFor(state, config)), retry: Boolean(retry), retryLearningGain: retry?.learningGain ?? 0, retryTimeDiscount: retry ? 1 - retry.timeCost : 0 };
}

export function runCaseAttempt(state, config) {
  initializeCaseAttempts(state);
  const retry = retryPreview(state, config.semanticKey);
  if (retry) state.attempts = payRetry(state.attempts, { semanticKey: config.semanticKey, tokenCost: 0, timeCost: 1, token: 0, time: 1, cards: state.cards, equipped: state.equipped }).state;
  let stream = state.rng.event;
  const draw = () => { const result = drawD100(stream); stream = result.stream; return result.value; };
  let successValue = null;
  const output = resolveAttempt(state.attempts, requestFor(state, config, config.operationId), {
    success: () => { successValue = draw(); return successValue; },
    event: () => config.separateFailureDraw === false ? successValue : draw(),
  });
  state.attempts = output.state;
  state.rng.event = stream;
  state.attemptHistory[config.semanticKey] = (state.attemptHistory[config.semanticKey] ?? 0) + (output.repeated ? 0 : 1);
  const result = { ...output.result, retry: Boolean(retry), retryLearningGain: retry?.learningGain ?? 0, retryTimeDiscount: retry ? 1 - retry.timeCost : 0 };
  if (!output.repeated) state.eventAudit.push({ actionId: config.actionId, semanticKey: config.semanticKey, outcome: result.outcome, successDraw: result.successDraw, chance: result.chance, failureEvent: result.failureEvent, sequel: result.sequel });
  return result;
}

export function reviseCaseAttempts(state, { revision, kind, affectedKeys }) {
  initializeCaseAttempts(state);
  state.attempts = applyRequirementRevision(state.attempts, { revision, kind, affectedKeys });
}
