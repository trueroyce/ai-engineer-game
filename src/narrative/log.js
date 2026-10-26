import { RULE_VERSION } from './rules.js';
import { createNarrativeGame, performAction, rest, chooseUpgrade } from './engine.js';

export const LOG_FORMAT = 'ai-engineer-game/narrative-log@1';

export function exportNarrativeLog(state) {
  return {
    format: LOG_FORMAT,
    ruleVersion: RULE_VERSION,
    seed: state.seed,
    templateId: state.templateId,
    abilities: structuredClone(state.abilities),
    selectedCards: state.openingDraw.filter((id) => state.cards[id]).slice(0, 2),
    entries: structuredClone(state.log),
    finalStateVersion: state.stateVersion,
  };
}

export function replayNarrative(log) {
  if (log.format !== LOG_FORMAT || log.ruleVersion !== RULE_VERSION) throw new Error('紀錄版本不符');
  let state = createNarrativeGame({ seed: log.seed, templateId: log.templateId, attrs: log.abilities, selectedCards: log.selectedCards });
  let n = 0;
  for (const entry of log.entries) {
    n += 1;
    if (entry.actionId === 'REST') state = rest(state, { operationId: `replay-${n}`, stateVersion: state.stateVersion }).state;
    else if (entry.actionId === 'UPGRADE') state = chooseUpgrade(state, entry.cardId);
    else {
      const options = { ...(entry.options ?? {}), operationId: `replay-${n}`, stateVersion: state.stateVersion };
      if (entry.eventId) options.designate = entry.eventId;
      if (entry.intent) options.intent = entry.intent;
      state = performAction(state, entry.actionId, options).state;
    }
  }
  return state;
}
