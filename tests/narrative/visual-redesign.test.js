import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { composeEnding, createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { CARDS, TEMPLATES } from '../../src/narrative/rules.js';
import { cardIllustration, characterPortrait, eventTone } from '../../src/narrative-ui/art.js';
import { renderCards, renderEnding, renderIntro, renderPlay, renderPreview, renderResult, renderUpgrade } from '../../src/narrative-ui/render.js';

test('all six characters and all eighteen cards use distinct local release assets', () => {
  const portraits = Object.keys(TEMPLATES).map(characterPortrait);
  const cardIds = Object.keys(CARDS);
  const cards = cardIds.map((id) => cardIllustration(id, 1));
  assert.equal(new Set(portraits).size, 6);
  assert.equal(new Set(cards).size, 18);
  portraits.forEach((html, index) => {
    const id = Object.keys(TEMPLATES)[index];
    assert.match(html, /raster-template/);
    assert.match(html, new RegExp(`player-${id}-focused\\.png`));
    assert.ok(fs.existsSync(new URL(`../../assets/art/characters/player-${id}-focused.png`, import.meta.url)));
  });
  cards.forEach((html, index) => {
    const id = cardIds[index];
    assert.match(html, /raster-card/);
    assert.match(html, new RegExp(`cards/${id}\\.png`));
    assert.ok(fs.existsSync(new URL(`../../assets/art/cards/${id}.png`, import.meta.url)));
  });
  assert.doesNotMatch(portraits.join('') + cards.join(''), /data:image|https?:/i);
});

test('setup, play, preview, result, reward and ending each render stage-specific art', () => {
  const setup = { templateId: 'balanced', draw: ['C1', 'C2', 'C3'], selected: ['C1'] };
  assert.equal((renderIntro(setup).match(/raster-template/g) ?? []).length, 7);
  assert.equal((renderCards(setup).match(/raster-card/g) ?? []).length, 3);

  let state = createNarrativeGame({ seed: 'visual-stages', templateId: 'balanced' });
  let view = projectNarrativeView(state);
  assert.match(renderPlay(view), /raster-case-scene/);
  assert.match(renderPreview(view, 'A01'), /class="game-art action-illustration action-a01"/);

  const out = performAction(state, 'A01', { operationId: 'visual-a01', stateVersion: state.stateVersion, designate: 'A01-A' });
  state = out.state;
  view = projectNarrativeView(state);
  const result = renderResult(view, out.result);
  assert.equal((result.match(/class="game-art process-icon/g) ?? []).length, 4);
  assert.match(result, /tone-good/);

  const rewardView = { ...view, pendingUpgrade: { threshold: 2, choices: ['C1', 'C2', 'C3'] } };
  assert.equal((renderUpgrade(rewardView).match(/raster-card/g) ?? []).length, 3);

  state.phase = 'ended';
  state.ending = composeEnding(state, 'E08');
  const ending = renderEnding(projectNarrativeView(state));
  assert.match(ending, /raster-ending ending-stop/);
  assert.match(ending, /player-balanced-worried\.png/);
});

test('ending badges keep earned titles and explanations visible in new and legacy saves', () => {
  const state = createNarrativeGame({ seed: 'visible-ending-facets', templateId: 'balanced' });
  state.story.commitment = 'steady';
  state.story.pendingConsequence = { resolved: true };
  const composed = composeEnding(state, 'E08');
  assert.equal(composed.playFacets.length, composed.facets.length);
  assert.ok(composed.playFacets.every((facet) => facet.id && facet.title.trim() && facet.text.trim()));

  state.phase = 'ended';
  state.ending = composed;
  const currentHtml = renderEnding(projectNarrativeView(state));
  assert.match(currentHtml, /先穩住，再讓明天有得改/);
  assert.match(currentHtml, /後來的承諾追問也用紀錄接住/);
  assert.doesNotMatch(currentHtml, /<h2>\s*<\/h2>|<p>\s*<\/p>/);

  state.ending = {
    baseId: 'E01',
    title: '先穩住，再讓承諾有證據',
    text: '舊存檔仍只保存稱號 ID。',
    facets: ['implementation-persistence', 'route-steady'],
  };
  const legacyHtml = renderEnding(projectNarrativeView(state));
  assert.equal((legacyHtml.match(/class="ending-badge"/g) ?? []).length, 2);
  assert.match(legacyHtml, /資料留下來，責任也留下來/);
  assert.match(legacyHtml, /先穩住，再讓明天有得改/);
  assert.doesNotMatch(legacyHtml, /<h2>\s*<\/h2>|<p>\s*<\/p>/);

  state.ending.facets = ['future-unknown-facet'];
  const unknownHtml = renderEnding(projectNarrativeView(state));
  assert.doesNotMatch(unknownHtml, /ending-facets|ending-badge/);
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

