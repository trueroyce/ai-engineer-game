import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRewardChoices, chooseRunReward, createRunProgression, openRewardChoices, recordRunProgress, redeemCardShards, starterChoicesForCareer } from '../../src/career/progression.js';
import { completeStarterSelection, createCareer, mergeCardReward } from '../../src/career/state-v2.js';

test('six unique progress keys unlock exactly two rewards at 2 and 4', () => {
  let state = createRunProgression();
  for (const key of ['a', 'b', 'b', 'c', 'd', 'e', 'f']) state = recordRunProgress(state, key).state;
  assert.equal(state.runExp, 6); assert.deepEqual(state.rewardMilestones.map((item) => item.status), ['ready', 'ready']);
  assert.deepEqual(state.progressKeys, ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('starter draw is deterministic and contains three unique cards', () => {
  const first = starterChoicesForCareer('career-starter-test');
  assert.equal(first.length, 3); assert.equal(new Set(first).size, 3); assert.deepEqual(starterChoicesForCareer('career-starter-test'), first);
});

test('reward choices exclude max cards and use persistent alternatives without empty choices', () => {
  const choices = buildRewardChoices({ cards: { C1: 2, C2: 2, C3: 2, C4: 1 }, pool: ['C1', 'C2', 'C3', 'C4'], slot: 1 });
  assert.equal(choices.length, 3); assert.equal(choices[0].cardId, 'C4'); assert.equal(choices.some((item) => ['C1', 'C2', 'C3'].includes(item.cardId)), false);
  const allMax = buildRewardChoices({ cards: { C1: 2, C2: 2 }, pool: ['C1', 'C2'], slot: 1 });
  assert.deepEqual(allMax.map((item) => item.kind), ['shard', 'shard', 'career-exp']);
});

test('a milestone choice is idempotent and a second milestone remains pending', () => {
  let state = createRunProgression(); state = recordRunProgress(recordRunProgress(state, 'a').state, 'b').state;
  const opened = openRewardChoices(state, { cards: {}, pool: ['C13', 'C14', 'C15'] });
  state = opened.state;
  const cards = {}; const first = chooseRunReward(state, { slot: 1, choiceId: opened.choices[0].id, cards });
  assert.equal(first.repeated, false); assert.equal(cards.C13, 1);
  const repeated = chooseRunReward(first.state, { slot: 1, choiceId: opened.choices[1].id, cards });
  assert.equal(repeated.repeated, true); assert.deepEqual(cards, { C13: 1 });
});

test('three shards fuse an eligible card, or convert to permanent EXP when all owned cards are max', () => {
  let career = completeStarterSelection(createCareer({ careerId: 'career-shards-a', templateId: 'balanced' }), 'C1').career;
  career.cardShards = 3;
  const fused = redeemCardShards(career, 'C1'); assert.equal(fused.kind, 'fusion'); assert.equal(fused.career.cards.C1, 2); assert.equal(fused.career.cardShards, 0);
  let maxed = createCareer({ careerId: 'career-shards-b', templateId: 'balanced' }); maxed = mergeCardReward(maxed, 'C1').career; maxed = mergeCardReward(maxed, 'C1').career; maxed.cardShards = 3;
  const exp = redeemCardShards(maxed); assert.equal(exp.kind, 'career-exp'); assert.equal(exp.career.exp, 2); assert.equal(exp.career.cardShards, 0);
});
