import test from 'node:test';
import assert from 'node:assert/strict';

import { createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { case02ActionArt } from '../../src/case-02/art.js';
import { renderCase02Board, renderCase02Ending, renderCase02Result } from '../../src/case-02/render-v2.js';
import { createCase03Game, performCase03Action } from '../../src/case-03/engine.js';
import { case03ActionArt } from '../../src/case-03/art.js';
import { renderCase03Board, renderCase03Ending, renderCase03Result } from '../../src/case-03/render-v2.js';
import { discoverLocalCoach, renderLocalCoachPanel } from '../../src/postgame/coach-ui.js';
import { renderEndingFacets } from '../../src/presentation/ending-stage.js';

test('case 02 board renders nine base action-specific comic scenes instead of one repeated icon', () => {
  const html = renderCase02Board(createCase02Game({ templateId: 'balanced' }));
  for (let index = 1; index <= 9; index += 1) {
    assert.match(html, new RegExp(`action-b${String(index).padStart(2, '0')}`));
  }
  assert.equal((html.match(/case02-art/g) ?? []).length, 9);
  assert.match(html, /THREE SOURCES \/ ONE TRUTH/);
});

test('case 03 board renders eight base client/NPC/contract scenes', () => {
  const html = renderCase03Board(createCase03Game({ templateId: 'balanced' }));
  for (let index = 1; index <= 8; index += 1) {
    assert.match(html, new RegExp(`action-c${String(index).padStart(2, '0')}`));
  }
  assert.equal((html.match(/case03-art/g) ?? []).length, 8);
  assert.match(html, /CLIENT → DESIGN → ENGINEERING/);
});

test('story route cards appear only when the current public state opens them', () => {
  const initial02 = createCase02Game({ templateId: 'beginner', eventRolls: [100, 1] });
  assert.doesNotMatch(renderCase02Board(initial02), /data-case02-action="B10"/);
  const failed02 = performCase02Action(initial02, 'B01', {
    idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export',
    operationId: 'ui-route-02', stateVersion: initial02.stateVersion,
  }).state;
  assert.match(renderCase02Board(failed02), /data-case02-action="B10"/);

  const initial03 = createCase03Game({ templateId: 'beginner', eventRolls: [100, 1] });
  assert.doesNotMatch(renderCase03Board(initial03), /data-case03-action="C09"/);
  const failed03 = performCase03Action(initial03, 'C01', {
    scope: 'full', operationId: 'ui-route-03', stateVersion: initial03.stateVersion,
  }).state;
  assert.match(renderCase03Board(failed03), /data-case03-action="C09"/);
});

test('case 02 and 03 action art carries named dialogue and three explicit outcome directions', () => {
  for (const [art, id] of [[case02ActionArt, 'B01'], [case03ActionArt, 'C01']]) {
    const good = art(id, 'good');
    const warn = art(id, 'warn');
    const bad = art(id, 'bad');
    assert.match(good, /actor-name/);
    assert.match(good, /actor-line/);
    assert.match(good, /tone-mark-good/);
    assert.match(warn, /tone-mark-warn/);
    assert.match(bad, /tone-mark-bad/);
    assert.notEqual(good, warn);
    assert.notEqual(warn, bad);
  }
});

test('case 02 and 03 result renderers expose friendly labels and outcome-specific panel classes', () => {
  const process = { player: '玩家', response: '對方', followUp: '追問', consequence: '後果' };
  const case02 = createCase02Game({ templateId: 'balanced' });
  case02.log.push({ actionId: 'B01' });
  const success02 = renderCase02Result(case02, { title: '成功', summary: '完成', process, attempt: { chance: 70, outcome: 'success', sequel: 1 } });
  const failure02 = renderCase02Result(case02, { title: '失敗', summary: '待補救', process, attempt: { chance: 70, outcome: 'failure', sequel: 1 } });
  assert.match(success02, /result-tone-good/);
  assert.match(success02, /結果 成功/);
  assert.doesNotMatch(success02, /結果 success/);
  assert.match(failure02, /result-tone-bad/);
  assert.match(failure02, /結果 未成功/);

  const case03 = createCase03Game({ templateId: 'balanced' });
  case03.log.push({ actionId: 'C01' });
  const success03 = renderCase03Result(case03, { title: '成功', summary: '完成', process, attempt: { chance: 70, outcome: 'success', sequel: 1 } });
  const partial03 = renderCase03Result(case03, { title: '部分成功', summary: '仍有代價', process, attempt: { chance: 70, outcome: 'partial', sequel: 1 } });
  assert.match(success03, /result-tone-good/);
  assert.match(success03, /結果 成功/);
  assert.match(partial03, /result-tone-warn/);
  assert.match(partial03, /結果 部分成功/);
});

test('ending badges are prominent visual objects and the coach is absent without capability', () => {
  const badges = renderEndingFacets([
    { id: 'token-rich', title: 'Token 守財奴', text: '金庫還有存貨。' },
    { id: 'on-time', title: '期限內完成', text: '時鐘尚未敲響。' },
  ]);
  assert.match(badges, /ending-badge-grid/);
  assert.match(badges, /<svg/);
  assert.match(badges, /Token 守財奴/);
  assert.equal(renderLocalCoachPanel(null), '');
});

test('static/public hosts do not probe localhost or render a local coach', async () => {
  let fetches = 0;
  const capability = await discoverLocalCoach({
    location: { hostname: 'trueroyce.github.io' },
    async fetch() { fetches += 1; throw new Error('must not fetch'); },
  });
  assert.equal(capability, null);
  assert.equal(fetches, 0);
});

test('case 02 and 03 ending renderers only expose coach actions when capability exists', () => {
  const coach = { available: true, analysis: null, saveStatus: '' };
  const settlement = { expGained: 4 };
  const case02 = createCase02Game({ templateId: 'balanced' });
  case02.phase = 'ended';
  case02.ending = { baseId: 'C02-STOP', title: '誠實止損', text: '留下可追溯交接。', playFacets: [] };
  const hidden02 = renderCase02Ending(case02, settlement, null);
  const shown02 = renderCase02Ending(case02, settlement, coach);
  assert.doesNotMatch(hidden02, /data-analyze-run/);
  assert.match(shown02, /data-analyze-run/);

  const case03 = createCase03Game({ templateId: 'balanced' });
  case03.phase = 'ended';
  case03.ending = { baseId: 'C03-STOP', title: '誠實止損', text: '留下可追溯交接。', playFacets: [] };
  const hidden03 = renderCase03Ending(case03, settlement, null);
  const shown03 = renderCase03Ending(case03, settlement, coach);
  assert.doesNotMatch(hidden03, /data-analyze-run/);
  assert.match(shown03, /data-analyze-run/);
});
