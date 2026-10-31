import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseUpgrade,
  composeEnding,
  createNarrativeGame,
  openingChoices,
  performAction,
  previewAction,
  upgradeChoices,
} from '../../src/narrative/engine.js';
import { assertAttributes, TEMPLATES } from '../../src/narrative/rules.js';
import { EVENTS } from '../../src/narrative/content.js';
import { buildProcess, PROCESS_EVENT_IDS } from '../../src/narrative/process-story.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { renderIntro, renderPlay, renderResult, renderUpgrade } from '../../src/narrative-ui/render.js';

let serial = 0;
function act(state, actionId, options = {}) {
  return performAction(state, actionId, {
    ...options,
    operationId: `deep-${++serial}`,
    stateVersion: state.stateVersion,
  });
}

test('templates use hidden 1-10 attributes with real extreme anchors', () => {
  assert.equal(Object.keys(TEMPLATES).length, 6);
  assert.deepEqual(TEMPLATES.ultimate.attrs, { A: 10, E: 10, V: 10 });
  assert.deepEqual(TEMPLATES.beginner.attrs, { A: 1, E: 1, V: 1 });
  assert.doesNotThrow(() => assertAttributes({ A: 10, E: 7, V: 1 }));
  assert.throws(() => assertAttributes({ A: 0, E: 5, V: 5 }), /1.*10/);

  const html = renderIntro({ templateId: 'ultimate' });
  assert.doesNotMatch(html, /data-attr|attr-total|需求\s*10|實作\s*10|驗證\s*10/);
  assert.match(html, /終極全能戰士/);
  assert.match(html, /真初心者/);
  assert.match(html, /非常簡單/);
  assert.match(html, /地獄/);
});

test('card progression offers three distinct identities and supports a strong two-level fusion', () => {
  const draw = openingChoices('fusion-0');
  assert.equal(draw.length, 3);
  let state = createNarrativeGame({ seed: 'fusion-0', selectedCards: [draw[0]] });
  assert.deepEqual(state.equipped, [draw[0]]);

  state.xp = 2;
  state.pendingUpgrades = [2];
  let choices = upgradeChoices(state);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices).size, 3);
  assert.ok(choices.includes(draw[0]), 'an owned non-max card may be offered for fusion');
  assert.match(renderUpgrade(projectNarrativeView(state)), /融合升級 · Lv\.1 → Lv\.2/);
  state = chooseUpgrade(state, draw[0]);
  assert.equal(state.cards[draw[0]], 2);
  assert.equal(state.equipped.length, 1, 'fusion does not occupy another slot');

  state.xp = 5;
  state.pendingUpgrades = [5];
  choices = upgradeChoices(state);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices).size, 3);
  assert.ok(!choices.includes(draw[0]), 'a maxed card is never a dead offer');
  state = chooseUpgrade(state, choices[0]);
  assert.ok(state.equipped.length >= 1 && state.equipped.length <= 2);
  assert.deepEqual(state.claimedThresholds, [2, 5]);
});

test('both earned card rewards occur on legal pre-delivery transitions and can affect later work', () => {
  let state = createNarrativeGame({ seed: 'legal-two-rewards' });
  state = act(state, 'A01', { designate: 'A01-A' }).state;
  state = act(state, 'A04', { designate: 'A04-A' }).state;
  assert.deepEqual(state.pendingUpgrades, [2]);
  const first = upgradeChoices(state)[0];
  state = chooseUpgrade(state, first);
  assert.equal(state.phase, 'playing');

  state = act(state, 'A05', { designate: 'A05-A' }).state;
  state = act(state, 'A07', { designate: 'A07-A', target: 'persistence' }).state;
  assert.ok(state.xp >= 5);
  assert.deepEqual(state.pendingUpgrades, [5]);
  assert.equal(state.workCount, 4, 'second reward lands around two-thirds of the minimal successful work path');
  const second = upgradeChoices(state).includes('C3') ? 'C3' : upgradeChoices(state)[0];
  state = chooseUpgrade(state, second);

  assert.equal(state.phase, 'playing');
  assert.ok(state.equipped.length >= 1 && state.equipped.length <= 3);
  assert.deepEqual(state.claimedThresholds, [2, 5]);
  assert.ok(projectNarrativeView(state).primaryActions.some((action) => action.id === 'A09'));
  if (second === 'C3') assert.equal(previewAction(state, 'A09', { useC3: true }).cost, 3);
});

test('A09 tool checkbox alone cannot bypass a completed review', () => {
  let state = createNarrativeGame({ seed: 'checkbox-review' });
  state.cards = { C3: 1 };
  state.equipped = ['C3'];
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  const reviewed = act(state, 'A09', { designate: 'A09-B' });
  state = reviewed.state;
  const before = { token: state.token, workCount: state.workCount, stateVersion: state.stateVersion };

  assert.equal(previewAction(state, 'A09', { useC3: true }).cached, true);
  const repeated = act(state, 'A09', { useC3: true });
  assert.equal(repeated.cached, true);
  assert.deepEqual(
    { token: repeated.state.token, workCount: repeated.state.workCount, stateVersion: repeated.state.stateVersion },
    before,
  );
  assert.equal(repeated.result.recordId, reviewed.result.recordId);
});

test('requirements success leaves primary actions while failure offers optional retry', () => {
  let success = createNarrativeGame({ seed: 'requirements-success' });
  success = act(success, 'A01', { designate: 'A01-A' }).state;
  const successView = projectNarrativeView(success);
  const oldResult = successView.actions.find((action) => action.id === 'A01');
  assert.equal(oldResult?.historyOnly, true);
  assert.equal(successView.primaryActions.some((action) => action.id === 'A01'), false);

  let failed = createNarrativeGame({ seed: 'requirements-fail' });
  failed = act(failed, 'A01', { designate: 'A01-B' }).state;
  const failedView = projectNarrativeView(failed);
  const retry = failedView.primaryActions.find((action) => action.id === 'A01');
  assert.equal(retry?.title, '重新理解需求');
  assert.ok(failedView.primaryActions.some((action) => action.id !== 'A01' && action.id !== 'A12'));
});

test('resolved event records a four-stage process and tutorial stays collapsed', () => {
  let state = createNarrativeGame({ seed: 'process-story' });
  const worked = act(state, 'A01', { designate: 'A01-A' });
  state = worked.state;
  assert.deepEqual(Object.keys(worked.result.process), ['player', 'response', 'followUp', 'consequence']);
  assert.match(worked.result.process.player, /完成|打勾|清單/);
  assert.match(worked.result.process.consequence, /需求/);

  const html = renderResult(projectNarrativeView(state), worked.result);
  assert.match(html, /這招怎麼用？/);
  assert.match(html, /<details[^>]*class="tutorial"/);
  assert.doesNotMatch(html, /<details[^>]*class="tutorial"[^>]*open/);
  assert.match(html, /\/plan/);
  assert.doesNotMatch(html, /OpenSpec|opsx/i);
});

test('all 34 events have explicit process semantics and combined modifiers remain visible', () => {
  const events = Object.values(EVENTS).flat();
  assert.equal(events.length, 34);
  assert.deepEqual([...PROCESS_EVENT_IDS].sort(), events.map((event) => event.id).sort());
  const before = createNarrativeGame({ seed: 'process-map' });
  const after = structuredClone(before);
  after.artifact.revision += 1;
  for (const event of events) {
    const process = buildProcess({
      actionId: event.id.slice(0, 3),
      event,
      options: { target: 'core', useC2: true, checkDelete: true },
      stateBefore: before,
      stateAfter: after,
    });
    assert.ok(Object.values(process).every((part) => part.length > 15), event.id);
    assert.match(process.followUp, /快速原型/);
    assert.match(process.followUp, /兩筆同名/);
    assert.match(process.consequence, /成果進入新版本/);
  }
  assert.match(buildProcess({ actionId: 'A03', event: EVENTS.A03[2], stateBefore: before, stateAfter: after }).player, /外觀|字體|留白/);
  assert.match(buildProcess({ actionId: 'A06', event: EVENTS.A06[1], stateBefore: before, stateAfter: after }).player, /可操作畫面/);
  assert.match(buildProcess({ actionId: 'A11', event: EVENTS.A11[2], stateBefore: before, stateAfter: after }).player, /checkpoint|回到/);
});

test('main screen has contextual groups instead of a fixed visible-action slice', () => {
  const view = projectNarrativeView(createNarrativeGame({ seed: 'context-actions' }));
  const html = renderPlay(view);
  assert.ok(Array.isArray(view.primaryActions));
  assert.ok(Array.isArray(view.secondaryActions));
  assert.doesNotMatch(html, /data-more/);
  assert.match(html, /次要行動/);
});

test('ending facets preserve delivery truth and use deterministic precedence', () => {
  const successful = createNarrativeGame({ seed: 'ending-facets' });
  successful.token = 10;
  successful.stress = 9;
  successful.repairHistory = true;
  const win = composeEnding(successful, 'E03');
  assert.equal(win.baseId, 'E03');
  assert.ok(win.facets.length <= 2);
  assert.match(`${win.title} ${win.text}`, /修|壓力|Token/);

  const unfinished = createNarrativeGame({ seed: 'ending-facets' });
  unfinished.token = 10;
  const loss = composeEnding(unfinished, 'E08');
  assert.equal(loss.baseId, 'E08');
  assert.match(`${loss.title} ${loss.text}`, /額度|沒做完|未完成/);
  assert.doesNotMatch(`${loss.title} ${loss.text}`, /正式交付|完美/);
});
