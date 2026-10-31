import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { castPortraitSvg } from '../../src/presentation/cast-art.js';
import { cardIllustration, caseFileIllustration, characterPortrait } from '../../src/narrative-ui/art.js';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('四案與大廳都載入同一套離線美術系統', () => {
  for (const file of ['index.html', 'case-01.html', 'case-02.html', 'case-03.html', 'case-04.html']) {
    const html = read(file);
    assert.match(html, /art-system\.css/);
    assert.doesNotMatch(html, /https?:\/\//);
  }
});

test('六種角色模板都有獨立的本機立繪資產', () => {
  const ids = ['ultimate', 'analyst', 'balanced', 'builder', 'verifier', 'beginner'];
  const portraits = ids.map(characterPortrait);
  assert.equal(new Set(portraits).size, 6);
  for (const [index, portrait] of portraits.entries()) {
    assert.match(portrait, new RegExp(`portrait-${ids[index]}`));
    assert.match(portrait, /template-art/);
    assert.match(portrait, new RegExp(`player-${ids[index]}-focused\\.png`));
    for (const expression of ['focused', 'worried', 'skeptical', 'relieved']) {
      const asset = new URL(`../../assets/art/characters/player-${ids[index]}-${expression}.png`, import.meta.url);
      assert.ok(fs.existsSync(asset));
      assert.ok(fs.statSync(asset).size > 100_000);
    }
  }
  assert.match(characterPortrait('beginner', 'relieved'), /player-beginner-relieved\.png/);
  assert.match(characterPortrait('ultimate', 'worried'), /player-ultimate-worried\.png/);
  assert.match(characterPortrait('analyst', 'skeptical'), /player-analyst-skeptical\.png/);
});

test('十八張卡有獨立插圖資產與非純色類別形狀', () => {
  const cards = Array.from({ length: 18 }, (_, index) => cardIllustration(`C${index + 1}`, 1));
  assert.equal(new Set(cards).size, 18);
  cards.forEach((card, index) => {
    assert.match(card, new RegExp(`card-c${index + 1}`));
    assert.match(card, /category-shape/);
    assert.match(card, new RegExp(`cards/C${index + 1}\\.png`));
    assert.ok(fs.existsSync(new URL(`../../assets/art/cards/C${index + 1}.png`, import.meta.url)));
  });
  assert.equal(new Set(cards.map((card) => card.match(/category-(understand|build|coordinate|risk)/)?.[1])).size, 4);
});

test('四案場景縮圖是四個不同工程現場', () => {
  const scenes = ['case-01', 'case-02', 'case-03', 'case-04'].map(caseFileIllustration);
  assert.equal(new Set(scenes).size, 4);
  scenes.forEach((scene, index) => {
    assert.match(scene, new RegExp(`file-case-0${index + 1}`));
    const asset = new URL(`../../assets/art/backgrounds/case0${index + 1}-${['meeting-room', 'data-room', 'client-room', 'server-warroom'][index]}.png`, import.meta.url);
    assert.ok(fs.existsSync(asset));
    assert.ok(fs.statSync(asset).size > 1_000_000);
  });
});

test('案例二至四固定角色有九套立繪，且表情會切換實際資產', () => {
  const casts = [
    ['case-02', 'chen'], ['case-02', 'mina'], ['case-02', 'agent'],
    ['case-03', 'agai'], ['case-03', 'mei'], ['case-03', 'zhou'],
    ['case-04', 'wei'], ['case-04', 'hui'], ['case-04', 'lamp'],
  ];
  const focused = casts.map(([caseId, id]) => castPortraitSvg(caseId, id, 'focused'));
  assert.equal(new Set(focused).size, 9);
  casts.forEach(([caseId, id], index) => assert.notEqual(focused[index], castPortraitSvg(caseId, id, 'worried')));
  assert.match(focused[2], /cast-case02-agent/);
  assert.match(focused[8], /cast-case04-lamp/);
  casts.forEach(([caseId, id]) => {
    const asset = `${caseId.replace('case-', 'case')}-${id}`;
    for (const expression of ['focused', 'worried', 'skeptical', 'relieved']) {
      assert.ok(fs.existsSync(new URL(`../../assets/art/characters/${asset}-${expression}.png`, import.meta.url)));
    }
  });
});

test('中途結果印章不冒充結案，鍵盤焦點、窄版與 reduced-motion 都有明確樣式', () => {
  const css = read('art-system.css');
  assert.match(css, /result-tone-good::after\s*\{\s*content:\s*"✓ 本步成功"/);
  assert.match(css, /result-tone-warn::after\s*\{\s*content:\s*"△ 部分成功"/);
  assert.match(css, /result-tone-bad::after\s*\{\s*content:\s*"× 本步未成"/);
  assert.doesNotMatch(css, /result-tone-(?:good|warn|bad)::after[^}]*結案/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width:\s*420px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
