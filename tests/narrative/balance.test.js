import test from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyMemory, decidePublicAction, fallbackIntent, runCohort, simulate } from '../../scripts/balance-narrative.mjs';

test('fixed balance cohort separates the two anchors without making beginner success impossible', () => {
  const report = runCohort();
  assert.deepEqual(report.cohort, { seeds: 200, policies: ['clarify-first', 'prototype-first'] });

  const fullIds = new Set(['E01', 'E02', 'E03', 'E06']);
  const fullRate = (templateId, policy) => {
    const rows = report.rows.filter((row) => row.templateId === templateId && (policy === 'combined' || row.policy === policy));
    return rows.filter((row) => fullIds.has(row.ending)).length / rows.length;
  };
  const ultimateFull = fullRate('ultimate', 'combined');
  const beginnerFull = fullRate('beginner', 'combined');
  assert.ok(ultimateFull >= 0.8, `ultimate full success ${ultimateFull}`);
  assert.ok(beginnerFull >= 0.25 && beginnerFull <= 0.45, `beginner full success ${beginnerFull}`);

  for (const templateId of ['analyst', 'balanced', 'builder', 'verifier']) {
    const middle = fullRate(templateId, 'combined');
    assert.ok(middle > beginnerFull, `${templateId} must beat beginner`);
    assert.ok(middle < ultimateFull, `${templateId} must remain below ultimate`);
  }

  for (const policy of report.cohort.policies) {
    assert.ok(fullRate('ultimate', policy) > 0.8, `${policy} ultimate should usually finish fully`);
    const beginnerPolicy = fullRate('beginner', policy);
    assert.ok(beginnerPolicy >= 0.25 && beginnerPolicy <= 0.45, `${policy} beginner should have a credible but demanding full route`);
  }
});

test('balance decision functions are limited to public view and own history', () => {
  const source = `${decidePublicAction} ${fallbackIntent}`;
  for (const hidden of ['functionState', 'eventDecisions', 'artifact.kind', 'evidence', 'knownIssues.some', 'seed']) {
    assert.doesNotMatch(source, new RegExp(hidden.replace('.', '\\.')));
  }
  assert.equal(createPolicyMemory().requirementAttempts, 0);
});

test('successful cohorts usually receive both mid-run selections before ending', () => {
  const report = runCohort();
  for (const templateId of Object.keys(report.summary)) {
    const combined = report.summary[templateId].combined;
    assert.ok(combined.threeSelectionRuns >= combined.completed * 0.8, `${templateId} card timing`);
  }
  const beginnerWins = report.rows.filter((row) => row.templateId === 'beginner' && row.completed);
  assert.ok(beginnerWins.some((row) => row.rewardWorkCounts.length === 2), 'beginner retains a reachable route with both rewards');
  assert.ok(report.rows.every((row) => row.distinctCards >= 1 && row.distinctCards <= 3));

  const completedWithBothRewards = report.rows.filter((row) => row.completed && row.rewardWorkCounts.length === 2);
  assert.ok(completedWithBothRewards.length > 0);
  for (const row of completedWithBothRewards) {
    assert.ok(
      row.workCount > row.rewardWorkCounts[1],
      `${row.templateId}/${row.seed}/${row.policy}/${row.ending}: reward 2 at ${row.rewardWorkCounts[1]} but ended at ${row.workCount}`,
    );
  }
});

test('reported recovery route earns its second reward before later meaningful work', () => {
  const row = simulate('balance-007', 'ultimate', 'clarify-first');
  assert.equal(row.completed, true);
  assert.equal(row.rewardWorkCounts.length, 2);
  assert.ok(row.workCount > row.rewardWorkCounts[1], JSON.stringify(row));
});

test('no completed terminal route retains an unclaimable card reward', () => {
  const report = runCohort();
  const terminal = report.rows.filter((row) => row.phase === 'ended');
  assert.ok(terminal.length > 0);
  assert.ok(terminal.every((row) => row.pendingUpgrades.length === 0));

  const reportedLimited = simulate('balance-097', 'analyst', 'prototype-first');
  assert.equal(reportedLimited.ending, 'E04');
  assert.equal(reportedLimited.xp, 5);
  assert.deepEqual(reportedLimited.claimedThresholds, [2]);
  assert.deepEqual(reportedLimited.pendingUpgrades, []);
});
