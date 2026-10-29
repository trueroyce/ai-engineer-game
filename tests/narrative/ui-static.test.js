import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { SIMULATION_NOTICE } from '../../src/narrative/rules.js';
import { renderEnding, renderIntro, renderPlay, renderPreview } from '../../src/narrative-ui/render.js';

test('首頁說明恰一次，遊戲畫面不重複', () => {
  const setup = { templateId: 'balanced', attrs: { A: 2, E: 2, V: 2 } };
  assert.equal(renderIntro(setup).split(SIMULATION_NOTICE).length - 1, 1);
  const html = renderPlay(projectNarrativeView(createNarrativeGame({ seed: 'ui' })));
  assert.equal(html.includes(SIMULATION_NOTICE), false);
});

test('玩家 HTML 沒有內部結果代號、概率欄位或開發規格教學', () => {
  const view = projectNarrativeView(createNarrativeGame({ seed: 'ui-safe' }));
  const html = renderPlay(view) + renderPreview(view, 'A01');
  for (const pattern of [/A01-[A-D]/, /E0[1-8]/, /OpenSpec/i, /opsx/i, /eventKey/i, /functionState/i, /seed/i, /權重/, /機率/, /擲骰/]) assert.doesNotMatch(html, pattern);
});

test('窄版樣式、焦點、aria-live 與鍵盤退出支援存在', () => {
  const css = fs.readFileSync(new URL('../../case-01.css', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../../src/narrative-ui/main.js', import.meta.url), 'utf8');
  const render = fs.readFileSync(new URL('../../src/narrative-ui/render.js', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /focus-visible/);
  assert.match(main, /e\.key === 'Escape'/);
  assert.match(render, /aria-live="polite"/);
});

test('持有工具卡時，工作預覽提供卡片取捨控制', () => {
  const state = createNarrativeGame({ seed: 'ui-tools' });
  state.cards = { C2: 1, C3: 1 };
  state.equipped = ['C2', 'C3'];
  const view = projectNarrativeView(state);
  assert.match(renderPreview(view, 'A05'), /data-option-check="useC2"/);
  state.artifact.kind = 'prototype';
  assert.match(renderPreview(projectNarrativeView(state), 'A08'), /data-option-check="useC3"/);
});

test('同版本已結算工作明示查看上次結果，案件進度只呈現可觀察證據', () => {
  let state = createNarrativeGame({ seed: 'ui-progress' });
  state = performAction(state, 'A05', { operationId: 'ui-progress-1', stateVersion: 0, designate: 'A05-A' }).state;
  let view = projectNarrativeView(state);
  let html = renderPlay(view);
  assert.match(html, /查看上次結果/);
  assert.match(html, /data-view-result="A05"/);
  assert.doesNotMatch(html, /data-action="A05"/);
  assert.match(html, /過去工作（唯讀）/);
  assert.match(html, /案件進度/);
  assert.match(html, /目前成果/);
  assert.doesNotMatch(html, /functionState|eventKey|權重|擲骰/);

  state = performAction(state, 'A08', { operationId: 'ui-progress-2', stateVersion: state.stateVersion, designate: 'A08-B' }).state;
  state = performAction(state, 'A07', { operationId: 'ui-progress-3', stateVersion: state.stateVersion, designate: 'A07-A', target: 'persistence' }).state;
  view = projectNarrativeView(state);
  assert.ok(view.progress.checks.some((check) => check.status.startsWith('待重驗')));
  assert.match(view.progress.delivery.formal, /現行通過證據/);
});

test('賽後教練只在可信本機 capability 存在時渲染，靜態版沒有入口或手搬提示', () => {
  let state = createNarrativeGame({ seed: 'ui-local-coach' });
  state = performAction(state, 'A12', { operationId: 'ui-local-coach-stop', stateVersion: state.stateVersion, intent: 'stop' }).state;
  const view = projectNarrativeView(state);
  const staticHtml = renderEnding(view);
  assert.doesNotMatch(staticHtml, /data-save-run|data-export-run|coach-export|賽後教練|runs|手動|下載/);

  const localHtml = renderEnding(view, { localCoachAvailable: true });
  assert.match(localHtml, /data-save-run/);
  assert.match(localHtml, /data-export-run/);
  assert.match(localHtml, /直接把這局的公開紀錄存入本機專案/);
  assert.doesNotMatch(localHtml, /手動放|搬到|下載後/);

  const staticRuntime = [
    '../../src/narrative-ui/main.js',
    '../../src/narrative-ui/render.js',
    '../../src/postgame/run-export.js',
  ].map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(staticRuntime, /https?:\/\/(?:127\.0\.0\.1|localhost)|\.mcp\.json|scripts\/mcp-postgame|src\/local-coach/i);
  const main = fs.readFileSync(new URL('../../src/narrative-ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /const host = globalThis\.location\?\.hostname/);
  assert.match(main, /if \(!\['127\.0\.0\.1', 'localhost', '\[::1\]'\]\.includes\(host\)\) return/);
  assert.ok(main.indexOf('includes(host)') < main.indexOf("fetch('/api/local-coach/capability'"));
  assert.match(main, /fetch\('\/api\/local-coach\/capability'/);
});
