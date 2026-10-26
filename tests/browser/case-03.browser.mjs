import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const BROWSER = value('--browser') ?? 'chrome';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.resolve(ROOT, value('--out') ?? `docs/testing/artifacts/phase-25-case-03/${BROWSER}`);
const results = [];
const check = (group, name, pass, detail = '') => { results.push({ group, name, pass: Boolean(pass), detail: String(detail) }); console.log(`${pass ? 'PASS' : 'FAIL'} [${group}] ${name}`); };
const shot = (page, name) => page.screenshot(path.join(OUT, `${name}.png`));

async function action(page, id, choice = null) {
  await page.click(`[data-case03-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case03-confirm]")');
  if (choice) await page.click(`input[value="${choice}"]`);
  await page.click('[data-case03-confirm]');
  if (id !== 'C07') { await page.waitFor('document.querySelector("[data-case03-continue]")'); await page.click('[data-case03-continue]'); }
}

async function run(page, base) {
  await page.goto(base);
  await page.click('[data-template="balanced"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 3');
  check('lobby', '三案都可開始且進階不硬鎖', (await page.eval('document.querySelectorAll(".project-start").length')) === 3);
  await page.click('.project:nth-child(3) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  const intro = await page.text();
  check('intro', 'NPC 客戶、設計師、工程師與模擬界線可見', ['NPC 客戶', 'NPC 設計師', 'NPC 工程師', '不會連線多人'].every((text) => intro.includes(text)), intro);
  await shot(page, '01-intro');

  await page.click('[data-start-case]');
  await page.eval(`(() => { const s = window.__AIEG_CASE03_TEST__.state; s.rng.event = { kind: 'injected', values: Array(32).fill(1), cursor: 0 }; window.__AIEG_CASE03_TEST__.setState(s); })()`);
  const start = await page.eval('window.__AIEG_CASE03_TEST__.state');
  check('resources', '案內資源重設 18/0/12', start.token === 18 && start.stress === 0 && start.timeLeft === 12);

  await page.click('[data-case03-action="C01"]');
  const decision = await page.eval('({ checked: document.querySelectorAll("input:checked").length, disabled: document.querySelector("[data-case03-confirm]").disabled })');
  check('decision', '沒有預選正解且未選不能確認', decision.checked === 0 && decision.disabled, JSON.stringify(decision));
  const before = await page.eval('window.__AIEG_CASE03_TEST__.state');
  await page.press('Escape');
  const after = await page.eval('window.__AIEG_CASE03_TEST__.state');
  check('cancel', 'Escape 取消不改狀態', JSON.stringify(before) === JSON.stringify(after));

  await action(page, 'C01', 'full');
  await action(page, 'C02', 'explicit');
  await action(page, 'C03', 'pair');
  await page.waitFor('document.querySelector("[data-case03-reward]")');
  check('reward', '中段三選一後仍有後續玩法', (await page.eval('document.querySelectorAll("[data-case03-reward]").length')) === 3);
  await page.click('[data-case03-reward]');
  await action(page, 'C04', 'strict');
  await action(page, 'C05', 'negotiate');
  await action(page, 'C06', 'full');
  await action(page, 'C07', 'verified');
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const ending = await page.eval(`({ text: document.querySelector('#app').innerText, career: JSON.parse(localStorage.getItem('ai-engineer-game.career.v1')).career })`);
  check('ending', '正式交付結算 8 EXP 與 stable ledger', ending.text.includes('C03-VERIFIED') && ending.career.exp === 8 && ending.career.rewardLedger.includes('case-03:verified_delivery') && ending.career.rewardLedger.includes('case-03:reward:handoff-kit'), JSON.stringify(ending.career));
  await shot(page, '02-ending');

  await page.click('[data-return-lobby]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 3');
  await page.setViewport(390, 844, true);
  const mobile = await page.eval('({ width: document.documentElement.scrollWidth, viewport: innerWidth, heights: [...document.querySelectorAll(".project-start")].map((e) => e.getBoundingClientRect().height) })');
  check('mobile', '390px 無水平溢位且入口可觸控', mobile.width <= mobile.viewport && mobile.heights.every((height) => height >= 44), JSON.stringify(mobile));
  await shot(page, '03-mobile');
  check('privacy', '沒有外部網路或模型請求', page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank').length === 0);
  check('browser', '沒有 JavaScript 錯誤', page.errors.length === 0, page.errors.join(' | '));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const browser = await launch({ executable: EXE[BROWSER] });
  try { await run(browser.page, `http://127.0.0.1:${server.address().port}/`); }
  catch (error) { check('browser', '案件 03 完整流程', false, error.stack ?? error.message); await shot(browser.page, 'error').catch(() => {}); }
  finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
  const failed = results.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, total: results.length, failed: failed.length, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((error) => { console.error(error); process.exit(2); });
