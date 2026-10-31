import test from 'node:test';
import assert from 'node:assert/strict';

import { CASE03_REWARD_POOL } from '../../src/case-03/rules.js';
import { createCase03Game, performCase03Action, previewCase03Action } from '../../src/case-03/engine.js';
import { renderCase03Preview, renderCase03Result } from '../../src/case-03/render.js';

test('C8 Lv.0/1/2 下完整範圍固定比核心多 1 Token 與 1 時間，預覽等於實扣', () => {
  for (const cardLevel of [0, 1, 2]) {
    const cards = cardLevel ? { C8: cardLevel } : {};
    const equipped = cardLevel ? ['C8'] : [];
    const base = createCase03Game({ templateId: 'balanced', cards, equipped, eventRolls: [1] });
    const core = previewCase03Action(base, 'C01', { scope: 'core' });
    const full = previewCase03Action(base, 'C01', { scope: 'full' });
    assert.equal(full.token, core.token + 1);
    assert.equal(full.time, core.time + 1);
    for (const scope of ['core', 'full']) {
      const state = createCase03Game({ templateId: 'balanced', cards, equipped, eventRolls: [1] });
      const preview = previewCase03Action(state, 'C01', { scope });
      const html = renderCase03Preview(state, 'C01', { scope });
      assert.match(html, new RegExp(`<strong>-${preview.token}</strong>`));
      assert.match(html, new RegExp(`<strong>-${preview.time}</strong>`));
      const output = performCase03Action(state, 'C01', { scope, operationId: `c01-${scope}-${cardLevel}`, stateVersion: 0 });
      assert.equal(state.token - output.state.token, preview.token);
      assert.equal(state.timeLeft - output.state.timeLeft, preview.time);
      assert.match(output.result.summary, scope === 'core' ? /只確認核心預約/ : /誰能取消/);
    }
  }
});

test('案件 03 全池滿級在 C03 成功與失敗都明示 +2 Token，HTML 可見且重送不重領', () => {
  for (const implementationRoll of [1, 100]) {
    const cards = Object.fromEntries(CASE03_REWARD_POOL.map((id) => [id, 2]));
    let state = createCase03Game({ templateId: 'balanced', cards, equipped: ['C7', 'C8', 'C9'], eventRolls: [1, 1, implementationRoll] });
    const run = (id, options, operationId = `${id}-${state.stateVersion}`) => {
      const output = performCase03Action(state, id, { ...options, operationId, stateVersion: state.stateVersion });
      state = output.state;
      return output;
    };
    run('C01', { scope: 'full' });
    run('C02', { policy: 'explicit' });
    const operationId = `full-pool-${implementationRoll}`;
    const third = run('C03', { strategy: 'pair' }, operationId);
    assert.match(third.result.process.consequence, /改領 2 Token/);
    assert.match(renderCase03Result(state, third.result), /改領 2 Token/);
    assert.equal(state.rewardClaims.filter((id) => id === 'reward:handoff-kit').length, 1);
    const cached = performCase03Action(state, 'C03', { strategy: 'pair', operationId, stateVersion: state.stateVersion - 1 });
    assert.equal(cached.cached, true);
    assert.equal(cached.state.token, state.token);
  }
});
