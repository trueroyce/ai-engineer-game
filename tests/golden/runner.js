// 黃金重播執行器：依 fixture 注入骰序與指定候選，逐回合操作引擎並逐欄斷言。
import assert from 'node:assert/strict';
import { createGame, submit } from '../../src/core/engine.js';
import { projectPlayerView } from '../../src/core/view.js';
import { exportAuditLog, replay } from '../../src/core/log.js';
import { send, injected } from '../helpers.js';

// 每一步：成功提交後，原封不動重送同一請求，必須回傳相同結果且狀態完全不變（R13）。
function ok(state, type, payload) {
  const out = send(state, type, payload);
  assert.equal(out.result.ok, true, `${type} 應成功：${JSON.stringify(out.result.error)}`);
  const again = submit(out.state, structuredClone(out.request));
  assert.equal(again.duplicate, true, `${type} 重送應判為重複`);
  assert.deepEqual(again.result, out.result, `${type} 重送結果須相同`);
  assert.deepEqual(again.state, out.state, `${type} 重送不得改變狀態`);
  return out.state;
}

function actualTags(actionEvent, notes) {
  const o = actionEvent.outcome;
  const tags = [...o.milestones];
  if (o.action === 'deliver') tags.push(o.delivered ? 'delivered' : 'rejected');
  if (o.action === 'verify' && o.success) tags.push(`revealed:${o.revealed}`);
  for (const n of notes) {
    if (n.kind === 'expired') tags.push('expired');
    if (n.kind === 'deadline') tags.push('deadline');
    if (n.kind === 'crash') tags.push('crash');
  }
  return tags.sort();
}

export function runGolden(fx, { uptoTurn = 18 } = {}) {
  let s = createGame({
    gameId: fx.name,
    rng: injected({
      success: fx.successDice,
      defect: fx.defectDice,
      card: [fx.opening.candidates, ...fx.levelDrafts.map((d) => d.candidates.map(([id]) => id))],
    }),
  });
  s = ok(s, 'setAttributes', { attributes: fx.attributes });
  assert.deepEqual(s.pendingDraft.candidates.map((c) => c.id), fx.opening.candidates);
  assert.equal(s.pendingDraft.designated, true, '開局候選須標為指定樣本');
  s = ok(s, 'chooseOpening', { cardIds: fx.opening.pick });
  const drafts = [...fx.levelDrafts];
  const rows = fx.turns.filter((r) => r.turn <= uptoTurn);

  for (const row of rows) {
    const at = `${fx.name} 第 ${row.turn} 回合`;
    assert.equal(s.turn, row.turn, `${at}：回合`);
    assert.equal(s.phase, 'turnStart', `${at}：階段`);
    if (row.accept) s = ok(s, 'accept', { projectId: row.accept });
    assert.equal(s.activeProject, row.project, `${at}：進行中專案`);

    s = ok(s, 'action', { action: row.action, toggles: row.toggles });
    const ev = s.events.at(-1);
    assert.equal(ev.action, row.action, `${at}：行動`);
    assert.equal(ev.cost, row.cost, `${at}：費用`);

    const sd = ev.dice.filter((d) => d.stream === 'success');
    if (row.s) {
      assert.deepEqual(sd.map((d) => [d.index, d.value]), [[row.s[0], row.s[1]]], `${at}：成功骰`);
      assert.equal(ev.p, row.s[2], `${at}：p`);
      assert.equal(ev.outcome.success, row.s[3], `${at}：成敗`);
    } else {
      assert.equal(sd.length, 0, `${at}：不應取成功骰`);
    }
    const hd = ev.dice.filter((d) => d.stream === 'defect');
    if (row.h) {
      assert.deepEqual(hd.map((d) => [d.index, d.value]), [[row.h[0], row.h[1]]], `${at}：秘密骰`);
      assert.equal(ev.q, row.h[2], `${at}：q`);
      assert.equal(ev.outcome.defectAdded, row.h[3], `${at}：是否新增缺陷`);
    } else {
      assert.equal(hd.length, 0, `${at}：不應取秘密骰`);
    }

    const notes = [...ev.notes];
    while (s.phase === 'levelDraft') {
      const d = drafts.shift();
      assert.ok(d, `${at}：出現 fixture 未記載的升級抽選`);
      assert.equal(d.turn, row.turn, `${at}：升級時點`);
      assert.deepEqual(s.pendingDraft.candidates.map((c) => [c.id, c.kind]), d.candidates, `${at}：升級候選與標示`);
      s = ok(s, 'chooseDraft', { choice: d.choice });
      notes.push(...s.events.at(-1).notes);
    }

    const p = s.projects[row.project];
    assert.deepEqual(
      { P: p.progress, H: p.hiddenDefects, K: p.knownDefects, B: p.preparationBonus, N: p.preparationUses },
      { P: row.P, H: row.H, K: row.K, B: row.B, N: row.N },
      `${at}：P/H/K/B/N`,
    );
    assert.deepEqual({ T: s.token, S: s.stress }, { T: row.T, S: row.S }, `${at}：T/S`);
    assert.deepEqual({ xp: s.xp, lv: s.level, score: s.score }, { xp: row.xp, lv: row.lv, score: row.score }, `${at}：XP/Lv/分`);
    assert.deepEqual(s.equipped.map((c) => [c.id, c.level]), row.tools, `${at}：工具`);
    const delivered = row.tags.includes('delivered');
    assert.equal(p.age, delivered ? row.age - 1 : row.age, `${at}：案齡（交付成功當回合不再加案齡）`);
    assert.deepEqual(actualTags(ev, notes), [...row.tags].sort(), `${at}：里程碑／退件／逾期標記`);

    const view = JSON.stringify(projectPlayerView(s));
    assert.doesNotMatch(view, /hiddenDefects|defectAdded|"defect"/, `${at}：玩家視圖不得含 H 或秘密骰`);
  }
  const remainingDrafts = drafts.filter((d) => d.turn <= uptoTurn);
  assert.deepEqual(remainingDrafts, [], `${fx.name}：有 fixture 記載的升級抽選沒有發生`);
  if (uptoTurn >= 18) assertFinal(fx, s);
  return s;
}

export function assertFinal(fx, s) {
  const f = fx.final;
  assert.equal(s.phase, 'ended', `${fx.name}：終局階段`);
  assert.deepEqual(
    { score: s.score, xp: s.xp, level: s.level, token: s.token, stress: s.stress, ending: s.ending.name, endReason: s.endReason },
    { score: f.score, xp: f.xp, level: f.level, token: f.token, stress: f.stress, ending: f.ending, endReason: f.endReason },
    `${fx.name}：終局`,
  );
  assert.deepEqual(s.equipped.map((c) => [c.id, c.level]), f.equipped, `${fx.name}：終局工具`);
  assert.deepEqual(Object.fromEntries(Object.entries(s.projects).map(([id, p]) => [id, p.status])), f.statuses, `${fx.name}：三案狀態`);
  assert.equal(s.rng.success.cursor, fx.successDice.length, `${fx.name}：成功骰全部用完、不多不少`);
  assert.equal(s.rng.defect.cursor, fx.defectDice.length, `${fx.name}：秘密骰全部用完、不多不少`);
  assert.equal(s.rng.card.cursor, 1 + fx.levelDrafts.length, `${fx.name}：卡候選抽取次數`);
  const replayed = replay(JSON.parse(JSON.stringify(exportAuditLog(s))));
  assert.deepEqual(replayed, s, `${fx.name}：匯出紀錄重播須深度相等`);
}
