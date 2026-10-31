import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeEnding, createNarrativeGame } from '../../src/narrative/engine.js';
import { validateRunRecord } from '../../src/postgame/run-schema.js';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/phase-29-visual-coach/${BROWSER}`);
const results = [];
const screenshots = [];
const check = (name, pass, detail = '') => { const item = { name, pass: Boolean(pass), detail: String(detail) }; results.push(item); console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${item.pass || !detail ? '' : ` — ${detail}`}`); };
async function shot(page, name) { const file = path.join(OUT, `${name}.png`); await page.screenshot(file); screenshots.push(path.relative(ROOT, file).replaceAll('\\', '/')); }

async function resultVisual(page) {
  return page.eval(`(() => {
    const panel = document.querySelector('.result');
    const scene = document.querySelector('.result-scene .case-art');
    const panelStyle = getComputedStyle(panel);
    const sceneStyle = getComputedStyle(scene);
    const stampStyle = getComputedStyle(panel, '::after');
    return {
      className: panel.className,
      text: panel.innerText,
      panelBackground: panelStyle.backgroundColor,
      panelBorder: panelStyle.borderColor,
      panelShadow: panelStyle.boxShadow,
      sceneBackground: sceneStyle.backgroundColor,
      stampContent: stampStyle.content,
      stampColor: stampStyle.color,
      hudLabel: document.querySelector('.hud')?.getAttribute('aria-label') ?? '',
      actor: document.querySelector('.scene-dialogue p > strong')?.textContent ?? '',
      dialogue: document.querySelector('.scene-dialogue p')?.textContent ?? '',
    };
  })()`);
}

async function chooseCase02Contract(page, previewShot = null) {
  await page.click('[data-case02-action="B01"]');
  for (const [key, value] of Object.entries({ idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' })) {
    await page.eval(`(() => { const node = document.querySelector('[data-case02-option="${key}"]'); node.value = '${value}'; node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  const preview = await page.eval(`({
    hudLabel: document.querySelector('.hud')?.getAttribute('aria-label'),
    hudToken: document.querySelector('.hud .stat strong')?.textContent,
    stateToken: String(window.__AIEG_CASE02_TEST__.state.token),
    receiptLabel: document.querySelector('.receipt')?.getAttribute('aria-label'),
    tokenLabel: document.querySelector('[data-preview-cost="token"]')?.previousElementSibling?.textContent,
    tokenCost: document.querySelector('[data-preview-cost="token"]')?.textContent,
    timeLabel: document.querySelector('[data-preview-cost="time"]')?.previousElementSibling?.textContent,
    stressLabel: document.querySelector('[data-preview-cost="stress"]')?.previousElementSibling?.textContent,
  })`);
  if (previewShot) await shot(page, previewShot);
  await page.click('[data-case02-confirm]');
  await page.waitFor('document.querySelectorAll(".beat-role").length === 4');
  return preview;
}

async function chooseCase03Scope(page) {
  await page.click('[data-case03-action="C01"]');
  await page.click('input[value="core"]');
  await page.click('[data-case03-confirm]');
  await page.waitFor('document.querySelectorAll(".beat-role").length === 4');
}

async function freshCareer(page, base) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click('[data-template="balanced"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
}

async function saveAndAnalyze(page, expectedPrefix) {
  await page.waitFor('document.querySelector("[data-analyze-run]")');
  await page.click('[data-save-run]');
  await page.waitFor('document.querySelector("[data-save-status]")?.textContent.includes("runs")');
  const exported = await page.eval(`(${expectedPrefix === 'case02-' ? 'window.__AIEG_CASE02_TEST__.exportRunRecord()' : 'window.__AIEG_CASE03_TEST__.exportRunRecord()'})`);
  check(`${expectedPrefix} UI export uses its own schema`, exported.runId.startsWith(expectedPrefix) && validateRunRecord(exported) === exported, exported.runId);
  await page.click('[data-analyze-run]');
  await page.waitFor('document.querySelector(".coach-analysis.done")');
  const analysis = await page.eval(`({ text: document.querySelector('.coach-analysis.done').textContent, image: Boolean(document.querySelector('.coach-analysis.done img')) })`);
  check(`${expectedPrefix} stub critique is escaped and visible`, analysis.text.includes('合成三案講評') && !analysis.image, JSON.stringify(analysis));
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'aieg-phase29-runs-'));
  const calls = [];
  const analysisService = {
    async analyze(runId) {
      calls.push(runId);
      return { runId, reused: false, critique: { headline: '<img src=x> 合成三案講評', summary: '只使用本局公開紀錄。', strengths: ['選擇可追溯。'], risks: ['單局不代表穩定能力。'], nextActions: ['下一局比較另一條公開路線。'], luckAndLimits: '成敗含公開骰運限制。' }, usage: { turns: 1 } };
    },
    cancel() { return false; },
  };
  const server = await startServer({ port: 0, root: ROOT, runsDir: runs, quiet: true, analysisService });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXE[BROWSER], width: 1280, height: 900 });
  try {
    const { page } = browser;

    await page.goto(`${base}case-01.html?seed=phase29-ending`);
    const case01 = createNarrativeGame({ seed: 'phase29-ending', templateId: 'balanced' });
    case01.phase = 'ended'; case01.token = 14; case01.stress = 3; case01.ending = composeEnding(case01, 'E01');
    await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(case01)})`);
    await page.waitFor('document.querySelector(".ending-badge")');
    check('case 01 ending promotes facet badges and collapses rule explanation', (await page.eval('document.querySelectorAll(".ending-badge").length')) >= 1 && (await page.eval('document.querySelector(".ending-rules")?.tagName')) === 'DETAILS');
    await shot(page, '01-case01-ending-badges');

    await freshCareer(page, base);
    await page.click('.project:nth-child(2) .project-start');
    await page.waitFor('document.querySelector("[data-start-case]")');
    await page.click('[data-start-case]');
    await page.waitFor('document.querySelectorAll(".case02-art").length === 9');
    check('case 02 board has nine action-specific scenes', (await page.eval('document.querySelectorAll(".case02-art").length')) === 9);
    await shot(page, '02-case02-board');
    await page.setViewport(360, 800, true);
    const mobile02 = await page.eval(`({ overflow: document.documentElement.scrollWidth > innerWidth + 1, buttons: [...document.querySelectorAll('.action-card button:not(:disabled)')].map((node) => node.getBoundingClientRect().height) })`);
    check('case 02 360px board keeps controls reachable without horizontal overflow', !mobile02.overflow && mobile02.buttons.every((height) => height >= 43.5), JSON.stringify(mobile02));
    await shot(page, '02b-case02-board-360');
    await page.setViewport(1280, 900, false);
    await page.click('[data-case02-action="B08"]');
    const zeroCostsDesktop = await page.eval(`({
      token: document.querySelector('[data-preview-cost="token"]')?.textContent,
      time: document.querySelector('[data-preview-cost="time"]')?.textContent,
      stress: document.querySelector('[data-preview-cost="stress"]')?.textContent,
    })`);
    check('case 02 zero costs use neutral zero while nonzero costs keep their sign', zeroCostsDesktop.token === '0'
      && zeroCostsDesktop.time === '-1' && zeroCostsDesktop.stress === '0', JSON.stringify(zeroCostsDesktop));
    await shot(page, '02c-case02-zero-cost-desktop');
    await page.setViewport(390, 844, true);
    const zeroCostsMobile = await page.eval(`({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      values: [...document.querySelectorAll('[data-preview-cost]')].map((node) => node.textContent),
    })`);
    check('case 02 zero-cost receipt stays readable at 390px', !zeroCostsMobile.overflow
      && zeroCostsMobile.values.join(',') === '0,-1,0', JSON.stringify(zeroCostsMobile));
    await shot(page, '02c-case02-zero-cost-390');
    await page.click('[data-case02-cancel]');
    await page.setViewport(1280, 900, false);
    const initial02 = await page.eval('window.__AIEG_CASE02_TEST__.state');
    await page.eval(`(() => { const state = window.__AIEG_CASE02_TEST__.state; state.rng.event = { kind: 'injected', values: Array(16).fill(1), cursor: 0 }; window.__AIEG_CASE02_TEST__.setState(state); })()`);
    const preview02 = await chooseCase02Contract(page, '02c-case02-preview-resources');
    check('case 02 preview separates before-state from this action cost', preview02.hudLabel === '執行前案件資源'
      && preview02.hudToken === preview02.stateToken && preview02.receiptLabel === '本次執行成本'
      && preview02.tokenLabel === 'Token 成本' && /^-\d+$/.test(preview02.tokenCost)
      && preview02.timeLabel === '時間成本' && preview02.stressLabel === '壓力變化', JSON.stringify(preview02));
    const success02 = await resultVisual(page);
    check('case 02 result names player, agent, integration and consequence beats', (await page.eval('document.querySelectorAll(".beat-role").length')) === 4);
    check('case 02 success is one successful step, not a project-ending claim', success02.className.includes('result-tone-good') && success02.actor && success02.dialogue && success02.text.includes('結果 成功') && !success02.text.includes('結果 success') && success02.stampContent.includes('本步成功') && !success02.stampContent.includes('結案') && success02.hudLabel === '執行後案件資源', JSON.stringify(success02));
    await page.eval('document.querySelector(".result")?.scrollIntoView({ block: "start" })');
    await shot(page, '02d-case02-success-result');
    await page.click('[data-case02-continue]');
    await page.eval(`(() => { const state = ${JSON.stringify(initial02)}; state.rng.event = { kind: 'injected', values: Array(16).fill(100), cursor: 0 }; window.__AIEG_CASE02_TEST__.setState(state); })()`);
    await chooseCase02Contract(page);
    const failure02 = await resultVisual(page);
    check('case 02 failure changes the visible result stamp, scene and dialogue', failure02.className.includes('result-tone-bad') && failure02.text.includes('結果 未成功') && failure02.stampContent.includes('本步未成') && success02.stampContent !== failure02.stampContent && success02.stampColor !== failure02.stampColor && success02.sceneBackground !== failure02.sceneBackground && success02.dialogue !== failure02.dialogue, JSON.stringify({ success02, failure02 }));
    await page.eval('document.querySelector(".result")?.scrollIntoView({ block: "start" })');
    await shot(page, '02e-case02-failure-result');
    await page.click('[data-case02-continue]');
    await page.click('[data-case02-action="B09"]');
    await page.click('input[value="stop"]');
    await page.click('[data-case02-confirm]');
    await page.waitFor('document.querySelector(".ending-stage")');
    await shot(page, '03-case02-ending');
    await page.setViewport(360, 800, true);
    check('case 02 ending stays readable at 360px', !(await page.eval('document.documentElement.scrollWidth > innerWidth + 1')));
    await shot(page, '03b-case02-ending-360');
    await page.setViewport(1280, 900, false);
    await saveAndAnalyze(page, 'case02-');
    await shot(page, '04-case02-stub-coach');

    await freshCareer(page, base);
    await page.click('.project:nth-child(3) .project-start');
    await page.waitFor('document.querySelector("[data-start-case]")');
    await page.click('[data-start-case]');
    await page.waitFor('document.querySelectorAll(".case03-art").length === 8');
    check('case 03 board has eight client/NPC/contract scenes', (await page.eval('document.querySelectorAll(".case03-art").length')) === 8);
    await shot(page, '05-case03-board');
    await page.setViewport(360, 800, true);
    const mobile03 = await page.eval(`({ overflow: document.documentElement.scrollWidth > innerWidth + 1, buttons: [...document.querySelectorAll('.action-card button:not(:disabled)')].map((node) => node.getBoundingClientRect().height) })`);
    check('case 03 360px board keeps controls reachable without horizontal overflow', !mobile03.overflow && mobile03.buttons.every((height) => height >= 43.5), JSON.stringify(mobile03));
    await shot(page, '05b-case03-board-360');
    await page.setViewport(1280, 900, false);
    const initial03 = await page.eval('window.__AIEG_CASE03_TEST__.state');
    await page.eval(`(() => { const state = window.__AIEG_CASE03_TEST__.state; state.rng.event = { kind: 'injected', values: Array(16).fill(1), cursor: 0 }; window.__AIEG_CASE03_TEST__.setState(state); })()`);
    await chooseCase03Scope(page);
    const success03 = await resultVisual(page);
    check('case 03 result names player, client/NPC, collaboration and consequence beats', (await page.eval('document.querySelectorAll(".beat-role").length')) === 4);
    check('case 03 success is one successful step, not a project-ending claim', success03.className.includes('result-tone-good') && success03.actor && success03.dialogue && success03.text.includes('結果 成功') && !success03.text.includes('結果 success') && success03.stampContent.includes('本步成功') && !success03.stampContent.includes('結案'), JSON.stringify(success03));
    await shot(page, '05c-case03-success-result');
    await page.click('[data-case03-continue]');
    await page.eval(`(() => { const state = ${JSON.stringify(initial03)}; state.rng.event = { kind: 'injected', values: Array(16).fill(100), cursor: 0 }; window.__AIEG_CASE03_TEST__.setState(state); })()`);
    await chooseCase03Scope(page);
    const failure03 = await resultVisual(page);
    check('case 03 failure changes the visible result stamp, scene and dialogue', failure03.className.includes('result-tone-bad') && failure03.text.includes('結果 未成功') && failure03.stampContent.includes('本步未成') && success03.stampContent !== failure03.stampContent && success03.stampColor !== failure03.stampColor && success03.sceneBackground !== failure03.sceneBackground && success03.dialogue !== failure03.dialogue, JSON.stringify({ success03, failure03 }));
    await shot(page, '05d-case03-failure-result');
    await page.click('[data-case03-continue]');
    await page.click('[data-case03-action="C07"]');
    await page.click('input[value="stop"]');
    await page.click('[data-case03-confirm]');
    await page.waitFor('document.querySelector(".ending-stage")');
    await shot(page, '06-case03-ending');
    await page.setViewport(360, 800, true);
    check('case 03 ending stays readable at 360px', !(await page.eval('document.documentElement.scrollWidth > innerWidth + 1')));
    await shot(page, '06b-case03-ending-360');
    await page.setViewport(1280, 900, false);
    await saveAndAnalyze(page, 'case03-');
    await shot(page, '07-case03-stub-coach');

    const files = fs.readdirSync(runs).filter((name) => name.endsWith('.json')).sort();
    check('fixed runs root contains one valid file for case 02 and case 03', files.length === 2 && files.some((name) => name.startsWith('case02-')) && files.some((name) => name.startsWith('case03-')), files.join(','));
    for (const file of files) {
      const text = fs.readFileSync(path.join(runs, file), 'utf8');
      validateRunRecord(JSON.parse(text));
      check(`${file} excludes hidden state`, !/"seed"|eventAudit|operationResults|operationPayloads|"abilities"/.test(text));
    }
    check('stub analysis ran exactly once per new case', calls.length === 2 && calls[0].startsWith('case02-') && calls[1].startsWith('case03-'), calls.join(','));
    const overflow = await page.eval('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1');
    check('case 03 ending has no horizontal overflow', !overflow);
    check('browser has no uncaught JavaScript errors', page.errors.length === 0, page.errors.join(' | '));
  } catch (error) {
    check('phase 29 browser flow completes', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(runs, { recursive: true, force: true });
  }
  const failed = results.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, total: results.length, failed: failed.length, screenshots, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} phase-29 checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
