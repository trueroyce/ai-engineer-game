// 整局結算摘要與「兩個關鍵選擇」（design.md D7；requirements §3「升級與結算」）。
// 只讀玩家視圖事件；每個關鍵選擇附事件序號，可在事件紀錄中找到；不評價優劣。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settlementSummary } from '../src/core/summary.js';
import { projectPlayerView } from '../src/core/view.js';
import rush from './golden/rush-revised.fixture.js';
import careful from './golden/careful-revised.fixture.js';
import { runGolden } from './golden/runner.js';
import { ok, startedGame } from './helpers.js';

function summaryOf(state) {
  return settlementSummary(projectPlayerView(state));
}

test('careful_revised 結算：兩案交付、J3 未交付；關鍵選擇＝分數最高的交付（J2）與最後一次升級（C3 換 C2）', () => {
  const s = runGolden(careful, { uptoTurn: 18 });
  const sum = summaryOf(s);
  assert.equal(sum.ending.name, '穩定交付');
  assert.equal(sum.endReason, 'deadline');
  assert.equal(sum.score, 6);
  assert.deepEqual(sum.delivered.map((d) => [d.projectId, d.score, d.turn]), [['J1', 2, 6], ['J2', 4, 14]]);
  assert.deepEqual(sum.notDelivered.map((d) => [d.projectId, d.status, d.progress, d.target]), [['J3', 'active', 3, 8]]);
  assert.deepEqual(sum.final.equipped, [{ id: 'C5', level: 2 }, { id: 'C4', level: 1 }, { id: 'C3', level: 1 }]);
  assert.deepEqual([sum.final.token, sum.final.stress, sum.final.xp, sum.final.level], [0, 6, 10, 4]);
  assert.equal(sum.keyChoices.length, 2);
  const [k1, k2] = sum.keyChoices;
  const ev1 = s.events.find((e) => e.seq === k1.seq);
  assert.equal(ev1.action, 'deliver');
  assert.equal(ev1.before.activeProject, 'J2');
  assert.match(k1.text, /^#\d+ 第 14 回合交付 J2 資料整合，分數 \+4/);
  const ev2 = s.events.find((e) => e.seq === k2.seq);
  assert.equal(ev2.type, 'chooseDraft');
  assert.match(k2.text, /第 14 回合升級：取得 C3 測試助手 L1，替換 C2/);
});

test('rush_revised 結算：唯一交付 J1、J2 逾期、J3 未交付；第二個關鍵選擇是第 16 回合放棄獎勵', () => {
  const s = runGolden(rush, { uptoTurn: 18 });
  const sum = summaryOf(s);
  assert.deepEqual(sum.delivered.map((d) => d.projectId), ['J1']);
  assert.deepEqual(sum.notDelivered.map((d) => [d.projectId, d.status]), [['J2', 'expired'], ['J3', 'active']]);
  assert.match(sum.keyChoices[0].text, /第 3 回合交付 J1 待辦工具，分數 \+2/);
  assert.match(sum.keyChoices[1].text, /第 16 回合升級：放棄本次獎勵/);
});

test('沒有交付時：第一個關鍵選擇改為最後一次退件或逾期；沒有升級時：崩潰的行動', () => {
  let s = ok(startedGame({ success: [100, 100, 100, 100], defect: [1, 1, 1, 1] }), 'accept', { projectId: 'J1' });
  for (let i = 0; i < 4; i++) s = ok(s, 'action', { action: 'rush', toggles: {} });
  s = ok(s, 'action', { action: 'deliver', toggles: {} });
  s = ok(s, 'action', { action: 'deliver', toggles: {} });
  const sum = summaryOf(s);
  assert.equal(sum.ending.name, '壓力崩潰');
  assert.equal(sum.delivered.length, 0);
  // 第 6 回合的退件同時是崩潰事件，保留給第二項；第一項取第 5 回合的退件（原期望第 6 回合與「兩項不同事件」矛盾）。
  assert.match(sum.keyChoices[0].text, /第 5 回合交付 J1 待辦工具被退件/);
  assert.match(sum.keyChoices[1].text, /壓力達 10，崩潰/);
  assert.notEqual(sum.keyChoices[0].seq, sum.keyChoices[1].seq, '兩個關鍵選擇不得是同一事件');
});

test('沒有交付也沒有崩潰：逾期與壓力最高時的休息', () => {
  let s = ok(startedGame(), 'accept', { projectId: 'J1' });
  for (let i = 0; i < 6; i++) s = ok(s, 'action', { action: 'rest', toggles: {} });
  s = ok(s, 'earlySettle');
  const sum = summaryOf(s);
  assert.equal(sum.endReason, 'earlySettle');
  assert.match(sum.keyChoices[0].text, /第 6 回合 J1 待辦工具逾期/);
  assert.match(sum.keyChoices[1].text, /休息/);
});

test('完全沒有可引用事件時不編造：關鍵選擇為空陣列', () => {
  const s = ok(startedGame(), 'earlySettle');
  assert.deepEqual(summaryOf(s).keyChoices, []);
});

test('摘要只用玩家視圖：輸出不含 H 或秘密骰', () => {
  const s = runGolden(rush, { uptoTurn: 18 });
  assert.doesNotMatch(JSON.stringify(summaryOf(s)), /hiddenDefects|defectAdded|"defect"/);
});
