import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.join(ROOT, 'docs/testing/artifacts/phase-31-branching', BROWSER);
const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass || !detail ? '' : ` — ${detail}`}`);
}

async function newCareer(page, base) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click('[data-template="balanced"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
}

async function openCase(page, base, number) {
  await page.goto(base);
  await page.click(`.project:nth-child(${number}) .project-start`);
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
}

async function reset02(page, templateId, rolls) {
  await page.eval(`(async () => {
    const runId = window.__AIEG_CASE02_TEST__.state.runId;
    const mod = await import('./src/case-02/engine-v2.js');
    const state = mod.createCase02Game({ templateId: '${templateId}', eventRolls: ${JSON.stringify(rolls)}, progressionV2: true });
    state.runId = runId;
    window.__AIEG_CASE02_TEST__.setState(state);
  })()`);
}

async function action02(page, id, { selects = {}, value = null } = {}) {
  await page.click(`[data-case02-action="${id}"]`);
  for (const [key, item] of Object.entries(selects)) {
    await page.eval(`(() => { const e = document.querySelector('[data-case02-option="${key}"]'); e.value = '${item}'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  if (value) await page.click(`input[value="${value}"]`);
  await page.click('[data-case02-confirm]');
  await page.waitFor('document.querySelector("[data-case02-continue]")');
  await page.click('[data-case02-continue]');
  if (await page.eval('window.__AIEG_CASE02_TEST__.screen === "reward"')) await page.click('[data-case02-reward]');
}

async function reset03(page, templateId, rolls) {
  await page.eval(`(async () => {
    const runId = window.__AIEG_CASE03_TEST__.state.runId;
    const mod = await import('./src/case-03/engine.js');
    const state = mod.createCase03Game({ templateId: '${templateId}', eventRolls: ${JSON.stringify(rolls)}, progressionV2: true });
    state.runId = runId;
    window.__AIEG_CASE03_TEST__.setState(state);
  })()`);
}

async function action03(page, id, value) {
  await page.click(`[data-case03-action="${id}"]`);
  if (value) await page.click(`input[value="${value}"]`);
  await page.click('[data-case03-confirm]');
  await page.waitFor('document.querySelector("[data-case03-continue]")');
  await page.click('[data-case03-continue]');
  if (await page.eval('window.__AIEG_CASE03_TEST__.screen === "reward"')) await page.click('[data-case03-reward]');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXE[BROWSER] });
  try {
    const page = browser.page;
    await newCareer(page, base);
    await openCase(page, base, 2);

    await reset02(page, 'beginner', [100, 1]);
    await action02(page, 'B01', { selects: { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' } });
    check('case02 failure opens three cardless recoveries', await page.eval('document.querySelectorAll("[data-case02-action=\\"B10\\"]").length === 1'));
    await action02(page, 'B10', { value: 'prototype' });
    check('case02 prototype leaves a limited public scope', (await page.eval('window.__AIEG_CASE02_TEST__.state.story.scope')) === 'prototype');

    await reset02(page, 'ultimate', [1, 1, 1, 1, 1, 1]);
    await action02(page, 'B01', { selects: { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' } });
    await action02(page, 'B02', { value: 'solo' });
    await action02(page, 'B03');
    check('case02 success opens stable/improve/greedy choice', await page.eval('document.querySelectorAll("[data-case02-action=\\"B11\\"]").length === 1'));
    await action02(page, 'B11', { value: 'gamble' });
    await action02(page, 'B06', { value: 'focused' });
    check('case02 greedy source returns as a delayed consequence', (await page.eval('window.__AIEG_CASE02_TEST__.state.story.commitments.extraSource')) === 'surfaced');

    await reset02(page, 'ultimate', [1, 1, 1, 1, 1, 1]);
    await action02(page, 'B01', { selects: { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' } });
    await action02(page, 'B02', { value: 'two' });
    await action02(page, 'B03');
    check('case02 parallel agents surface a specific adapter route', await page.eval('document.querySelectorAll("[data-case02-action=\\"B12\\"]").length === 1'));
    await action02(page, 'B12', { value: 'shared-sample' });
    await page.click('[data-case02-action="B09"]');
    await page.click('input[value="stop"]');
    await page.click('[data-case02-confirm]');
    await page.waitFor('document.querySelector("[data-return-lobby]")');
    await page.click('[data-return-lobby]');

    await newCareer(page, base);
    await page.click('.project:nth-child(3) .project-start');
    await page.waitFor('document.querySelector("[data-start-case]")');
    await page.click('[data-start-case]');
    await reset03(page, 'beginner', [100, 1]);
    await action03(page, 'C01', 'full');
    check('case03 failure opens prototype/trim/force', await page.eval('document.querySelectorAll("[data-case03-action=\\"C09\\"]").length === 1'));
    await action03(page, 'C09', 'prototype');
    check('case03 prototype is explicitly not implementation', await page.eval('window.__AIEG_CASE03_TEST__.state.story.prototype.complete && window.__AIEG_CASE03_TEST__.state.implementation === null'));

    await reset03(page, 'ultimate', [1, 1, 1, 1, 1, 1]);
    await action03(page, 'C01', 'full');
    await action03(page, 'C10', 'gamble');
    await action03(page, 'C02', 'explicit');
    await action03(page, 'C03', 'pair');
    await action03(page, 'C04', 'strict');
    await action03(page, 'C05', 'negotiate');
    check('case03 greedy admin request returns at change handling', (await page.eval('window.__AIEG_CASE03_TEST__.state.story.commitments.extraAdmin')) === 'surfaced');

    await reset03(page, 'ultimate', [1, 1, 1, 1, 1, 1]);
    await action03(page, 'C01', 'full');
    await action03(page, 'C02', 'explicit');
    await action03(page, 'C03', 'agent');
    await action03(page, 'C04', 'strict');
    check('case03 parallel work surfaces a version adapter route', await page.eval('document.querySelectorAll("[data-case03-action=\\"C11\\"]").length === 1'));

    check('no external requests or console errors', page.requests.every((url) => url.startsWith(base) || url.startsWith('data:') || url === 'about:blank') && page.errors.length === 0, page.errors.join(' | '));
    await page.screenshot(path.join(OUT, 'branching-final.png'));
  } catch (error) {
    check('browser flow completed', false, error.stack ?? error.message);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = checks.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, checks, failed: failed.length }, null, 2));
  console.log(`${BROWSER}: ${checks.length} branching checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
