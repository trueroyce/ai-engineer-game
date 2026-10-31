import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseUpgrade, createNarrativeGame, decideEnding, isFullyVerified, performAction, previewDelivery, safeForTrial, upgradeChoices } from '../../src/narrative/engine.js';

let n = 0;
function act(s, id, extra = {}) { return performAction(s, id, { operationId: `c-${++n}`, stateVersion: s.stateVersion, ...extra }).state; }
function stateWithCards(cards, seed = 'cards') {
  const preview = createNarrativeGame({ seed });
  const selectedCards = preview.openingDraw.slice(0, 1);
  const s = createNarrativeGame({ seed, selectedCards });
  s.cards = { ...cards }; s.equipped = Object.keys(cards).slice(0, 3);
  return s;
}

test('開局固定抽三選一，後續兩次獎勵可填滿三張工具', () => {
  const a = createNarrativeGame({ seed: 'draw' });
  const b = createNarrativeGame({ seed: 'draw' });
  assert.equal(a.openingDraw.length, 3);
  assert.deepEqual(a.openingDraw, b.openingDraw);
  assert.equal(a.equipped.length, 1);
  assert.throws(() => createNarrativeGame({ seed: 'draw', selectedCards: a.openingDraw.slice(0, 2) }), /選一張/);
});

test('C2 省 Token 但不利事件仍可能增加，C4 不給修復 XP', () => {
  let s = stateWithCards({ C2: 1, C4: 1 }, 'tradeoff');
  const before = s.token;
  s = act(s, 'A05', { designate: 'A05-B', useC2: true });
  assert.equal(before - s.token, 1);
  const xpBefore = s.xp;
  s = act(s, 'A11', { designate: 'A11-A', mode: 'fix' });
  assert.equal(s.xp, xpBefore);
});

test('敘事 XP ledger 每個里程碑只給一次，2/5 觸發兩次工具三選一', () => {
  let s = createNarrativeGame({ seed: 'xp' });
  s = act(s, 'A01', { designate: 'A01-A' });
  s = act(s, 'A04', { designate: 'A04-A' });
  s = act(s, 'A05', { designate: 'A05-A' });
  assert.equal(s.xp, 4);
  assert.ok(s.pendingUpgrades.includes(2));
  const choices = upgradeChoices(s);
  assert.ok(choices.length >= 1 && choices.length <= 3);
  const time = s.timeLeft; const token = s.token;
  s = chooseUpgrade(s, choices[0]);
  assert.equal(s.timeLeft, time); assert.equal(s.token, token);
  s = act(s, 'A07', { designate: 'A07-A', target: 'persistence' });
  assert.ok(s.pendingUpgrades.includes(5));
});

test('第 12 次後才進加班，最多兩次，總工作硬上限 14', () => {
  let s = createNarrativeGame({ seed: 'limit' });
  s.token = 30; s.workCount = 11; s.timeLeft = 1;
  s = act(s, 'A05', { designate: 'A05-A' });
  assert.equal(s.workCount, 12); assert.equal(s.overtimeUsed, 0); assert.equal(s.timeLeft, 0);
  s = act(s, 'A05', { designate: 'A05-B', repairDraft: true });
  assert.equal(s.workCount, 13); assert.equal(s.overtimeUsed, 1);
  s = act(s, 'A05', { designate: 'A05-C', repairDraft: true });
  assert.equal(s.workCount, 14); assert.equal(s.overtimeUsed, 2);
  assert.throws(() => act(s, 'A05', { repairDraft: true }), /工作上限/);
});

function verified({ overtime = 0, repaired = false, scoped = false } = {}) {
  const s = createNarrativeGame({ seed: 'ending' });
  s.requirement.clarity = 'clear'; s.requirement.scope = 'bounded'; s.requirement.pendingQuestions = [];
  s.documents.draft = true; s.documents.confirmed = true;
  s.artifact = { ...s.artifact, kind: 'implementation', revision: 7 };
  for (const id of Object.keys(s.functionState)) {
    s.functionState[id] = 'correct';
    s.evidence[id] = { requirementId: id, artifactRevision: 7, result: 'pass' };
  }
  s.overtimeUsed = overtime; s.repairHistory = repaired; s.scopeNegotiated = scoped;
  return s;
}

test('八個主結局均由狀態與意圖可達，不靠最後一骰', () => {
  assert.equal(decideEnding(verified(), 'formal'), 'E01');
  assert.equal(decideEnding(verified({ scoped: true }), 'formal'), 'E02');
  assert.equal(decideEnding(verified({ repaired: true }), 'formal'), 'E03');
  const trial = verified(); trial.evidence.R4.result = 'fail'; trial.evidence.R5.result = 'not_run';
  assert.equal(safeForTrial(trial), true); assert.equal(decideEnding(trial, 'limited'), 'E04');
  const showcase = createNarrativeGame({ seed: 'show' }); showcase.artifact.visualDetour = true;
  assert.equal(decideEnding(showcase, 'showcase'), 'E05');
  assert.equal(decideEnding(verified({ overtime: 1 }), 'formal'), 'E06');
  const late = createNarrativeGame({ seed: 'late' }); late.timeLeft = 0;
  assert.equal(decideEnding(late, 'progress'), 'E07');
  assert.equal(decideEnding(createNarrativeGame({ seed: 'stop' }), 'stop'), 'E08');
  assert.equal(isFullyVerified(verified()), true);
});

test('五種結案意圖的預覽與提交共用同一判定，拒絕訊息不混用正式交付', () => {
  const formal = verified();
  const trial = verified(); trial.evidence.R4.result = 'fail'; trial.evidence.R5.result = 'not_run';
  const showcase = createNarrativeGame({ seed: 'delivery-showcase' }); showcase.artifact.kind = 'prototype'; showcase.artifact.visualDetour = true;
  const progress = createNarrativeGame({ seed: 'delivery-progress' }); progress.timeLeft = 0;
  const stop = createNarrativeGame({ seed: 'delivery-stop' });
  const cases = [
    [formal, 'formal', 'E01'],
    [trial, 'limited', 'E04'],
    [showcase, 'showcase', 'E05'],
    [progress, 'progress', 'E07'],
    [stop, 'stop', 'E08'],
  ];
  for (const [state, intent, endingId] of cases) {
    const preview = previewDelivery(state, intent);
    assert.deepEqual(preview, { intent, allowed: true, endingId, message: '' });
    const out = performAction(state, 'A12', { operationId: `delivery-${intent}`, stateVersion: state.stateVersion, intent });
    assert.equal(out.result.type, 'ending');
    assert.equal(out.state.ending.baseId, endingId);
  }

  const ordinaryPrototype = createNarrativeGame({ seed: 'delivery-showcase-blocked' });
  ordinaryPrototype.artifact.kind = 'prototype';
  const blocked = previewDelivery(ordinaryPrototype, 'showcase');
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message, /不是外觀偏題的展示原型/);
  assert.doesNotMatch(blocked.message, /正式交付/);
  const out = performAction(ordinaryPrototype, 'A12', {
    operationId: 'delivery-showcase-blocked', stateVersion: ordinaryPrototype.stateVersion, intent: 'showcase',
  });
  assert.equal(out.result.type, 'gap');
  assert.equal(out.result.intent, 'showcase');
  assert.equal(out.state.phase, 'playing');
  assert.equal(out.state.token, ordinaryPrototype.token);
  assert.equal(out.state.workCount, ordinaryPrototype.workCount);
});

test('same A11 failure after a paid repair retry is a fresh roll, not stale history cache', () => {
  let state = createNarrativeGame({ seed: 'repeat-3', templateId: 'balanced' });
  state = performAction(state, 'A05', {
    operationId: 'repeat-a05', stateVersion: state.stateVersion, designate: 'A05-B',
  }).state;
  const first = performAction(state, 'A11', {
    operationId: 'repeat-a11-1', stateVersion: state.stateVersion, mode: 'fix',
  });
  const second = performAction(first.state, 'A11', {
    operationId: 'repeat-a11-2', stateVersion: first.state.stateVersion, mode: 'fix', repairDraft: true,
  });
  assert.equal(first.result.event.id, 'A11-B');
  assert.equal(second.result.event.id, 'A11-B');
  assert.equal(first.cached, false);
  assert.equal(second.cached, false);
  assert.equal(second.state.artifact.revision, first.state.artifact.revision + 1);
  assert.equal(second.state.workCount, first.state.workCount + 1);
  assert.equal(second.state.token, first.state.token - 2);
  assert.notEqual(second.state.resolvedKeyByAction.A11, first.state.resolvedKeyByAction.A11);
});

test('所有八種終局都清除未選獎勵，終局 XP 不會再排入卡片選擇', () => {
  const trial = verified(); trial.evidence.R4.result = 'fail'; trial.evidence.R5.result = 'not_run';
  const showcase = createNarrativeGame({ seed: 'terminal-showcase' }); showcase.artifact.visualDetour = true;
  const late = createNarrativeGame({ seed: 'terminal-late' }); late.timeLeft = 0;
  const cases = [
    ['E01', verified(), 'formal'],
    ['E02', verified({ scoped: true }), 'formal'],
    ['E03', verified({ repaired: true }), 'formal'],
    ['E04', trial, 'limited'],
    ['E05', showcase, 'showcase'],
    ['E06', verified({ overtime: 1 }), 'formal'],
    ['E07', late, 'progress'],
    ['E08', createNarrativeGame({ seed: 'terminal-stop' }), 'stop'],
  ];
  for (const [endingId, original, intent] of cases) {
    original.xp = 5;
    original.claimedThresholds = [2];
    original.pendingUpgrades = [5];
    const out = performAction(original, 'A12', {
      operationId: `terminal-${endingId}`,
      stateVersion: original.stateVersion,
      intent,
    });
    assert.equal(out.state.ending.id, endingId);
    assert.equal(out.state.phase, 'ended');
    assert.deepEqual(out.state.pendingUpgrades, [], `${endingId} must not retain a card offer`);
  }

  const naturalTrial = verified();
  naturalTrial.evidence.R4.result = 'fail'; naturalTrial.evidence.R5.result = 'not_run';
  naturalTrial.xp = 4; naturalTrial.claimedThresholds = [2]; naturalTrial.pendingUpgrades = [];
  const limited = performAction(naturalTrial, 'A12', {
    operationId: 'terminal-e04-crosses-five',
    stateVersion: naturalTrial.stateVersion,
    intent: 'limited',
  });
  assert.equal(limited.state.xp, 5);
  assert.deepEqual(limited.state.claimedThresholds, [2]);
  assert.deepEqual(limited.state.pendingUpgrades, [], 'settlement XP must not enqueue an unclaimable reward');
});

test('正式交付不會隨機否決已驗證事實；證據不足只回缺口', () => {
  let s = verified();
  const done = performAction(s, 'A12', { operationId: 'deliver-ok', stateVersion: s.stateVersion, intent: 'formal' });
  assert.equal(done.result.ending.id, 'E01');
  s = createNarrativeGame({ seed: 'gap' });
  const gap = performAction(s, 'A12', { operationId: 'deliver-gap', stateVersion: 0, intent: 'formal' });
  assert.equal(gap.result.type, 'gap'); assert.equal(gap.state.phase, 'playing');
});
