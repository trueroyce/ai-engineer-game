import test from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyMemory, decidePublicAction, fallbackIntent, runCohort, simulate } from '../../scripts/balance-narrative.mjs';

test('fixed balance cohort separates the two anchors without making beginner success impossible', () => {
  const report = runCohort();
  assert.deepEqual(report.cohort, { seeds: 200, policies: ['clarify-first', 'prototype-first'] });

  const ultimate = report.summary.ultimate.combined;
  const beginner = report.summary.beginner.combined;
  assert.ok(ultimate.completionRate >= 0.75, `ultimate completion ${ultimate.completionRate}`);
  assert.ok(ultimate.perfectRate >= 0.4, `ultimate perfect ${ultimate.perfectRate}`);
  assert.ok(beginner.completionRate >= 0.05 && beginner.completionRate <= 0.35, `beginner completion ${beginner.completionRate}`);
  assert.ok(beginner.perfectRate <= 0.15, `beginner perfect ${beginner.perfectRate}`);
  assert.ok(beginner.successfulSeeds.length > 0, 'beginner must retain reproducible successful routes');

  for (const templateId of ['analyst', 'balanced', 'builder', 'verifier']) {
    const middle = report.summary[templateId].combined;
    assert.ok(middle.completionRate > beginner.completionRate, `${templateId} must beat beginner`);
    assert.ok(middle.completionRate < ultimate.completionRate, `${templateId} must remain below ultimate`);
  }

  for (const policy of report.cohort.policies) {
    assert.ok(report.summary.ultimate[policy].completionRate > 0.5, `${policy} ultimate should usually finish`);
    assert.ok(report.summary.beginner[policy].completionRate < 0.4, `${policy} beginner remains hard`);
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
