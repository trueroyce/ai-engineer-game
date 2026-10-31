import test from 'node:test';
import assert from 'node:assert/strict';
import { applyIntegrationShield, applyMajorChangeEvidence, applySpendRefund, previewOverclockEffects } from '../../src/career/card-runtime.js';

test('C16 preview and runtime agree at Lv1/Lv2 and respect per-run caps', () => {
  const preview = previewOverclockEffects({ cards: { C16: 2 }, equipped: ['C16'], action: { tokenCost: 3 } });
  assert.equal(preview.effects[0].maxUses, 2);
  let state = { token: 4, cardUsage: {} };
  state = applySpendRefund(state, { cards: { C16: 2 }, equipped: ['C16'], tokenCost: 3 }).state;
  state = applySpendRefund(state, { cards: { C16: 2 }, equipped: ['C16'], tokenCost: 4 }).state;
  const third = applySpendRefund(state, { cards: { C16: 2 }, equipped: ['C16'], tokenCost: 3 });
  assert.equal(state.token, 6); assert.equal(third.refunded, 0);
});

test('C15 prevents one real integration debt, then stops', () => {
  let state = { integrationDebt: 0, cardUsage: {} };
  const first = applyIntegrationShield(state, { cards: { C15: 1 }, equipped: ['C15'], debt: 2 });
  assert.equal(first.prevented, 1); assert.equal(first.state.integrationDebt, 1);
  const second = applyIntegrationShield(first.state, { cards: { C15: 1 }, equipped: ['C15'], debt: 1 });
  assert.equal(second.prevented, 0); assert.equal(second.state.integrationDebt, 2);
});

test('C18 Lv2 and C15+C18 synergy preserve bounded indirect evidence, never direct evidence', () => {
  const state = { evidence: { contract: { ok: true }, tests: { ok: true }, audit: { ok: true } } };
  const radar = applyMajorChangeEvidence(state, { cards: { C18: 2 }, equipped: ['C18'], directKeys: ['contract'], indirectKeys: ['tests', 'audit'] });
  assert.equal(radar.state.evidence.contract, undefined); assert.deepEqual(radar.preserved, ['tests']); assert.equal(radar.state.evidence.audit, undefined);
  const combo = applyMajorChangeEvidence(state, { cards: { C15: 1, C18: 2 }, equipped: ['C15', 'C18'], directKeys: ['contract'], indirectKeys: ['tests', 'audit'] });
  assert.deepEqual(combo.preserved, ['tests', 'audit']); assert.equal(combo.state.evidence.contract, undefined);
});

test('all overclock effects appear only when applicable and disclose synergies', () => {
  const cards = { C13: 2, C15: 1, C16: 1, C17: 1, C18: 2 };
  const equipped = ['C13', 'C17', 'C18'];
  const retry = previewOverclockEffects({ cards, equipped, action: { kind: 'retry', isSequel: true } });
  assert.deepEqual(retry.effects.map((item) => item.cardId), ['C13', 'C17']); assert.deepEqual(retry.synergies, ['requirements-archaeologists']);
  const unrelated = previewOverclockEffects({ cards, equipped: [], action: { tokenCost: 4, addsIntegrationDebt: true } });
  assert.deepEqual(unrelated.effects, []);
});
