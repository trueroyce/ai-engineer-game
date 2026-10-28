import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../../src/narrative/rules.js';
import { createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { createCase03Game, performCase03Action } from '../../src/case-03/engine.js';

const rolls = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
const aligned = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };
const loadouts = {
  plain: { cards: {}, equipped: [] },
  overclock: { cards: { C13: 2, C14: 2, C18: 2 }, equipped: ['C13', 'C14', 'C18'] },
};

function sampleCase02(templateId, kit) {
  return rolls.map((roll, index) => {
    const state = createCase02Game({ templateId, progressionV2: true, ...kit, eventRolls: [roll, 1] });
    return performCase02Action(state, 'B01', { ...aligned, operationId: `b-${templateId}-${index}`, stateVersion: state.stateVersion }).result.attempt.outcome;
  });
}

function sampleCase03(templateId, kit) {
  return rolls.map((roll, index) => {
    const state = createCase03Game({ templateId, progressionV2: true, ...kit, eventRolls: [roll, 1] });
    return performCase03Action(state, 'C01', { scope: 'full', operationId: `c-${templateId}-${index}`, stateVersion: state.stateVersion }).result.attempt.outcome;
  });
}

const useful = (outcomes) => outcomes.filter((outcome) => outcome !== 'failure').length;

test('六角色固定公開策略抽樣保留能力差異，強卡提高可用結果且沒有暗中動態加難', () => {
  for (const sampler of [sampleCase02, sampleCase03]) {
    const rows = Object.fromEntries(Object.keys(TEMPLATES).map((templateId) => [templateId, {
      plain: sampler(templateId, loadouts.plain),
      overclock: sampler(templateId, loadouts.overclock),
    }]));
    assert.ok(useful(rows.ultimate.plain) > useful(rows.beginner.plain));
    assert.ok(useful(rows.beginner.plain) > 0 && useful(rows.beginner.plain) < rolls.length);
    for (const row of Object.values(rows)) assert.ok(useful(row.overclock) >= useful(row.plain));
    assert.deepEqual(sampler('balanced', loadouts.plain), rows.balanced.plain, '相同角色、卡組與公開骰樣本不因職涯強度動態改難');
  }
});

test('融合強卡仍有界：抽樣同時保留成功、部分成功與失敗的可驗收分布', () => {
  for (const sampler of [sampleCase02, sampleCase03]) {
    const outcomes = sampler('beginner', loadouts.overclock);
    assert.ok(outcomes.includes('success') || outcomes.includes('partial'));
    assert.ok(outcomes.includes('failure'));
    assert.ok(new Set(outcomes).size >= 2);
  }
});
