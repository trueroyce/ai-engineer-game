import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrativeGame } from '../../src/narrative/engine.js';
import { cardLevel, LIMITS } from '../../src/narrative/rules.js';
import {
  CAREER_STORAGE_KEY,
  careerLevelForExp,
  createCareer,
  decodeCareer,
  loadCareer,
  mergeCardReward,
  resetCareer,
  saveCareer,
  settleCase,
  toggleEquipped,
} from '../../src/career/state.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function career(templateId = 'balanced') {
  return createCareer({ careerId: 'career-12345678', templateId, now: '2026-10-26T00:00:00.000Z' });
}

function endedCase({ ledger = [], cards = { C1: 1 }, equipped = ['C1'], ending = 'E08' } = {}) {
  return {
    phase: 'ended',
    caseId: 'case-01',
    ledger,
    cards,
    equipped,
    ending: { baseId: ending },
  };
}

test('career v1 存於獨立 key，能 round-trip；重設只刪該 key', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated', 'keep');
  const original = career();
  const saved = saveCareer(original, storage, '2026-10-26T01:00:00.000Z');
  assert.equal(loadCareer(storage).status, 'ready');
  assert.deepEqual(loadCareer(storage).career, saved);
  assert.ok(storage.getItem(CAREER_STORAGE_KEY));
  resetCareer(storage);
  assert.equal(loadCareer(storage).status, 'empty');
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('未知版本或壞資料不會被猜測遷移，也不會在讀取時覆寫', () => {
  const storage = memoryStorage();
  const raw = '{"schemaVersion":"ai-engineer-game.career.v99","career":{}}';
  storage.setItem(CAREER_STORAGE_KEY, raw);
  assert.equal(loadCareer(storage).status, 'unsupported');
  assert.equal(storage.getItem(CAREER_STORAGE_KEY), raw);
  assert.equal(decodeCareer('{not-json').status, 'invalid');
});

test('重新選角色建立全新職涯，不繼承 EXP、卡庫或 ledger', () => {
  const old = career('ultimate');
  old.exp = 15; old.level = 4; old.cards = { C1: 2 }; old.equipped = ['C1']; old.rewardLedger = ['case-01:final_delivery'];
  const fresh = career('beginner');
  assert.equal(fresh.templateId, 'beginner');
  assert.equal(fresh.exp, 0);
  assert.deepEqual(fresh.cards, {});
  assert.deepEqual(fresh.rewardLedger, []);
});

test('EXP 曲線固定為 0/4/9/15，不會用案件內 2/5 門檻發職涯獎勵', () => {
  assert.deepEqual([0, 3, 4, 8, 9, 14, 15].map((xp) => careerLevelForExp(xp).level), [1, 1, 2, 2, 3, 3, 4]);
  const settled = settleCase(career(), endedCase({ ledger: ['prototype_attempted', 'implementation_started'] }));
  assert.equal(settled.expGained, 0);
  assert.equal(settled.career.exp, 0);
});

test('最多啟用三張；第四張留在卡庫，玩家可先停用再換裝', () => {
  let current = career();
  current.cards = { C1: 1, C2: 1, C3: 1, C4: 1 };
  current.equipped = ['C1', 'C2', 'C3'];
  assert.throws(() => toggleEquipped(current, 'C4'), /最多啟用 3 張/);
  current = toggleEquipped(current, 'C2');
  current = toggleEquipped(current, 'C4');
  assert.deepEqual(current.equipped, ['C1', 'C3', 'C4']);
  assert.equal(current.cards.C2, 1);
});

test('卡滿時新獎勵只收藏；重複卡融合不占新槽', () => {
  const full = career();
  full.cards = { C1: 1, C2: 1, C3: 1 };
  full.equipped = ['C1', 'C2', 'C3'];
  const collected = mergeCardReward(full, 'C4');
  assert.equal(collected.disposition, 'collected');
  assert.equal(collected.career.cards.C4, 1);
  assert.deepEqual(collected.career.equipped, ['C1', 'C2', 'C3']);
  const fused = mergeCardReward(collected.career, 'C2');
  assert.equal(fused.disposition, 'fused');
  assert.equal(fused.career.cards.C2, 2);
  assert.deepEqual(fused.career.equipped, ['C1', 'C2', 'C3']);
});

test('職涯案件開場保留卡庫/裝備，收藏卡不生效，短期資源按案重置', () => {
  const state = createNarrativeGame({
    seed: 'career-reset',
    templateId: 'balanced',
    selectedCards: ['C4'],
    careerCards: { C1: 1, C2: 2, C3: 1 },
    careerEquipped: ['C1', 'C3'],
  });
  assert.equal(state.token, LIMITS.token);
  assert.equal(state.stress, 0);
  assert.equal(state.timeLeft, LIMITS.deadline);
  assert.equal(state.cards.C2, 2);
  assert.equal(cardLevel(state, 'C2'), 0, '收藏但未啟用的卡不能暗中生效');
  assert.deepEqual(state.equipped, ['C1', 'C3', 'C4']);
});

test('同一 career milestone reward ID 只領一次，重玩只更新遊玩摘要', () => {
  const first = settleCase(career(), endedCase({
    ledger: ['requirements_clear', 'confirmed_spec', 'working_core', 'full_verification', 'final_delivery'],
    cards: { C1: 2, C4: 1 },
    equipped: ['C1', 'C4'],
    ending: 'E01',
  }), '2026-10-26T02:00:00.000Z');
  assert.equal(first.expGained, 6);
  assert.equal(first.career.level, 2);
  const replay = settleCase(first.career, endedCase({
    ledger: ['requirements_clear', 'confirmed_spec', 'working_core', 'full_verification', 'final_delivery'],
    cards: { C1: 2, C4: 1 },
    equipped: ['C1', 'C4'],
    ending: 'E01',
  }), '2026-10-26T03:00:00.000Z');
  assert.equal(replay.expGained, 0);
  assert.equal(replay.career.exp, 6);
  assert.equal(replay.career.completedCases['case-01'].plays, 2);
});
