// progression：每案里程碑 XP、等級門檻、跨門檻觸發抽選（R08）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelForXp } from '../src/core/engine.js';
import { ok, fail, startedGame, patch } from './helpers.js';

const POOL3 = ['C1', 'C3', 'C4'];
function j1({ success = [], defect = [], setup = () => {}, levelDrafts = [POOL3, POOL3] } = {}) {
  return patch(ok(startedGame({ success, defect, levelDrafts }), 'accept', { projectId: 'J1' }), setup);
}
const act = (s, action, toggles = {}) => ok(s, 'action', { action, toggles });
const last = (s) => s.events.at(-1);

test('半程與滿值同動作可同領：J1 P1 趕工成功到 4 → XP+2', () => {
  const s = act(j1({ success: [1], defect: [100], setup: (x) => { x.projects.J1.progress = 1; } }), 'rush');
  assert.equal(s.projects.J1.progress, 4);
  assert.equal(s.xp, 2);
  assert.deepEqual([s.projects.J1.halfXpGranted, s.projects.J1.fullXpGranted], [true, true]);
  assert.deepEqual(last(s).outcome.milestones, ['half', 'full']);
});

test('半程門檻 ceil(目標/2)：J1=2、J2=3、J3=4', () => {
  const a = act(j1({ success: [1], defect: [100] }), 'implement');
  assert.equal(a.xp, 1);
  let j2 = patch(ok(startedGame({ success: [1, 1], defect: [100, 100] }), 'accept', { projectId: 'J2' }), () => {});
  j2 = act(j2, 'implement');
  assert.equal(j2.xp, 0, 'J2 P2 未達半程 3');
  j2 = act(j2, 'implement');
  assert.equal(j2.xp, 1, 'J2 P4 跨半程 3');
  let j3 = patch(ok(startedGame({ success: [1], defect: [100] }), 'accept', { projectId: 'J3' }), (x) => { x.projects.J3.progress = 2; });
  j3 = act(j3, 'implement');
  assert.equal(j3.xp, 1, 'J3 P4 達半程 4');
});

test('失敗推進也能拿里程碑：J1 P1 普通實作失敗 P2 → 半程 XP', () => {
  const s = act(j1({ success: [100], defect: [100], setup: (x) => { x.projects.J1.progress = 1; } }), 'implement');
  assert.equal(s.xp, 1);
});

test('R08 品質 XP：首次成功驗證給 1（定位 0 個也給）；之後交付只給交付 XP2', () => {
  let s = act(j1({ success: [1], setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.halfXpGranted = true; x.projects.J1.fullXpGranted = true; } }), 'verify');
  assert.equal(s.xp, 1);
  assert.equal(s.projects.J1.qualityXpGranted, true);
  s = act(s, 'deliver');
  assert.equal(s.xp, 3);
  assert.deepEqual(last(s).outcome.milestones, ['delivery']);
});

test('R08 直接乾淨交付：同時得品質 XP1 與交付 XP2', () => {
  const s = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.halfXpGranted = true; x.projects.J1.fullXpGranted = true; } }), 'deliver');
  assert.equal(s.xp, 3);
  assert.deepEqual(last(s).outcome.milestones, ['quality', 'delivery']);
});

test('驗證失敗不給品質 XP；退件不給 XP', () => {
  const v = act(j1({ success: [100], setup: (x) => { x.projects.J1.progress = 1; } }), 'verify');
  assert.equal(v.xp, 0);
  const d = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.hiddenDefects = 1; x.projects.J1.halfXpGranted = true; x.projects.J1.fullXpGranted = true; } }), 'deliver');
  assert.equal(d.xp, 0);
});

test('R08 修復成功不給 XP；里程碑旗標只觸發一次', () => {
  const r = act(j1({ success: [1], setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.knownDefects = 1; x.projects.J1.halfXpGranted = true; x.projects.J1.fullXpGranted = true; } }), 'repair');
  assert.equal(r.xp, 0);
  let s = act(j1({ success: [1, 1], defect: [100, 100] }), 'implement');
  assert.equal(s.xp, 1);
  s = act(s, 'implement');
  assert.equal(s.xp, 2, '只加滿值，不重領半程');
  const twiceVerify = act(act(j1({ success: [1, 1], setup: (x) => { x.projects.J1.progress = 1; } }), 'verify'), 'verify');
  assert.equal(twiceVerify.xp, 1, '品質 XP 只給一次');
});

test('等級門檻：XP 跨 3 升 Lv2，不補資源、不降壓、不改能力，只觸發一次抽選', () => {
  const s0 = j1({ setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.halfXpGranted = true; x.projects.J1.fullXpGranted = true; x.token = 7; x.stress = 5; } });
  const s = act(s0, 'deliver');
  assert.deepEqual([s.xp, s.level], [3, 2]);
  assert.deepEqual(s.attributes, s0.attributes);
  assert.equal(s.token, 13, '只有交付報酬 +6');
  assert.equal(s.stress, 5);
  assert.equal(s.phase, 'levelDraft');
  assert.equal(s.pendingDraft.source, 'levelUp');
  assert.equal(s.pendingLevelUps, 0, '本門檻抽選已開出');
  assert.equal(s.rng.card.cursor, 2);
});

test('Lv4 封頂：XP 9 之後再得 XP 不再升級、不觸發抽選', () => {
  const s = act(j1({ success: [1], defect: [100], setup: (x) => { x.xp = 9; x.level = 4; } }), 'implement');
  assert.deepEqual([s.xp, s.level], [10, 4]);
  assert.notEqual(s.phase, 'levelDraft');
  assert.equal(s.rng.card.cursor, 1);
});

test('等級計算一般化：levelForXp 與跨門檻數（5→9 跨 2；T3 單一動作至多 +3，此為規則一般性）', () => {
  assert.deepEqual([0, 2, 3, 5, 6, 8, 9, 15].map(levelForXp), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(levelForXp(9) - levelForXp(5), 2);
});

test('R08 多次升級依序處理：第二次抽選在第一次選完後才抽，候選池依新持有計算', () => {
  // 注入狀態：已有 1 次排隊中的升級（模擬同一結算跨兩門檻），本次普通實作 P3→4 滿值 +1：XP5→6 再跨一門檻。
  let s = j1({
    levelDrafts: [['C1', 'C3', 'C4'], ['C1', 'C3', 'C6']],
    success: [1],
    defect: [100],
    setup: (x) => {
      x.projects.J1.progress = 3;
      x.projects.J1.halfXpGranted = true;
      x.xp = 5;
      x.level = 2;
      x.pendingLevelUps = 1;
    },
  });
  s = act(s, 'implement');
  assert.deepEqual([s.xp, s.level, s.phase], [6, 3, 'levelDraft']);
  assert.equal(s.pendingLevelUps, 1, '第二次抽選排隊中，尚未抽');
  assert.equal(s.rng.card.cursor, 2, '只抽了第一組');
  assert.deepEqual(s.pendingDraft.candidates.map((c) => c.id), ['C1', 'C3', 'C4']);
  s = ok(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C1' } });
  assert.equal(s.phase, 'levelDraft');
  assert.equal(s.pendingLevelUps, 0);
  assert.equal(s.rng.card.cursor, 3);
  assert.deepEqual(s.pendingDraft.candidates.map((c) => [c.id, c.level, c.kind]), [['C1', 2, 'upgrade'], ['C3', 1, 'new'], ['C6', 1, 'new']]);
});

test('抽選未完成時提交主要行動 → 拒絕', () => {
  const s = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.halfXpGranted = true; x.projects.J1.fullXpGranted = true; } }), 'deliver');
  assert.equal(s.phase, 'levelDraft');
  fail(s, 'action', { action: 'rest', toggles: {} }, 'draft_pending');
  fail(s, 'accept', { projectId: 'J2' }, 'draft_pending');
});

test('已得 XP 不因之後逾期而扣除', () => {
  // J1 案齡 5（第 6 動作）普通實作推進領 XP，未交付 → 回合結束逾期
  let s = j1({ success: [1], defect: [100], setup: (x) => { x.projects.J1.age = 5; x.turn = 6; } });
  s = act(s, 'implement');
  assert.equal(s.projects.J1.status, 'expired');
  assert.equal(s.xp, 1);
});
