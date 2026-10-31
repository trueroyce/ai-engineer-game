import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/case03-04-narrative/${BROWSER}`);
const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass || !detail ? '' : ` — ${detail}`}`);
}

async function freshCareer(page, base, projectNumber) {
  page.dialogResponse = true;
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  page.dialogResponse = false;
  await page.click('[data-template="ultimate"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  await page.click(`.project:nth-child(${projectNumber}) .project-start`);
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
}

async function claim03(page) {
  if (await page.eval('window.__AIEG_CASE03_TEST__.screen === "reward"')) {
    await page.click('[data-case03-reward]');
    await page.waitFor('window.__AIEG_CASE03_TEST__.screen === "board"');
  }
}

async function act03(page, id, value) {
  await page.click(`[data-case03-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case03-confirm]")');
  if (value) await page.click(`input[value="${value}"]`);
  await page.click('[data-case03-confirm]');
  await page.waitFor('document.querySelector("[data-case03-continue]")');
}

async function continue03(page) {
  await page.click('[data-case03-continue]');
  await claim03(page);
  await page.waitFor('window.__AIEG_CASE03_TEST__.screen === "board"');
}

async function claim04(page) {
  if (await page.eval('window.__AIEG_CASE04_TEST__.screen === "reward"')) {
    await page.click('[data-case04-reward]');
    await page.waitFor('window.__AIEG_CASE04_TEST__.screen === "board"');
  }
}

async function act04(page, id, value) {
  await page.click(`[data-case04-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case04-confirm]")');
  if (value) await page.click(`input[value="${value}"]`);
  await page.click('[data-case04-confirm]');
  await page.waitFor('document.querySelector("[data-case04-continue]")');
}

async function continue04(page) {
  await page.click('[data-case04-continue]');
  await claim04(page);
  await page.waitFor('window.__AIEG_CASE04_TEST__.screen === "board"');
}

async function end04(page, intent) {
  await page.click('[data-case04-action="D09"]');
  await page.waitFor('document.querySelector("[data-case04-confirm]")');
  await page.click(`input[value="${intent}"]`);
  await page.click('[data-case04-confirm]');
  await page.waitFor('document.querySelector(".ending")');
  return page.eval('document.querySelector("[data-case04-scene]").innerText');
}

async function mobileStage(page, selector) {
  await page.setViewport(390, 844, true);
  const result = await page.eval(`({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    cast: document.querySelectorAll('${selector} .scene-cast').length,
    roleSizes: [...document.querySelectorAll('${selector} .scene-cast small')].map((item) => parseFloat(getComputedStyle(item).fontSize)),
    clipped: [...document.querySelectorAll('${selector} .scene-cast small')].some((item) => item.scrollWidth > item.clientWidth)
  })`);
  await page.setViewport(1280, 900, false);
  return result;
}

async function case03Narrative(page, base) {
  await freshCareer(page, base, 3);
  await page.waitFor('document.querySelector("[data-case03-scene]")');
  const opening = await page.eval('document.querySelector("[data-case03-scene]").innerText');
  check('case 03 opening has its recurring cast', ['阿改', '小美', '老周'].every((name) => opening.includes(name)), opening);

  await page.eval(`(() => { const s = window.__AIEG_CASE03_TEST__.state; s.token = 30; s.timeLeft = 30; s.rng.event = { kind:'injected', values:[100,...Array(60).fill(1)], cursor:0 }; window.__AIEG_CASE03_TEST__.setState(s); })()`);
  await act03(page, 'C01', 'full');
  const failed = await page.eval('({ text: document.querySelector("[data-case03-scene]").innerText, recovery: window.__AIEG_CASE03_TEST__.state.story.openRecovery })');
  check('case 03 failure opens costly viable recovery', failed.recovery?.sourceAction === 'C01' && failed.text.includes('可用資訊'), JSON.stringify(failed));
  await continue03(page);
  await page.click('[data-case03-action="C09"]');
  const recoveryChoices = await page.eval('[...document.querySelectorAll("input[type=radio]")].map((item) => item.value)');
  check('case 03 failure offers distinct recovery costs', recoveryChoices.includes('prototype') && recoveryChoices.includes('trim') && recoveryChoices.includes('force'), recoveryChoices.join(', '));

  await freshCareer(page, base, 3);
  await page.eval(`(() => { const s = window.__AIEG_CASE03_TEST__.state; s.token = 30; s.timeLeft = 30; s.rng.event = { kind:'injected', values:Array(80).fill(1), cursor:0 }; window.__AIEG_CASE03_TEST__.setState(s); })()`);
  await act03(page, 'C01', 'full');
  await continue03(page);
  await act03(page, 'C02', 'async');
  const asyncResult = await page.eval('document.querySelector("[data-case03-scene]").innerText');
  check('case 03 result describes the action already taken', asyncResult.includes('已在群組核准整份契約') && asyncResult.includes('責任缺口會在合併時回來'), asyncResult);
  await continue03(page);
  await act03(page, 'C03', 'agent');
  await continue03(page);
  await act03(page, 'C04', 'strict');
  const merge = await page.eval('({ text: document.querySelector("[data-case03-scene]").innerText, commitments: window.__AIEG_CASE03_TEST__.state.story.commitments })');
  check('case 03 merge recalls both earlier decisions', merge.commitments.asyncApproval === 'surfaced' && merge.commitments.interfaceDrift === 'surfaced' && merge.text.includes('責任和 cancel 介面一起浮上來'), JSON.stringify(merge));
  const mobile = await mobileStage(page, '[data-case03-scene]');
  check('case 03 390px stage is legible without overflow', mobile.cast === 3 && mobile.roleSizes.every((size) => size >= 11) && !mobile.clipped && mobile.scrollWidth <= mobile.width, JSON.stringify(mobile));
  await continue03(page);
  page.dialogResponse = true;
  await page.reload();
  page.dialogResponse = false;
  await page.waitFor('window.__AIEG_CASE03_TEST__.screen === "board"');
  const reloaded = await page.eval('({ cast: document.querySelectorAll("[data-case03-scene] .scene-cast").length, commitments: window.__AIEG_CASE03_TEST__.state.story.commitments })');
  check('case 03 save reload preserves callbacks and stage', reloaded.cast === 3 && reloaded.commitments.asyncApproval === 'surfaced', JSON.stringify(reloaded));

  await freshCareer(page, base, 3);
  await page.click('[data-case03-action="C07"]');
  await page.waitFor('document.querySelector("[data-case03-confirm]")');
  await page.click('input[value="risk"]');
  await page.click('[data-case03-confirm]');
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const riskEnding = await page.eval('document.querySelector("[data-case03-scene]").innerText');
  check('case 03 risk ending does not claim verified evidence', riskEnding.includes('帶著公開缺口硬交') && !riskEnding.includes('證據對上了'), riskEnding);
}

async function case04Narrative(page, base) {
  await freshCareer(page, base, 4);
  await page.waitFor('document.querySelector("[data-case04-scene]")');
  const opening = await page.eval('document.querySelector("[data-case04-scene]").innerText');
  check('case 04 has a distinct incident-room cast', ['阿維', '惠姐', '小燈'].every((name) => opening.includes(name)) && !opening.includes('阿改'), opening);
  await page.eval(`(() => { const s = window.__AIEG_CASE04_TEST__.state; s.token = 30; s.timeLeft = 30; s.rng.event = { kind:'injected', values:Array(80).fill(1), cursor:0 }; window.__AIEG_CASE04_TEST__.setState(s); })()`);
  await act04(page, 'D01', 'reproduce');
  await continue04(page);
  await act04(page, 'D02', 'rollback');
  const strategy = await page.eval('document.querySelector("[data-case04-scene]").innerText');
  check('case 04 strategy names its delayed cost', strategy.includes('schema 相容') && strategy.includes('這條路之後會帶回'), strategy);
  await continue04(page);
  const gate = await page.eval('({ d10: Boolean(document.querySelector("[data-case04-action=D10]")), d03: Boolean(document.querySelector("[data-case04-action=D03]")), text: document.querySelector("[data-case04-scene]").innerText })');
  check('case 04 rollback preflight blocks execution', gate.d10 && !gate.d03 && gate.text.includes('資料不一定答應'), JSON.stringify(gate));
  await act04(page, 'D10', 'inspect');
  const preflight = await page.eval('document.querySelector("[data-case04-scene]").innerText');
  check('case 04 compatibility result is revision-bound', preflight.includes('舊／新資料樣本已證明相容') && preflight.includes('綁定目前 revision'), preflight);
  const mobile = await mobileStage(page, '[data-case04-scene]');
  check('case 04 390px stage is legible without overflow', mobile.cast === 3 && mobile.roleSizes.every((size) => size >= 11) && !mobile.clipped && mobile.scrollWidth <= mobile.width, JSON.stringify(mobile));

  await freshCareer(page, base, 4);
  await page.eval(`(() => { const s = window.__AIEG_CASE04_TEST__.state; s.token = 60; s.timeLeft = 60; s.rng.event = { kind:'injected', values:Array(80).fill(1), cursor:0 }; window.__AIEG_CASE04_TEST__.setState(s); })()`);
  await act04(page, 'D01', 'reproduce');
  await continue04(page);
  await act04(page, 'D02', 'rollback');
  await continue04(page);
  const riskEnding = await end04(page, 'risk');
  check('case 04 rollback risk ending names unchecked and unapproved state', riskEnding.includes('資料相容仍是') && riskEnding.includes('尚未取得負責人核准') && riskEnding.includes('結局仍記為失敗') && !riskEnding.includes('已證明相容'), riskEnding);

  await freshCareer(page, base, 4);
  await page.eval(`(() => { const s = window.__AIEG_CASE04_TEST__.state; s.token = 60; s.timeLeft = 60; s.cards.C4 = 1; s.equipped = ['C4']; s.rng.event = { kind:'injected', values:Array(120).fill(1), cursor:0 }; window.__AIEG_CASE04_TEST__.setState(s); })()`);
  await act04(page, 'D01', 'reproduce');
  await continue04(page);
  await act04(page, 'D02', 'rollback');
  await continue04(page);
  await act04(page, 'D10', 'isolate');
  await continue04(page);
  await act04(page, 'D03', 'sequential');
  await continue04(page);
  await act04(page, 'D04', 'freeze');
  await continue04(page);
  await act04(page, 'D05', 'deploy');
  await continue04(page);
  await act04(page, 'D07', 'full');
  await continue04(page);
  await act04(page, 'D06', 'isolate');
  await continue04(page);
  await act04(page, 'D08', 'complete');
  await continue04(page);
  await act04(page, 'D11', 'limited');
  await continue04(page);
  const isolateEnding = await end04(page, 'limited');
  check('case 04 isolate ending distinguishes isolation from compatibility', isolateEnding.includes('新寫入已隔離') && isolateEnding.includes('不是因為相容') && isolateEnding.includes('有限維持') && !isolateEnding.includes('舊／新資料樣本已證明相容'), isolateEnding);

  await freshCareer(page, base, 4);
  await page.eval(`(() => { const s = window.__AIEG_CASE04_TEST__.state; s.token = 30; s.timeLeft = 30; s.rng.event = { kind:'injected', values:[1,1,100,...Array(80).fill(1)], cursor:0 }; window.__AIEG_CASE04_TEST__.setState(s); })()`);
  await act04(page, 'D01', 'logs');
  await continue04(page);
  await act04(page, 'D02', 'patch');
  await continue04(page);
  await act04(page, 'D03', 'parallel');
  const failed = await page.eval('window.__AIEG_CASE04_TEST__.state.story.outcome');
  await continue04(page);
  await page.click('[data-case04-action="D04"]');
  const failureChoices = await page.eval('[...document.querySelectorAll("input[type=radio]")].map((item) => item.value)');
  check('case 04 failure opens alternate and hard tradeoffs', failed === 'failure' && failureChoices.includes('alternate') && failureChoices.includes('hard'), JSON.stringify({ failed, failureChoices }));
  await page.click('input[value="alternate"]');
  await page.click('[data-case04-confirm]');
  await page.waitFor('document.querySelector("[data-case04-continue]")');
  const alternate = await page.eval('document.querySelector("[data-case04-scene]").innerText');
  check('case 04 fallback is viable but explicitly limited', alternate.includes('部分功能已關閉') && alternate.includes('有限維持'), alternate);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true, enableLocalCoach: false });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXECUTABLES[BROWSER] });
  try {
    await case03Narrative(browser.page, base);
    await case04Narrative(browser.page, base);
    const external = browser.page.requests.filter((url) => !url.startsWith(base) && !url.startsWith('data:') && url !== 'about:blank');
    check('prototype makes no external requests', external.length === 0, external.join(', '));
    check('prototype has no console or JavaScript errors', browser.page.errors.length === 0, browser.page.errors.join(' | '));
  } catch (error) {
    check('narrative browser flow completed', false, error.stack ?? error.message);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = checks.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, base, checks, failed: failed.length }, null, 2));
  console.log(`${BROWSER}: ${checks.length} narrative checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
