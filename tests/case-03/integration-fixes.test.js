import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createNarrativeGame } from '../../src/narrative/engine.js';
import { createCareer, settleCase } from '../../src/career/state.js';
import { CASE02_REWARD_POOL } from '../../src/case-02/rules.js';
import { createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { CASE03_REWARD_POOL } from '../../src/case-03/rules.js';
import { createCase03Game, performCase03Action } from '../../src/case-03/engine.js';
import { renderCase03Result } from '../../src/case-03/render.js';

function action(state, id, options, operationId = `${id}-${state.stateVersion}`) {
  return performCase02Action(state, id, { ...options, operationId, stateVersion: state.stateVersion });
}

test('三張擴充卡帶回案件 01 不占有效槽，開場 C1 可啟用且卡庫保留', () => {
  const game = createNarrativeGame({
    seed: 'case01-expansion-loadout', templateId: 'balanced',
    careerCards: { C7: 1, C8: 1, C9: 1 }, careerEquipped: ['C7', 'C8', 'C9'], selectedCards: ['C1'],
  });
  assert.deepEqual(game.equipped, ['C1']);
  assert.equal(game.cards.C7, 1);
  assert.equal(game.cards.C8, 1);
  assert.equal(game.cards.C9, 1);
  game.phase = 'ended';
  game.ending = { baseId: 'E08' };
  const career = createCareer({ careerId: 'career-loadout-test', templateId: 'balanced' });
  career.cards = { C7: 1, C8: 1, C9: 1 };
  career.equipped = ['C7', 'C8', 'C9'];
  const settled = settleCase(career, game).career;
  assert.deepEqual(settled.equipped, ['C7', 'C8', 'C9']);
  assert.equal(settled.cards.C1, 1);
});

test('案件 02 全池滿級且 B03 失敗仍顯示 +2 Token，重送不重領', () => {
  const cards = Object.fromEntries(CASE02_REWARD_POOL.map((id) => [id, 2]));
  let state = createCase02Game({ templateId: 'balanced', cards, equipped: ['C7', 'C8', 'C9'], eventRolls: [1, 1, 100] });
  state = action(state, 'B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' }).state;
  state = action(state, 'B02', { strategy: 'solo', useRapid: false }).state;
  const request = { useFastMerge: false, operationId: 'failed-full-pool', stateVersion: state.stateVersion };
  const first = performCase02Action(state, 'B03', request);
  assert.match(first.result.process.consequence, /改領 2 Token/);
  const token = first.state.token;
  const cached = performCase02Action(first.state, 'B03', request);
  assert.equal(cached.cached, true);
  assert.equal(cached.state.token, token);
  assert.equal(cached.state.rewardClaims.filter((id) => id === 'reward:integration-kit').length, 1);
});

test('大廳與案件 01 明示卡片適用案件及不适用槽位規則', async () => {
  const [lobby, case01] = await Promise.all([
    readFile(new URL('../../src/career/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/narrative-ui/render.js', import.meta.url), 'utf8'),
  ]);
  assert.match(lobby, /適用案件 02、03/);
  assert.match(lobby, /適用案件 01、02/);
  assert.match(case01, /不生效、不占本案槽位/);
  assert.match(case01, /完整保留在職涯卡庫/);
});
