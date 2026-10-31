import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/balance-natural/${BROWSER}`);
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer({ port: 0, quiet: true, enableLocalCoach: false, root: ROOT });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await launch({ executable: EXE[BROWSER] });
const page = browser.page;
const results = { browser: BROWSER, base, case01: {}, case04: {}, externalRequests: [], browserErrors: [] };

async function selectValue(selector, value) {
  await page.eval(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

async function claim01(preference) {
  if (!(await page.eval('Boolean(document.querySelector("[data-upgrade]"))'))) return null;
  const choices = await page.eval('[...document.querySelectorAll("[data-upgrade]")].map((element) => element.dataset.upgrade)');
  const chosen = preference.find((id) => choices.includes(id)) ?? choices[0];
  await page.click(`[data-upgrade="${chosen}"]`);
  await page.waitFor('document.querySelector("[data-action]")');
  return chosen;
}

async function action01(actionId, options, rewards, preference) {
  await page.click(`[data-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-confirm]")');
  for (const [key, value] of Object.entries(options)) {
    if (key === 'intent') await page.click(`input[value="${value}"]`);
    else if (typeof value === 'string') await selectValue(`[data-option="${key}"]`, value);
    else if (value && await page.eval(`Boolean(document.querySelector('[data-option-check="${key}"]'))`)) await page.click(`[data-option-check="${key}"]`);
  }
  await page.click('[data-confirm]');
  if (actionId === 'A12') {
    await page.waitFor('document.querySelector("[data-new]") || document.querySelector("[data-continue]")');
    if (await page.eval('Boolean(document.querySelector("[data-continue]"))')) {
      const detail = await page.eval('JSON.stringify({ phase: window.__AIEG_NARRATIVE_TEST__.state.phase, view: window.__AIEG_NARRATIVE_TEST__.view })');
      throw new Error(`delivery did not end: ${detail}`);
    }
    return;
  }
  await page.waitFor('document.querySelector("[data-continue]")');
  await page.click('[data-continue]');
  const reward = await claim01(preference);
  if (reward) rewards.push(reward);
}

const case01Routes = {
  ultimate: {
    seed: 'balance-002', starter: 'C6', preference: ['C6', 'C1', 'C3', 'C4', 'C5', 'C2'],
    actions: [
      ['A01', {}], ['A01', {}], ['A01', {}], ['A04', { repairDraft: false }], ['A05', { useC2: false }],
      ['A07', { target: 'core', useC2: false, checkDelete: true }],
      ['A07', { target: 'persistence', useC2: false, checkDelete: true }],
      ['A09', { useC3: true }], ['A08', { useC3: true }], ['A12', { intent: 'formal' }],
    ],
  },
  beginner: {
    seed: 'balance-004', starter: 'C1', preference: ['C6', 'C1', 'C3', 'C4', 'C5', 'C2'],
    actions: [
      ['A01', {}], ['A04', { repairDraft: false }], ['A05', { useC2: false }],
      ['A07', { target: 'core', useC2: false, checkDelete: true }],
      ['A07', { target: 'persistence', useC2: false, checkDelete: true }], ['A09', { useC3: false }],
      ['A08', { useC3: false }], ['A12', { intent: 'formal' }],
    ],
  },
};

async function runCase01(templateId) {
  const route = case01Routes[templateId];
  await page.goto(`${base}case-01.html?seed=${route.seed}`);
  await page.click(`[data-template="${templateId}"]`);
  await page.click('[data-next="cards"]');
  await page.waitFor('document.querySelectorAll("[data-card]").length === 3');
  const offered = await page.eval('[...document.querySelectorAll("[data-card]")].map((element) => element.dataset.card)');
  if (!offered.includes(route.starter)) throw new Error(`${templateId} starter ${route.starter} not offered: ${offered.join(',')}`);
  await page.click(`[data-card="${route.starter}"]`);
  await page.click('[data-start]');
  await page.waitFor('document.querySelector("[data-action]")');
  const rewards = [];
  for (const [actionId, options] of route.actions) await action01(actionId, options, rewards, route.preference);
  const final = await page.eval(`({
    ending: window.__AIEG_NARRATIVE_TEST__.view.ending.baseId,
    resources: window.__AIEG_NARRATIVE_TEST__.view.resources,
    phase: window.__AIEG_NARRATIVE_TEST__.state.phase,
    seed: window.__AIEG_NARRATIVE_TEST__.state.seed
  })`);
  await page.screenshot(path.join(OUT, `case01-${templateId}-${final.ending}.png`));
  return { templateId, starter: route.starter, offered, rewards, actions: route.actions, ...final };
}

async function claim04() {
  if (!(await page.eval('window.__AIEG_CASE04_TEST__?.screen === "reward"'))) return null;
  const choices = await page.eval('[...document.querySelectorAll("[data-case04-reward]")].map((element) => element.dataset.case04Reward)');
  const chosen = ['C7', 'C3', 'C6', 'C2', 'C4', 'C9', 'C12', 'C1'].find((id) => choices.includes(id)) ?? choices[0];
  await page.click(`[data-case04-reward="${chosen}"]`);
  await page.waitFor('window.__AIEG_CASE04_TEST__.screen === "board"');
  return chosen;
}

async function action04(actionId, value, log) {
  await page.waitFor(`document.querySelector('[data-case04-action="${actionId}"]')`);
  await page.click(`[data-case04-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-case04-confirm]")');
  await page.click(`input[value="${value}"]`);
  await page.click('[data-case04-confirm]');
  if (actionId === 'D09') {
    await page.waitFor('document.querySelector(".ending")');
    log.push({ actionId, value, ending: true });
    return;
  }
  await page.waitFor('document.querySelector("[data-case04-continue]")');
  const snapshot = await page.eval(`({
    outcome: window.__AIEG_CASE04_TEST__.state.lastAttempt?.outcome ?? null,
    resources: { token: window.__AIEG_CASE04_TEST__.state.token, time: window.__AIEG_CASE04_TEST__.state.timeLeft, stress: window.__AIEG_CASE04_TEST__.state.stress }
  })`);
  log.push({ actionId, value, ...snapshot });
  await page.click('[data-case04-continue]');
  const reward = await claim04();
  if (reward) log.push({ reward });
}

async function freshCase04(templateId) {
  page.dialogResponse = true;
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  page.dialogResponse = false;
  await page.click(`[data-template="${templateId}"]`);
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  const offered = await page.eval('[...document.querySelectorAll("[data-starter-card]")].map((element) => element.dataset.starterCard)');
  const starter = ['C5', 'C3', 'C6', 'C2', 'C4', 'C1'].find((id) => offered.includes(id)) ?? offered[0];
  await page.click(`[data-starter-card="${starter}"]`);
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  await page.click('.project:nth-child(4) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  await page.waitFor('window.__AIEG_CASE04_TEST__?.screen === "board"');
  const initial = await page.eval(`({
    token: window.__AIEG_CASE04_TEST__.state.token,
    time: window.__AIEG_CASE04_TEST__.state.timeLeft,
    stress: window.__AIEG_CASE04_TEST__.state.stress,
    rngKind: window.__AIEG_CASE04_TEST__.state.rng.event.kind
  })`);
  return { offered, starter, initial };
}

async function stop04(log) {
  if (await page.eval('Boolean(document.querySelector("[data-case04-action=D09]"))')) await action04('D09', 'stop', log);
}

async function runCase04Attempt(templateId, index) {
  const setup = await freshCase04(templateId);
  const log = [];
  const failed = () => page.eval('window.__AIEG_CASE04_TEST__.state.lastAttempt?.outcome !== "success"');
  await action04('D01', 'logs', log);
  await action04('D02', 'investigate', log);
  if (await failed()) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D02' }; }
  await action04('D03', 'sequential', log);
  if (await failed()) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D03' }; }
  await action04('D04', setup.starter === 'C5' ? 'pace' : 'freeze', log);
  await action04('D05', 'code', log);
  if (await failed()) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D05' }; }
  await action04('D07', 'full', log);
  if (await failed()) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D07-first' }; }
  await action04('D06', 'repair', log);
  if (await failed() && await page.eval('Boolean(document.querySelector("[data-case04-action=D06]"))')) await action04('D06', 'repair', log);
  if (await page.eval('!window.__AIEG_CASE04_TEST__.state.story.pendingConsequence.resolved')) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D06' }; }
  await action04('D07', 'full', log);
  if (await failed()) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D07-second' }; }
  await action04('D08', 'complete', log);
  if (await failed() && await page.eval('Boolean(document.querySelector("[data-case04-action=D08]"))')) await action04('D08', 'complete', log);
  if (await page.eval('!window.__AIEG_CASE04_TEST__.state.handoff.complete')) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D08' }; }
  await action04('D11', 'verified', log);
  if (!(await page.eval('window.__AIEG_CASE04_TEST__.state.approval?.status === "approved"'))) { await stop04(log); return { templateId, index, setup, log, ending: 'C04-STOP', stoppedAt: 'D11' }; }
  await action04('D09', 'verified', log);
  const final = await page.eval(`({
    ending: window.__AIEG_CASE04_TEST__.state.ending?.baseId,
    resources: { token: window.__AIEG_CASE04_TEST__.state.token, time: window.__AIEG_CASE04_TEST__.state.timeLeft, stress: window.__AIEG_CASE04_TEST__.state.stress },
    phase: window.__AIEG_CASE04_TEST__.state.phase,
    playerExpression: document.querySelector('.raster-case04-art .raster-template')?.getAttribute('style') ?? ''
  })`);
  await page.screenshot(path.join(OUT, `case04-${templateId}-${final.ending}.png`));
  return { templateId, index, setup, log, ...final };
}

try {
  for (const templateId of ['ultimate', 'beginner']) results.case01[templateId] = await runCase01(templateId);
  for (const templateId of ['ultimate', 'beginner']) {
    const attempts = [];
    for (let index = 1; index <= 20 && !attempts.some((run) => run.ending === 'C04-VERIFIED'); index += 1) attempts.push(await runCase04Attempt(templateId, index));
    results.case04[templateId] = attempts;
  }
  results.externalRequests = page.requests.filter((url) => !url.startsWith(base) && !url.startsWith('data:') && url !== 'about:blank');
  results.browserErrors = page.errors;
  const pass = Object.values(results.case01).every((run) => ['E01', 'E02', 'E03', 'E06'].includes(run.ending))
    && Object.values(results.case04).every((runs) => runs.some((run) => run.ending === 'C04-VERIFIED'))
    && Object.values(results.case04).every((runs) => runs.find((run) => run.ending === 'C04-VERIFIED')?.playerExpression.includes('-relieved.png'))
    && results.externalRequests.length === 0 && results.browserErrors.length === 0;
  results.pass = pass;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ pass, case01: results.case01, case04: Object.fromEntries(Object.entries(results.case04).map(([key, runs]) => [key, { attempts: runs.length, verified: runs.some((run) => run.ending === 'C04-VERIFIED'), final: runs.at(-1) }])) }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
