// character-setup 規格情境（R01）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submit } from '../src/core/engine.js';
import { ok, fail, gameOnly, injected, send } from './helpers.js';

const card = [['C1', 'C2', 'C5', 'C4']];

test('初始局面：v0.3-T3、回合 1、T18、S0、分 0、XP0、Lv1、無卡、三案未接', () => {
  const s = createGame({ gameId: 'g', rng: injected({ card }) });
  assert.equal(s.ruleVersion, 'v0.3-T3');
  assert.equal(s.phase, 'characterSetup');
  assert.equal(s.stateVersion, 0);
  assert.equal(s.turn, 1);
  assert.deepEqual([s.token, s.stress, s.score, s.xp, s.level], [18, 0, 0, 0, 1]);
  assert.deepEqual(s.equipped, []);
  assert.equal(s.activeProject, null);
  for (const id of ['J1', 'J2', 'J3']) {
    assert.deepEqual(s.projects[id], {
      projectId: id, status: 'unaccepted', progress: 0, hiddenDefects: 0, knownDefects: 0, age: 0,
      preparationBonus: 0, preparationUses: 0, halfXpGranted: false, fullXpGranted: false,
      qualityXpGranted: false, deliveryRewardGranted: false, firstVerificationUsed: false,
    });
  }
  assert.equal(s.endReason, null);
});

test('R01 合法自由配點 A1/E2/V3 → 進入開局抽卡，抽 4 張', () => {
  const s = ok(createGame({ gameId: 'g', rng: injected({ card }) }), 'setAttributes', { attributes: { A: 1, E: 2, V: 3 } });
  assert.deepEqual(s.attributes, { A: 1, E: 2, V: 3 });
  assert.equal(s.attributeSource, 'custom');
  assert.equal(s.phase, 'openingDraft');
  assert.equal(s.pendingDraft.source, 'opening');
  assert.deepEqual(s.pendingDraft.candidates.map((c) => [c.id, c.level, c.kind]), [
    ['C1', 1, 'new'], ['C2', 1, 'new'], ['C5', 1, 'new'], ['C4', 1, 'new'],
  ]);
  assert.equal(s.pendingDraft.designated, true);
  assert.equal(s.rng.card.cursor, 1);
  assert.equal(s.stateVersion, 1);
});

test('R01 總和不為 6 → 拒絕，停在角色建立，三條游標不變', () => {
  const s0 = createGame({ gameId: 'g', rng: injected({ card }) });
  const out = fail(s0, 'setAttributes', { attributes: { A: 3, E: 3, V: 1 } }, 'invalid_attributes');
  assert.equal(out.state.phase, 'characterSetup');
  assert.deepEqual(gameOnly(out.state), gameOnly(s0));
  assert.deepEqual(out.state.rng, s0.rng);
  assert.match(out.result.error.message, /總和/);
});

test('R01 單項超出上下限 → 拒絕', () => {
  const s0 = createGame({ gameId: 'g', rng: injected({ card }) });
  fail(s0, 'setAttributes', { attributes: { A: 0, E: 3, V: 3 } }, 'invalid_attributes');
  fail(s0, 'setAttributes', { attributes: { A: 4, E: 1, V: 1 } }, 'invalid_attributes');
  fail(s0, 'setAttributes', { attributes: { A: 2, E: 2, V: 2.5 } }, 'invalid_attributes');
  fail(s0, 'setAttributes', { attributes: { A: 2, E: 2 } }, 'invalid_attributes');
});

test('四個模板：數值正確，且與同數值自由配點除來源標記外完全相同', () => {
  const expected = { balanced: [2, 2, 2], analyst: [3, 2, 1], sprinter: [1, 3, 2], verifier: [2, 1, 3] };
  for (const [template, [A, E, V]] of Object.entries(expected)) {
    const t = ok(createGame({ gameId: 'g', rng: injected({ card }) }), 'setAttributes', { template });
    const c = ok(createGame({ gameId: 'g', rng: injected({ card }) }), 'setAttributes', { attributes: { A, E, V } });
    assert.deepEqual(t.attributes, { A, E, V });
    assert.equal(t.attributeSource, `template:${template}`);
    const { attributeSource: _a, log: _l, operationResults: _o, events: et, ...tr } = t;
    const { attributeSource: _b, log: _m, operationResults: _p, events: ec, ...cr } = c;
    assert.deepEqual(tr, cr);
  }
  fail(createGame({ gameId: 'g', rng: injected({ card }) }), 'setAttributes', { template: 'nope' }, 'invalid_attributes');
});

test('配點只能在角色建立階段提交一次', () => {
  const s = ok(createGame({ gameId: 'g', rng: injected({ card }) }), 'setAttributes', { template: 'balanced' });
  fail(s, 'setAttributes', { template: 'analyst' }, 'wrong_phase');
});

test('新局重置且未指定亂數時使用新的隨機種子', () => {
  const a = createGame({});
  const b = createGame({});
  assert.equal(a.rng.success.kind, 'seeded');
  const seedsA = [a.rng.success.seed, a.rng.defect.seed, a.rng.card.seed];
  const seedsB = [b.rng.success.seed, b.rng.defect.seed, b.rng.card.seed];
  assert.notDeepEqual(seedsA, seedsB);
  assert.notEqual(a.gameId, b.gameId);
  assert.deepEqual([b.level, b.xp, b.token, b.stress, b.equipped.length], [1, 0, 18, 0, 0]);
});

test('請求缺 operationId 或型別不明 → invalid_request，不改狀態', () => {
  const s0 = createGame({ gameId: 'g', rng: injected({ card }) });
  const r1 = submit(s0,{ type: 'setAttributes', template: 'balanced', expectedStateVersion: 0 });
  assert.equal(r1.result.error.code, 'invalid_request');
  const r2 = send(s0, 'teleport');
  assert.equal(r2.result.error.code, 'invalid_request');
  assert.deepEqual(gameOnly(r2.state), gameOnly(s0));
});
