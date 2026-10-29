// 端到端引擎測試（task 5.9）：種子模式（非注入）從配點到結算整局，策略只讀玩家可見資訊；
// 每一步檢查不變式；結束後匯出重播深度相等。崩潰局以注入序列達成。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submit, legalActions } from '../src/core/engine.js';
import { projectPlayerView } from '../src/core/view.js';
import { exportAuditLog, replay } from '../src/core/log.js';
import { RULES } from '../src/core/rules.js';
import { injected } from './helpers.js';

let n = 0;
function step(state, type, payload = {}) {
  const request = { operationId: `e2e-${++n}`, expectedStateVersion: state.stateVersion, type, ...payload };
  const out = submit(state, request);
  assert.equal(out.result.ok, true, `${type} ${JSON.stringify(payload)} 失敗：${JSON.stringify(out.result.error)}`);
  checkInvariants(state, out.state);
  return out.state;
}

function checkInvariants(prev, s) {
  assert.ok(s.token >= 0 && s.token <= RULES.token.cap, `Token 越界 ${s.token}`);
  assert.ok(s.stress >= 0, `壓力為負 ${s.stress}`);
  assert.ok(s.equipped.length <= RULES.slots, '超過 3 槽');
  assert.equal(new Set(s.equipped.map((c) => c.id)).size, s.equipped.length, '同卡重複持有');
  assert.ok(s.equipped.every((c) => c.level === 1 || c.level === 2));
  assert.ok(s.xp >= prev.xp, 'XP 減少');
  assert.ok(s.score >= prev.score, '分數減少');
  assert.equal(s.stateVersion, prev.stateVersion + 1);
  s.events.forEach((e, i) => assert.equal(e.seq, i + 1));
  assert.ok(s.turn >= 1 && s.turn <= RULES.totalTurns);
  const active = Object.values(s.projects).filter((p) => p.status === 'active' && s.activeProject === p.projectId);
  assert.ok(active.length <= 1, '一次至多一案');
  for (const p of Object.values(s.projects)) {
    assert.ok(p.progress >= 0 && p.progress <= RULES.projects[p.projectId].target);
    assert.ok(p.hiddenDefects >= 0 && p.knownDefects >= 0);
  }
}

// 只看玩家視圖與合法行動的固定策略（不讀 H、不讀未來骰）。
function play(state) {
  let s = state;
  let guard = 0;
  while (s.phase !== 'ended') {
    assert.ok(++guard < 200, '整局步數異常');
    const v = projectPlayerView(s);
    if (v.phase === 'levelDraft') {
      const c = v.pendingDraft.candidates[0];
      const choice = { type: 'take', cardId: c.id };
      if (c.kind === 'new' && v.equipped.length >= RULES.slots) choice.replace = v.equipped[0].id;
      s = step(s, 'chooseDraft', { choice });
      continue;
    }
    if (v.phase === 'turnStart' && !v.activeProject) {
      const next = Object.values(v.projects).find((p) => p.status === 'unaccepted');
      if (next) { s = step(s, 'accept', { projectId: next.projectId }); continue; }
    }
    const legal = Object.fromEntries(legalActions(s).map((x) => [x.action, x.legal]));
    const lastDeliver = [...v.events].reverse().find((e) => e.action === 'deliver' && e.before.activeProject === v.activeProject);
    const verifiedSince = lastDeliver && v.events.some((e) => e.seq > lastDeliver.seq && e.action === 'verify' && e.outcome.success);
    const needLocate = lastDeliver && !lastDeliver.outcome.delivered && !verifiedSince;
    let action = 'rest';
    if (v.stress >= 7) action = 'rest';
    else if (legal.repair) action = 'repair';
    else if (needLocate && legal.verify) action = 'verify';
    else if (legal.deliver) action = 'deliver';
    else if (legal.implement) action = 'implement';
    else if (legal.verify) action = 'verify';
    s = step(s, 'action', { action, toggles: {} });
  }
  return s;
}

const TEMPLATES = Object.keys(RULES.templates);

test('5.9 種子模式整局 ×40：配點→抽卡→三案→結算，不變式成立、可重播、結局合法', () => {
  const reasons = new Set();
  let delivered = 0;
  for (let seed = 1; seed <= 40; seed++) {
    let s = createGame({ gameId: `e2e-${seed}`, rng: { success: { seed: seed * 3 + 1 }, defect: { seed: seed * 3 + 2 }, card: { seed: seed * 3 + 3 } } });
    s = step(s, 'setAttributes', { template: TEMPLATES[seed % 4] });
    assert.equal(s.pendingDraft.designated, false, '種子模式不是指定樣本');
    s = step(s, 'chooseOpening', { cardIds: s.pendingDraft.candidates.slice(0, 2).map((c) => c.id) });
    s = play(s);
    assert.ok(['deadline', 'crash'].includes(s.endReason), s.endReason);
    reasons.add(s.endReason);
    delivered += Object.values(s.projects).filter((p) => p.status === 'delivered').length;
    if (s.endReason === 'deadline') assert.equal(s.turn, RULES.totalTurns);
    const expectedScore = Object.values(s.projects).filter((p) => p.status === 'delivered').reduce((t, p) => t + RULES.projects[p.projectId].rewardScore, 0);
    assert.equal(s.score, expectedScore, '分數＝已交付案報酬總和');
    assert.notEqual(s.score, 1);
    assert.deepEqual(replay(JSON.parse(JSON.stringify(exportAuditLog(s)))), s, `seed ${seed} 重播`);
  }
  assert.ok(reasons.has('deadline'), '至少一局正常期限結算');
  assert.ok(delivered > 0, '至少有交付發生');
});

test('5.9 種子模式提前結算：第 4 回合開始提前結算，只計已交付分數', () => {
  let s = createGame({ gameId: 'e2e-early', rng: { success: { seed: 7 }, defect: { seed: 8 }, card: { seed: 9 } } });
  s = step(s, 'setAttributes', { template: 'balanced' });
  s = step(s, 'chooseOpening', { cardIds: s.pendingDraft.candidates.slice(0, 2).map((c) => c.id) });
  s = step(s, 'accept', { projectId: 'J1' });
  for (let i = 0; i < 3 && s.phase !== 'ended'; i++) {
    if (s.phase === 'levelDraft') { s = step(s, 'chooseDraft', { choice: { type: 'forfeit' } }); i--; continue; }
    s = step(s, 'action', { action: 'rest', toggles: {} });
  }
  assert.equal(s.turn, 4);
  s = step(s, 'earlySettle');
  assert.deepEqual([s.phase, s.endReason, s.score, s.ending.name], ['ended', 'earlySettle', 0, '交件落空']);
  assert.deepEqual(replay(exportAuditLog(s)), s);
});

test('5.9 崩潰整局（注入序列）：S≥10 立即結束，之後一切提交被拒', () => {
  let s = createGame({ gameId: 'e2e-crash', rng: injected({ success: [100, 100, 100, 100, 100], defect: [100, 100, 100, 100, 100], card: [['C1', 'C2', 'C3', 'C4']] }) });
  s = step(s, 'setAttributes', { template: 'sprinter' });
  s = step(s, 'chooseOpening', { cardIds: ['C2', 'C3'] });
  s = step(s, 'accept', { projectId: 'J3' });
  // 趕工 ×5，開 C2 每次費 3（共 15 ≤ 18），每次 S+2 → 第 5 次 S10。（原寫不開 C2 需 20 Token，屬測試設定錯誤）
  for (let i = 0; i < 5; i++) s = step(s, 'action', { action: 'rush', toggles: { C2: true } });
  assert.deepEqual([s.phase, s.endReason, s.stress], ['ended', 'crash', 10]);
  const after = submit(s, { operationId: 'late', expectedStateVersion: s.stateVersion, type: 'action', action: 'rest', toggles: {} });
  assert.equal(after.result.error.code, 'game_ended');
  assert.deepEqual(replay(exportAuditLog(s)), s);
});
