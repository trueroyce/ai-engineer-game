import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { createCase03Game, performCase03Action } from '../../src/case-03/engine.js';
import { chooseCase04Reward, createCase04Game, performCase04Action } from '../../src/case-04/engine.js';
import { CAREER_STORAGE_KEY, createCareer, encodeCareer } from '../../src/career/state-v2.js';
import { validateRunRecord } from '../../src/postgame/run-schema.js';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const EXECUTABLES = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
};
const OUT = path.resolve(arg('--out') ?? path.join(os.tmpdir(), 'aieg-balanced-postgame-save', BROWSER));
const results = [];

function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail: String(detail) };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

function act01(state, actionId, options) {
  return performAction(state, actionId, { ...options, operationId: `browser-${actionId}-${state.stateVersion}`, stateVersion: state.stateVersion }).state;
}

function act(perform, state, actionId, options) {
  return perform(state, actionId, { ...options, operationId: `browser-${state.caseId}-${actionId}-${state.stateVersion}`, stateVersion: state.stateVersion }).state;
}

function endedState(caseId, templateId) {
  if (caseId === 'case-01') {
    let state = createNarrativeGame({ templateId, seed: `browser-${caseId}-${templateId}` });
    state = act01(state, 'A01', { designate: 'A01-A' });
    return act01(state, 'A12', { intent: 'stop' });
  }
  if (caseId === 'case-02') {
    let state = createCase02Game({ templateId, seed: templateId === 'beginner' ? 2021 : 2022, progressionV2: true });
    state = act(performCase02Action, state, 'B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' });
    return act(performCase02Action, state, 'B09', { intent: 'stop' });
  }
  if (caseId === 'case-03') {
    let state = createCase03Game({ templateId, seed: templateId === 'beginner' ? 3031 : 3032, progressionV2: true });
    state = act(performCase03Action, state, 'C01', { scope: 'core' });
    return act(performCase03Action, state, 'C07', { intent: 'stop' });
  }
  let state = createCase04Game({ templateId, seed: templateId === 'beginner' ? 4041 : 4042, progressionV2: true });
  state = act(performCase04Action, state, 'D01', { method: 'reproduce' });
  state = act(performCase04Action, state, 'D02', { strategy: 'patch' });
  if (state.pendingReward) state = chooseCase04Reward(state, state.pendingReward.choices[0]).state;
  return act(performCase04Action, state, 'D09', { intent: 'stop' });
}

async function closeServer(server) {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'aieg-balanced-ui-runs-'));
  let server;
  const browser = await launch({ executable: EXECUTABLES[BROWSER], width: 1280, height: 900 });
  try {
    server = await startServer({ port: 0, root: ROOT, runsDir: runs, quiet: true });
    const base = `http://127.0.0.1:${server.address().port}/`;
    const { page } = browser;
    await page.goto(base);
    for (const templateId of ['ultimate', 'beginner']) {
      for (const caseId of ['case-01', 'case-02', 'case-03', 'case-04']) {
        const career = createCareer({ careerId: `qa-${caseId.replace('-', '')}-${templateId}`, templateId });
        const encoded = encodeCareer(career);
        await page.eval(`localStorage.setItem(${JSON.stringify(CAREER_STORAGE_KEY)}, ${JSON.stringify(encoded)})`);
        await page.goto(`${base}${caseId}.html?mode=career`);
        const state = endedState(caseId, templateId);
        const hook = caseId === 'case-01' ? '__AIEG_NARRATIVE_TEST__' : `__AIEG_CASE${caseId.slice(-2)}_TEST__`;
        await page.eval(`window[${JSON.stringify(hook)}].setState(${JSON.stringify(state)})`);
        await page.waitFor('document.querySelector("[data-save-run]")');
        const before = new Set(fs.readdirSync(runs).filter((name) => name.endsWith('.json')));
        await page.click('[data-save-run]');
        await page.waitFor('document.querySelector("[data-save-status]")?.textContent.length > 0');
        let created = [];
        for (let attempt = 0; attempt < 50 && created.length !== 1; attempt += 1) {
          created = fs.readdirSync(runs).filter((name) => name.endsWith('.json') && !before.has(name));
          if (created.length !== 1) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        check(`${caseId} ${templateId} saves one record through the UI`, created.length === 1, created.join(','));
        if (created.length !== 1) continue;
        const recordPath = path.join(runs, created[0]);
        let record = null;
        for (let attempt = 0; attempt < 50 && !record; attempt += 1) {
          try { record = JSON.parse(fs.readFileSync(recordPath, 'utf8')); }
          catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
        }
        if (!record) throw new Error(`saved record did not become readable: ${created[0]}`);
        validateRunRecord(record);
        const expectedTime = state.initialResources.time;
        const expectedToken = state.initialResources.token;
        check(`${caseId} ${templateId} keeps exact initial resources`, record.initialResources.time === expectedTime
          && record.initialResources.token === expectedToken, JSON.stringify(record.initialResources));
        check(`${caseId} ${templateId} first work is not free`, record.timeline[0].resourceCost.token > 0
          && record.timeline[0].resourceCost.workTime > 0, JSON.stringify(record.timeline[0].resourceCost));
      }
    }
    check('browser flow has no uncaught JavaScript errors', page.errors.length === 0, page.errors.join(' | '));
  } catch (error) {
    check('balanced postgame save flow completes', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    await closeServer(server);
    await browser.close();
    fs.rmSync(runs, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, total: results.length, failed: results.filter((item) => !item.pass).length, results }, null, 2));
  const failed = results.filter((item) => !item.pass);
  console.log(`${BROWSER}: ${results.length} balanced postgame save checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
