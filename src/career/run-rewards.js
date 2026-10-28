import { CARDS, cardApplies } from './cards.js';
import { chooseRunReward, createRunProgression, openRewardChoices, recordRunProgress } from './progression.js';

const clone = (value) => structuredClone(value);

export function rewardPoolForCase(caseId) {
  return Object.keys(CARDS).filter((id) => cardApplies(id, caseId));
}

export function initializeRunRewards(state) {
  state.progression ??= createRunProgression();
  state.careerRewards ??= [];
  return syncPendingReward(state);
}

export function syncPendingReward(state) {
  if (!state.progression?.pendingRewardSlot) {
    state.pendingReward = null;
    state.careerRewards = clone(state.progression?.careerRewards ?? state.careerRewards ?? []);
    return state;
  }
  const opened = openRewardChoices(state.progression, { cards: state.cards, pool: rewardPoolForCase(state.caseId) });
  state.progression = opened.state;
  state.pendingReward = {
    rewardId: `run:milestone-${opened.slot}`,
    slot: opened.slot,
    choices: opened.choices.map((choice) => choice.kind === 'card' ? choice.cardId : choice.id),
    options: opened.choices,
  };
  state.careerRewards = clone(state.progression.careerRewards);
  return state;
}

export function grantRunProgress(state, progressKey) {
  initializeRunRewards(state);
  const output = recordRunProgress(state.progression, progressKey);
  state.progression = output.state;
  syncPendingReward(state);
  return output.gained;
}

export function choosePendingRunReward(state, choiceId) {
  initializeRunRewards(state);
  const slot = state.pendingReward?.slot;
  if (!slot) throw new Error('目前沒有待選獎勵');
  const choice = state.progression.rewardChoices[slot]?.find((item) => item.id === choiceId || (item.kind === 'card' && item.cardId === choiceId));
  if (!choice) throw new Error('獎勵選項不合法');
  const output = chooseRunReward(state.progression, { slot, choiceId: choice.id, cards: state.cards });
  state.progression = output.state;
  state.careerRewards = clone(output.state.careerRewards);
  state.rewardClaims = [...new Set([...(state.rewardClaims ?? []), ...output.state.rewardClaims])];
  syncPendingReward(state);
  return output;
}
