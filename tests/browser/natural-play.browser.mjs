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
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/phase-27-natural-play/${BROWSER}`);
const results = [];

function check(group, name, pass, detail = '') {
  const row = { group, name, pass: Boolean(pass), detail: String(detail) };
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} [${group}] ${name}${row.pass || !detail ? '' : ` — ${detail}`}`);
}

async function newCareer(page, base, templateId) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click(`[data-template="${templateId}"]`);
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
}

async function claim02IfPending(page) {
  const pending = await page.eval('window.__AIEG_CASE02_TEST__.screen === "reward"');
  if (!pending) return;
  await page.click('[data-case02-reward]');
  await page.waitFor('window.__AIEG_CASE02_TEST__.screen === "board"');
}

async function action02(page, actionId, { select = {}, radio = null } = {}) {
  await page.click(`[data-case02-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-case02-confirm]")');
  for (const [key, value] of Object.entries(select)) {
    await page.eval(`(() => { const element = document.querySelector('[data-case02-option="${key}"]'); element.value = '${value}'; element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  if (radio) await page.click(`input[value="${radio}"]`);
  await page.click('[data-case02-confirm]');
  if (actionId === 'B09') return;
  await page.waitFor('document.querySelector("[data-case02-continue]")');
  await page.click('[data-case02-continue]');
  await claim02IfPending(page);
}

async function runCase02(page, base, templateId) {
  await newCareer(page, base, templateId);
  await page.click('.project:nth-child(2) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  const initial = await page.eval('window.__AIEG_CASE02_TEST__.state');
  await action02(page, 'B01', { select: { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' } });
  await action02(page, 'B02', { radio: 'solo' });
  await action02(page, 'B03');
  await action02(page, 'B04', { radio: 'contract' });
  await action02(page, 'B07');
  await action02(page, 'B06', { radio: 'full' });
  const beforeDelivery = await page.eval('window.__AIEG_CASE02_TEST__.state');
  const verified = Boolean(beforeDelivery.contract?.clarity)
    && beforeDelivery.integration?.unresolvedDebt === 0
    && beforeDelivery.change?.contractUpdated
    && beforeDelivery.tests?.coverage >= 4
    && beforeDelivery.tests?.failed?.length === 0
    && beforeDelivery.provenance;
  await action02(page, 'B09', { radio: verified ? 'verified' : 'limited' });
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const ended = await page.eval('window.__AIEG_CASE02_TEST__.state');
  return {
    templateId,
    verified,
    ending: ended.ending?.baseId,
    resources: { token: ended.token, time: ended.timeLeft, stress: ended.stress },
    initialResources: { token: initial.token, time: initial.timeLeft, stress: initial.stress },
    attempts: ended.eventAudit.length,
    rngKind: ended.rng.event.kind,
    rewards: ended.careerRewards.length,
  };
}

async function claim03IfPending(page) {
  const pending = await page.eval('window.__AIEG_CASE03_TEST__.screen === "reward"');
  if (!pending) return;
  await page.click('[data-case03-reward]');
  await page.waitFor('window.__AIEG_CASE03_TEST__.screen === "board"');
}

async function action03(page, actionId, radio = null) {
  await page.click(`[data-case03-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-case03-confirm]")');
  if (radio) await page.click(`input[value="${radio}"]`);
  await page.click('[data-case03-confirm]');
  if (actionId === 'C07') return;
  await page.waitFor('document.querySelector("[data-case03-continue]")');
  await page.click('[data-case03-continue]');
  await claim03IfPending(page);
}

async function runCase03(page, base, templateId) {
  await newCareer(page, base, templateId);
  await page.click('.project:nth-child(3) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  const initial = await page.eval('window.__AIEG_CASE03_TEST__.state');
  await action03(page, 'C01', 'full');
  await action03(page, 'C02', 'explicit');
  let current = await page.eval('window.__AIEG_CASE03_TEST__.state');
  if (!current.contract?.approved) {
    await action03(page, 'C07', 'stop');
  } else {
    await action03(page, 'C03', 'solo');
    await action03(page, 'C04', 'strict');
    await action03(page, 'C05', 'negotiate');
    await action03(page, 'C06', 'full');
    current = await page.eval('window.__AIEG_CASE03_TEST__.state');
    const verified = Boolean(current.requirements?.clear)
      && current.contract?.approved
      && current.implementation?.complete
      && current.integrationDebt === 0
      && current.change?.handled
      && current.evidence?.revision === current.artifactRevision
      && current.evidence?.coverage >= 4
      && current.evidence?.trace
      && current.evidence?.failed?.length === 0;
    await action03(page, 'C07', verified ? 'verified' : 'limited');
  }
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const ended = await page.eval('window.__AIEG_CASE03_TEST__.state');
  return {
    templateId,
    verified: ended.ending?.baseId === 'C03-VERIFIED',
    ending: ended.ending?.baseId,
    resources: { token: ended.token, time: ended.timeLeft, stress: ended.stress },
    initialResources: { token: initial.token, time: initial.timeLeft, stress: initial.stress },
    attempts: ended.eventAudit.length,
    rngKind: ended.rng.event.kind,
    rewards: ended.careerRewards.length,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXE[BROWSER] });
  try {
    const case02StrongRuns = [];
    for (let index = 0; index < 5 && !case02StrongRuns.some((run) => run.verified); index += 1) {
      case02StrongRuns.push(await runCase02(browser.page, base, 'ultimate'));
    }
    const case02Weak = await runCase02(browser.page, base, 'beginner');
    check('natural-case-02', '強角自然骰可達正式交付，未成功的局與弱角仍誠實有限／止損',
      case02StrongRuns.some((run) => run.verified) && [...case02StrongRuns, case02Weak].every((run) => run.ending && run.resources.token >= 0 && run.resources.time >= 0),
      JSON.stringify({ case02StrongRuns, case02Weak }));
    check('natural-case-02', '未注入 RNG、Token、時間或測試 state',
      [...case02StrongRuns, case02Weak].every((run) => run.rngKind !== 'injected' && run.initialResources.token === 18 && run.initialResources.time === 12),
      JSON.stringify({ case02StrongRuns, case02Weak }));

    const case03Runs = [];
    for (let index = 0; index < 5 && !case03Runs.some((run) => run.verified); index += 1) {
      case03Runs.push(await runCase03(browser.page, base, 'ultimate'));
    }
    const case03Weak = await runCase03(browser.page, base, 'beginner');
    check('natural-case-03', '強角自然骰可達正式交付，未成功的局仍誠實有限／止損',
      case03Runs.some((run) => run.verified) && [...case03Runs, case03Weak].every((run) => run.ending),
      JSON.stringify({ case03Runs, case03Weak }));
    check('natural-case-03', '強弱角色都只使用原始資源與自然 RNG',
      [...case03Runs, case03Weak].every((run) => run.rngKind !== 'injected' && run.initialResources.token === 18 && run.initialResources.time === 12 && run.resources.token >= 0 && run.resources.time >= 0),
      JSON.stringify({ case03Runs, case03Weak }));
    check('natural-case-03', 'completed six-step runs earn both growth rewards; early stops do not',
      [...case03Runs, case03Weak].every((run) => run.attempts >= 6 ? run.rewards === 2 : run.rewards < 2),
      JSON.stringify({ case03Runs, case03Weak }));
    const external = browser.page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank');
    check('privacy', '自然遊玩沒有外部、教練或模型請求', external.length === 0, external.join(', '));
    check('browser', '自然遊玩沒有 console／JavaScript 錯誤', browser.page.errors.length === 0, browser.page.errors.join(' | '));
    await browser.page.screenshot(path.join(OUT, 'natural-final.png'));
  } catch (error) {
    check('browser', '自然遊玩流程', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = results.filter((row) => !row.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, base, total: results.length, failed: failed.length, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} natural-play checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
