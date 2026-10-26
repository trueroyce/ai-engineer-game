import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { composeEnding, createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { CARDS, TEMPLATES } from '../../src/narrative/rules.js';
import { cardIllustration, characterPortrait, eventTone } from '../../src/narrative-ui/art.js';
import { renderCards, renderEnding, renderIntro, renderPlay, renderPreview, renderResult, renderUpgrade } from '../../src/narrative-ui/render.js';

test('all six characters and cards have original inline vector identities', () => {
  const portraits = Object.keys(TEMPLATES).map(characterPortrait);
  const cards = Object.keys(CARDS).map((id) => cardIllustration(id, 1));
  assert.equal(new Set(portraits).size, 6);
  assert.equal(new Set(cards).size, 6);
  portraits.forEach((html) => assert.match(html, /^<svg[^>]+aria-hidden="true"/));
  cards.forEach((html) => assert.match(html, /^<svg[^>]+aria-hidden="true"/));
  assert.doesNotMatch(portraits.join('') + cards.join(''), /<image|data:image|<text/i);
});

test('setup, play, preview, result, reward and ending each render stage-specific art', () => {
  const setup = { templateId: 'balanced', draw: ['C1', 'C2', 'C3'], selected: ['C1'] };
  assert.equal((renderIntro(setup).match(/class="game-art portrait/g) ?? []).length, 6);
  assert.equal((renderCards(setup).match(/class="game-art card-illustration/g) ?? []).length, 3);

  let state = createNarrativeGame({ seed: 'visual-stages', templateId: 'balanced' });
  let view = projectNarrativeView(state);
  assert.match(renderPlay(view), /class="game-art case-scene"/);
  assert.match(renderPreview(view, 'A01'), /class="game-art action-illustration action-a01"/);

  const out = performAction(state, 'A01', { operationId: 'visual-a01', stateVersion: state.stateVersion, designate: 'A01-A' });
  state = out.state;
  view = projectNarrativeView(state);
  const result = renderResult(view, out.result);
  assert.equal((result.match(/class="game-art process-icon/g) ?? []).length, 4);
  assert.match(result, /tone-good/);

  const rewardView = { ...view, pendingUpgrade: { threshold: 2, choices: ['C1', 'C2', 'C3'] } };
  assert.equal((renderUpgrade(rewardView).match(/class="game-art card-illustration/g) ?? []).length, 3);

  state.phase = 'ended';
  state.ending = composeEnding(state, 'E08');
  assert.match(renderEnding(projectNarrativeView(state)), /class="game-art ending-illustration ending-stop"/);
});

test('event color tone is explicit for every authored branch and never leaks internal state', () => {
  const source = fs.readFileSync(new URL('../../src/narrative/content.js', import.meta.url), 'utf8');
  const ids = [...source.matchAll(/event\('(A(?:0[1-9]|1[01])-[A-D])'/g)].map((match) => match[1]);
  assert.equal(ids.length, 34);
  for (const id of ids) assert.ok(['good', 'warn', 'mixed'].includes(eventTone(id)), id);
  const artSource = fs.readFileSync(new URL('../../src/narrative-ui/art.js', import.meta.url), 'utf8');
  assert.doesNotMatch(artSource, /functionState|hiddenDefect|knownIssues|roll|weight/i);
});

test('visual CSS has local assets only, narrow layout, strong focus and reduced-motion handling', () => {
  const css = fs.readFileSync(new URL('../../case-01.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /@import|url\s*\(/i);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.process-beat/);
  assert.match(css, /\.ending-tableau/);
});

