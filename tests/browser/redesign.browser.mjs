import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/phase-26-redesign/redesign/${BROWSER}`);
const results = [];
const check = (group, name, pass, detail = '') => { const row = { group, name, pass: Boolean(pass), detail: String(detail) }; results.push(row); console.log(`${row.pass ? 'PASS' : 'FAIL'} [${group}] ${name}${row.pass || !detail ? '' : ` — ${detail}`}`); };
const shot = (page, name) => page.screenshot(path.join(OUT, `${name}.png`));

async function freshCareer(page, base) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click('[data-template="balanced"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  const starter = await page.eval('document.querySelector("[data-starter-card]").dataset.starterCard');
  await page.click(`[data-starter-card="${starter}"]`);
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  return starter;
}

async function case02Action(page, id, choices = {}) {
  await page.click(`[data-case02-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case02-confirm]")');
  for (const [key, value] of Object.entries(choices.select ?? {})) {
    await page.eval(`(() => { const e = document.querySelector('[data-case02-option="${key}"]'); e.value = '${value}'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  if (choices.radio) await page.click(`input[value="${choices.radio}"]`);
  await page.click('[data-case02-confirm]');
  if (id !== 'B09') {
    await page.waitFor('document.querySelector("[data-case02-continue]")');
    const result = await page.text();
    await page.click('[data-case02-continue]');
    return result;
  }
  return page.text();
}

async function claim02(page, slot) {
  await page.waitFor('document.querySelectorAll("[data-case02-reward]").length === 3');
  check('case-02', `第 ${slot} 次成長是三選一`, (await page.eval('document.querySelectorAll("[data-case02-reward]").length')) === 3);
  await page.click('[data-case02-reward]');
  await page.waitFor('window.__AIEG_CASE02_TEST__.screen === "board"');
}

async function case03Action(page, id, choice = null) {
  await page.click(`[data-case03-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case03-confirm]")');
  if (choice) await page.click(`input[value="${choice}"]`);
  await page.click('[data-case03-confirm]');
  if (id !== 'C07') {
    await page.waitFor('document.querySelector("[data-case03-continue]")');
    const result = await page.text();
    await page.click('[data-case03-continue]');
    return result;
  }
  return page.text();
}

async function claim03(page, slot) {
  await page.waitFor('document.querySelectorAll("[data-case03-reward]").length === 3');
  check('case-03', `第 ${slot} 次成長是三選一`, (await page.eval('document.querySelectorAll("[data-case03-reward]").length')) === 3);
  await page.click('[data-case03-reward]');
  await page.waitFor('window.__AIEG_CASE03_TEST__.screen === "board"');
}

async function careerAndCase1(page, base) {
  const starter = await freshCareer(page, base);
  const lobby = await page.eval(`({ projects: document.querySelectorAll('.project').length, starts: document.querySelectorAll('.project-start').length, saved: JSON.parse(localStorage.getItem('ai-engineer-game.career.v2')).career })`);
  check('career', '角色後立即起手三選一並進入四案大廳', lobby.projects === 4 && lobby.starts === 4 && lobby.saved.starterSelection.cardId === starter);
  await page.click('.project:nth-child(1) .project-start');
  await page.waitFor('document.querySelector("[data-next=cards]")');
  const intro = await page.text();
  check('case-01', '職涯第一案沿用大廳角色與裝備，不再發開場獎勵', intro.includes('共用起手卡') && intro.includes('不會再抽一次'));
  await page.click('[data-next="cards"]');
  await page.waitFor('document.querySelector("[data-action]")');
  const before = await page.eval('({ runId: window.__AIEG_NARRATIVE_TEST__.state.runId, token: window.__AIEG_NARRATIVE_TEST__.state.token })');
  page.dialogResponse = true;
  await page.reload();
  page.dialogResponse = false;
  const after = await page.eval('({ runId: window.__AIEG_NARRATIVE_TEST__.state.runId, token: window.__AIEG_NARRATIVE_TEST__.state.token })');
  check('career', 'reload 恢復同一 active run 與案內資源', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
  await page.eval(`(() => { const s = window.__AIEG_NARRATIVE_TEST__.state; s.phase = 'ended'; s.ledger = ['requirements_clear','confirmed_spec','working_core','full_verification','final_delivery']; s.ending = { id:'E01', baseId:'E01', title:'測試交付', text:'固定合成路線', facets:[] }; window.__AIEG_NARRATIVE_TEST__.setState(s); })()`);
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  await page.click('[data-return-lobby]');
  await page.waitFor('document.querySelectorAll(".project").length === 4');
  const settled = await page.eval('JSON.parse(localStorage.getItem("ai-engineer-game.career.v2")).career');
  check('career', '結算清除 active run 並保留 settled run', !settled.activeRun && Object.keys(settled.settledRuns).length === 1 && settled.completedCases['case-01'].plays === 1);
  await page.setViewport(360, 800, true);
  const mobile = await page.eval('({ width: document.documentElement.scrollWidth, viewport: innerWidth, heights: [...document.querySelectorAll(".project-start")].map((e) => e.getBoundingClientRect().height) })');
  check('mobile', '360px 大廳無橫向溢位且觸控目標足夠', mobile.width <= mobile.viewport && mobile.heights.every((h) => h >= 44), JSON.stringify(mobile));
  await shot(page, '01-career-mobile');
  await page.setViewport(1280, 900, false);
}

async function case02(page, base) {
  await freshCareer(page, base);
  await page.click('.project:nth-child(2) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  await page.eval(`(() => { const s = window.__AIEG_CASE02_TEST__.state; s.token = 30; s.timeLeft = 30; s.rng.event = { kind:'injected', values:[100,1,100,1,...Array(40).fill(1)], cursor:0 }; window.__AIEG_CASE02_TEST__.setState(s); })()`);
  const contract = { select: { idPolicy:'canonical-map', datePolicy:'normalize-iso', duplicatePolicy:'latest-export' } };
  const failed = await case02Action(page, 'B01', contract);
  const repeated = await case02Action(page, 'B01', contract);
  const repeatedAttempt = await page.eval('window.__AIEG_CASE02_TEST__.state.lastAttempt');
  const recovered = await case02Action(page, 'B01', contract);
  const attempt = await page.eval('window.__AIEG_CASE02_TEST__.state.lastAttempt');
  check('case-02', '失敗後付費重試提高理解；同事件失敗顯示續篇且可再救回', failed !== recovered && repeated !== recovered && repeatedAttempt.sequel === 2 && attempt.retry && attempt.retryLearningGain > 0, JSON.stringify({ repeatedAttempt, attempt }));
  await case02Action(page, 'B02', { radio:'one' });
  await claim02(page, 1);
  await case02Action(page, 'B03');
  await case02Action(page, 'B04', { radio:'contract' });
  await claim02(page, 2);
  await case02Action(page, 'B07');
  await case02Action(page, 'B06', { radio:'full' });
  await case02Action(page, 'B09', { radio:'verified' });
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const ending = await page.eval(`({ text: document.querySelector('#app').innerText, career: JSON.parse(localStorage.getItem('ai-engineer-game.career.v2')).career })`);
  check('case-02', '成功結局隱藏內部 ID、結算兩次獎勵並保存', !ending.text.includes('C02-') && ending.career.completedCases['case-02'].plays === 1 && !ending.career.activeRun && ending.career.rewardLedger.filter((id) => id.includes(':reward:')).length === 2);
  await shot(page, '02-case02-ending');
}

async function case03(page, base) {
  await freshCareer(page, base);
  await page.click('.project:nth-child(3) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  await page.eval(`(() => { const s = window.__AIEG_CASE03_TEST__.state; s.token = 30; s.timeLeft = 30; s.rng.event = { kind:'injected', values:[100,1,100,1,...Array(40).fill(1)], cursor:0 }; window.__AIEG_CASE03_TEST__.setState(s); })()`);
  const failed = await case03Action(page, 'C01', 'full');
  const repeated = await case03Action(page, 'C01', 'full');
  const repeatedAttempt = await page.eval('window.__AIEG_CASE03_TEST__.state.lastAttempt');
  const recovered = await case03Action(page, 'C01', 'full');
  const attempt = await page.eval('window.__AIEG_CASE03_TEST__.state.lastAttempt');
  check('case-03', 'NPC 需求失敗可付費重試；同事件失敗顯示續篇且可再救回', failed !== recovered && repeated !== recovered && repeatedAttempt.sequel === 2 && attempt.retry && attempt.retryLearningGain > 0, JSON.stringify({ repeatedAttempt, attempt }));
  await case03Action(page, 'C02', 'explicit');
  await claim03(page, 1);
  await case03Action(page, 'C03', 'pair');
  await case03Action(page, 'C04', 'strict');
  await claim03(page, 2);
  await case03Action(page, 'C05', 'negotiate');
  await case03Action(page, 'C06', 'full');
  await case03Action(page, 'C07', 'verified');
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const ending = await page.eval(`({ text: document.querySelector('#app').innerText, career: JSON.parse(localStorage.getItem('ai-engineer-game.career.v2')).career })`);
  check('case-03', '協作結局隱藏內部 ID、保存兩次獎勵與 NPC 過程', !ending.text.includes('C03-') && ending.career.completedCases['case-03'].plays === 1 && ending.career.rewardLedger.filter((id) => id.includes(':reward:')).length === 2);
  await shot(page, '03-case03-ending');
}

async function main() {
  fs.mkdirSync(OUT, { recursive:true });
  const server = await startServer({ port:0, quiet:true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXE[BROWSER] });
  try {
    await careerAndCase1(browser.page, base);
    await case02(browser.page, base);
    await case03(browser.page, base);
    const external = browser.page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank');
    check('privacy', '測試中的案件沒有外部網路、localhost 教練或模型請求', external.length === 0, external.join(', '));
    check('browser', '測試中的案件沒有 console／JavaScript 錯誤', browser.page.errors.length === 0, browser.page.errors.join(' | '));
  } catch (error) {
    check('browser', '完整改版瀏覽器流程', false, error.stack ?? error.message);
    await shot(browser.page, 'error').catch(() => {});
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = results.filter((r) => !r.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser:BROWSER, base, total:results.length, failed:failed.length, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
