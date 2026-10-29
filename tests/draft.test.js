// tool-cards：開局抽 4 選 2（R02）。升級抽選情境另見本檔後半。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/engine.js';
import { projectPlayerView } from '../src/core/view.js';
import { ok, fail, gameOnly, injected } from './helpers.js';

function drafting(card = [['C1', 'C2', 'C5', 'C4']]) {
  return ok(createGame({ gameId: 'g', rng: injected({ card }) }), 'setAttributes', { template: 'balanced' });
}

test('R02 合法選擇：候選 C1/C2/C5/C4 選 C5＋C2 → 裝備兩張 L1、進入第 1 回合', () => {
  const s = ok(drafting(), 'chooseOpening', { cardIds: ['C5', 'C2'] });
  assert.deepEqual(s.equipped, [{ id: 'C5', level: 1 }, { id: 'C2', level: 1 }]);
  assert.equal(s.phase, 'turnStart');
  assert.equal(s.turn, 1);
  assert.equal(s.pendingDraft, null);
});

test('R02 非法選擇：同卡兩次、候選外、數量不為 2 → 拒絕，候選與游標不變', () => {
  const s0 = drafting();
  for (const cardIds of [['C5', 'C5'], ['C5', 'C3'], ['C5'], ['C5', 'C2', 'C1'], 'C5', undefined]) {
    const out = fail(s0, 'chooseOpening', { cardIds }, 'invalid_selection');
    assert.deepEqual(gameOnly(out.state), gameOnly(s0));
    assert.deepEqual(out.state.pendingDraft, s0.pendingDraft);
    assert.equal(out.state.rng.card.cursor, 1);
  }
});

test('R02 重新整理不重抽：讀取玩家視圖多次，候選相同，卡序列游標不前進', () => {
  const s0 = drafting();
  const v1 = projectPlayerView(s0);
  const v2 = projectPlayerView(s0);
  assert.deepEqual(v1.pendingDraft, v2.pendingDraft);
  assert.equal(s0.rng.card.cursor, 1);
});

test('種子模式開局：4 張不重複、皆 L1、皆來自六卡', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = ok(createGame({ gameId: 'g', rng: { success: { seed }, defect: { seed: seed + 1 }, card: { seed: seed + 2 } } }), 'setAttributes', { template: 'balanced' });
    const ids = s.pendingDraft.candidates.map((c) => c.id);
    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4);
    assert.ok(ids.every((id) => ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].includes(id)));
    assert.ok(s.pendingDraft.candidates.every((c) => c.level === 1 && c.kind === 'new'));
    assert.equal(s.pendingDraft.designated, false);
  }
});

test('開局選卡只能在開局抽卡階段提交；選完不能再選', () => {
  const s = ok(drafting(), 'chooseOpening', { cardIds: ['C5', 'C2'] });
  fail(s, 'chooseOpening', { cardIds: ['C1', 'C4'] }, 'wrong_phase');
});

// ---- 升級抽選（R08/R09）----
import { startedGame, patch, fail as reject } from './helpers.js';
import { createStream } from '../src/core/rng.js';

// 由交付觸發 Lv2 抽選：J1 P4、里程碑已領 → 交付 +3 XP（品質＋交付）跨 3。
function levelDraftAt({ equipped, levelDrafts, setup = () => {} }) {
  let s = ok(startedGame({ levelDrafts }), 'accept', { projectId: 'J1' });
  s = patch(s, (x) => {
    if (equipped) x.equipped = equipped;
    Object.assign(x.projects.J1, { progress: 4, halfXpGranted: true, fullXpGranted: true });
    setup(x);
  });
  s = ok(s, 'action', { action: 'deliver', toggles: {} });
  assert.equal(s.phase, 'levelDraft');
  return s;
}

test('升級候選標示「新工具」或「現有工具升級」，級別依當時持有計算', () => {
  const s = levelDraftAt({ levelDrafts: [['C4', 'C5', 'C1']] });
  assert.deepEqual(s.pendingDraft.candidates, [
    { id: 'C4', level: 1, kind: 'new' },
    { id: 'C5', level: 2, kind: 'upgrade' },
    { id: 'C1', level: 1, kind: 'new' },
  ]);
  assert.equal(s.pendingDraft.source, 'levelUp');
});

test('已持有 L2 的卡不入池：種子抽樣下 C4 L2 永不出現', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let s = ok(startedGame(), 'accept', { projectId: 'J1' });
    s = patch(s, (x) => {
      x.rng.card = createStream({ seed });
      x.equipped = [{ id: 'C4', level: 2 }, { id: 'C5', level: 1 }];
      Object.assign(x.projects.J1, { progress: 4, halfXpGranted: true, fullXpGranted: true });
    });
    s = ok(s, 'action', { action: 'deliver', toggles: {} });
    const ids = s.pendingDraft.candidates.map((c) => c.id);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.ok(!ids.includes('C4'), `seed ${seed} 抽到 C4 L2：${ids}`);
  }
});

test('指定候選含 L2 卡 → 視為不合法指定樣本（程式錯誤）', () => {
  let s = ok(startedGame({ levelDrafts: [['C4', 'C1', 'C3']] }), 'accept', { projectId: 'J1' });
  s = patch(s, (x) => {
    x.equipped = [{ id: 'C4', level: 2 }];
    Object.assign(x.projects.J1, { progress: 4, halfXpGranted: true, fullXpGranted: true });
  });
  assert.throws(() => ok(s, 'action', { action: 'deliver', toggles: {} }), /指定候選不合法/);
});

test('選升級：只把該卡升為 L2', () => {
  let s = levelDraftAt({ levelDrafts: [['C4', 'C5', 'C1']] });
  s = ok(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C5' } });
  assert.deepEqual(s.equipped, [{ id: 'C5', level: 2 }, { id: 'C2', level: 1 }]);
  assert.equal(s.pendingDraft, null);
  assert.equal(s.phase, 'turnStart');
});

test('選新卡且有空槽：直接裝 L1', () => {
  let s = levelDraftAt({ levelDrafts: [['C4', 'C5', 'C1']] });
  s = ok(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C4' } });
  assert.deepEqual(s.equipped, [{ id: 'C5', level: 1 }, { id: 'C2', level: 1 }, { id: 'C4', level: 1 }]);
});

test('有空槽時不得指定替換', () => {
  const s = levelDraftAt({ levelDrafts: [['C4', 'C5', 'C1']] });
  reject(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C4', replace: 'C2' } }, 'invalid_selection');
});

test('R08/R09 超槽與滿槽換卡：滿槽選新卡必須同一操作指定替換，否則拒絕；被換卡效果立即移除', () => {
  const full = [{ id: 'C5', level: 2 }, { id: 'C2', level: 1 }, { id: 'C4', level: 1 }];
  const s = levelDraftAt({ equipped: full, levelDrafts: [['C3', 'C6', 'C2']] });
  reject(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C3' } }, 'invalid_selection');
  reject(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C3', replace: 'C1' } }, 'invalid_selection');
  const after = ok(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C3', replace: 'C2' } });
  assert.deepEqual(after.equipped, [{ id: 'C5', level: 2 }, { id: 'C4', level: 1 }, { id: 'C3', level: 1 }]);
  assert.equal(after.events.at(-1).outcome.replaced, 'C2');
});

test('滿槽選升級不需替換', () => {
  const full = [{ id: 'C5', level: 1 }, { id: 'C2', level: 1 }, { id: 'C4', level: 1 }];
  const s = levelDraftAt({ equipped: full, levelDrafts: [['C3', 'C6', 'C2']] });
  const after = ok(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C2' } });
  assert.deepEqual(after.equipped, [{ id: 'C5', level: 1 }, { id: 'C2', level: 2 }, { id: 'C4', level: 1 }]);
  reject(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C2', replace: 'C5' } }, 'invalid_selection');
});

test('R09 被替換卡回到未持有，之後再抽到時為 L1 新工具', () => {
  const full = [{ id: 'C5', level: 1 }, { id: 'C2', level: 2 }, { id: 'C4', level: 1 }];
  let s = levelDraftAt({ equipped: full, levelDrafts: [['C3', 'C6', 'C1'], ['C2', 'C6', 'C1']] });
  s = ok(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C3', replace: 'C2' } });
  // 下一次升級：注入狀態直接交付另一案以跨 6
  s = patch(s, (x) => {
    x.phase = 'turnStart';
    x.turnWindow = { accepted: false, abandoned: false };
    x.xp = 5;
    x.activeProject = 'J2';
    Object.assign(x.projects.J2, { status: 'active', progress: 6, halfXpGranted: true, fullXpGranted: true });
  });
  s = ok(s, 'action', { action: 'deliver', toggles: {} });
  assert.deepEqual(s.pendingDraft.candidates[0], { id: 'C2', level: 1, kind: 'new' });
});

test('R08/R09 放棄獎勵：裝備與 XP 不變、不重抽、不折現，遊戲繼續', () => {
  const s = levelDraftAt({ levelDrafts: [['C4', 'C5', 'C1']] });
  const after = ok(s, 'chooseDraft', { choice: { type: 'forfeit' } });
  assert.deepEqual(after.equipped, s.equipped);
  assert.equal(after.xp, s.xp);
  assert.equal(after.token, s.token);
  assert.equal(after.rng.card.cursor, s.rng.card.cursor);
  assert.equal(after.phase, 'turnStart');
});

test('非法升級選擇：候選外、缺 choice → 拒絕，候選不變', () => {
  const s = levelDraftAt({ levelDrafts: [['C4', 'C5', 'C1']] });
  for (const choice of [{ type: 'take', cardId: 'C6' }, undefined, { type: 'swap' }]) {
    const out = reject(s, 'chooseDraft', { choice }, 'invalid_selection');
    assert.deepEqual(out.state.pendingDraft, s.pendingDraft);
  }
});

test('升級抽選重新顯示不重抽', () => {
  const s = levelDraftAt({ levelDrafts: [['C4', 'C5', 'C1']] });
  assert.deepEqual(projectPlayerView(s).pendingDraft, projectPlayerView(s).pendingDraft);
  assert.equal(s.rng.card.cursor, 2);
});

test('沒有抽選時不能 chooseDraft', () => {
  reject(startedGame(), 'chooseDraft', { choice: { type: 'forfeit' } }, 'wrong_phase');
});
