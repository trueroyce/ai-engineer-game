// 單案垂直切片（開發里程碑，非完整第一版）：J1 的固定輸入路線。
// 引擎仍是完整 T3 規則；切片只在 UI 限定 J1 並在 J1 結束後顯示單案結算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/engine.js';
import { projectPlayerView } from '../src/core/view.js';
import { exportAuditLog, replay } from '../src/core/log.js';
import { ok, injected } from './helpers.js';

function newSlice({ success, defect, card = [['C1', 'C2', 'C5', 'C4'], ['C4', 'C5', 'C1']] }) {
  let s = createGame({ gameId: 'slice', rng: injected({ success, defect, card }) });
  s = ok(s, 'setAttributes', { template: 'balanced' });
  s = ok(s, 'chooseOpening', { cardIds: ['C5', 'C2'] });
  return ok(s, 'accept', { projectId: 'J1' });
}
const act = (s, action, toggles = {}) => ok(s, 'action', { action, toggles });

test('切片交付路線：J1 實作 ×2 → 驗證 → 交付成功 → Lv2 抽選；可重播', () => {
  let s = newSlice({ success: [1, 1, 1], defect: [100, 100] });
  s = act(s, 'implement'); // P2，半程
  s = act(s, 'implement'); // P4，滿值
  s = act(s, 'verify'); // 定位 0，品質 XP → XP3 升 Lv2
  assert.equal(s.phase, 'levelDraft');
  s = ok(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C4' } });
  s = act(s, 'deliver');
  assert.equal(s.projects.J1.status, 'delivered');
  assert.deepEqual([s.score, s.xp, s.level, s.turn], [2, 5, 2, 5]);
  assert.equal(s.token, 18 - 3 - 3 - 2 + 6);
  assert.equal(s.activeProject, null);
  assert.deepEqual(replay(exportAuditLog(s)), s);
});

test('切片失敗路線（逾期）：J1 工期 6 用完未交付 → 逾期、S+1；已得 XP 保留', () => {
  let s = newSlice({ success: [100, 100, 100], defect: [100, 100, 100] });
  s = act(s, 'implement'); // 失敗 P1
  s = act(s, 'implement'); // 失敗 P2 → 半程 XP
  s = act(s, 'rest');
  s = act(s, 'rest');
  s = act(s, 'implement'); // 失敗 P3
  assert.equal(s.projects.J1.age, 5);
  s = act(s, 'rest'); // 第 6 個行動，回合結束逾期
  assert.equal(s.projects.J1.status, 'expired');
  assert.equal(s.turn, 7);
  assert.equal(s.xp, 1);
  assert.ok(s.events.at(-1).notes.some((n) => n.kind === 'expired'));
  assert.deepEqual(replay(exportAuditLog(s)), s);
});

test('切片失敗路線（崩潰）：J1 連續趕工後盲交退件 → S10 立即崩潰，優先於逾期', () => {
  // 趕工 A2：q=35；秘密骰 1 → 每次都留下隱藏缺陷。成功骰 100 → 每次失敗 P+1。
  let s = newSlice({ success: [100, 100, 100, 100], defect: [1, 1, 1, 1] });
  for (let i = 0; i < 4; i++) s = act(s, 'rush');
  assert.deepEqual([s.projects.J1.progress, s.stress, s.projects.J1.hiddenDefects], [4, 8, 4]);
  s = act(s, 'deliver'); // 退件 S9
  assert.equal(s.events.at(-1).outcome.message, '驗收未通過，仍有未定位問題。');
  assert.equal(s.stress, 9);
  s = act(s, 'deliver'); // 第 6 個行動：再退件 S10 → 崩潰（不處理逾期）
  assert.equal(s.phase, 'ended');
  assert.equal(s.endReason, 'crash');
  assert.equal(s.projects.J1.status, 'active');
  const view = JSON.stringify(projectPlayerView(s));
  assert.doesNotMatch(view, /hiddenDefects|defectAdded/);
  assert.deepEqual(replay(exportAuditLog(s)), s);
});
