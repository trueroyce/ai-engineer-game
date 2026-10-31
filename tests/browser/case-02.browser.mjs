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
const OUT = path.resolve(ROOT, arg('--out') ?? path.join('docs/testing/artifacts/phase-23-case-02', BROWSER));
const results = [];

function check(group, name, pass, detail = '') {
  const item = { group, name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} [${group}] ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

async function shot(page, name) {
  await page.screenshot(path.join(OUT, `${name}.png`));
}

async function action(page, id, choices = null) {
  await page.click(`[data-case02-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case02-confirm]")');
  if (typeof choices === 'string') await page.click(choices);
  if (choices?.select) {
    for (const [key, value] of Object.entries(choices.select)) {
      await page.eval(`(() => { const el = document.querySelector('[data-case02-option="${key}"]'); el.value = '${value}'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await page.waitFor(`document.querySelector('[data-case02-option="${key}"]').value === '${value}'`);
    }
  }
  if (choices?.radio) await page.click(`input[value="${choices.radio}"]`);
  await page.click('[data-case02-confirm]');
  if (id !== 'B09') {
    await page.waitFor('document.querySelector("[data-case02-continue]")');
    await page.click('[data-case02-continue]');
  }
}

async function run(page, base) {
  await page.goto(base);
  await page.click('[data-template="balanced"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  const lobby = await page.eval(`({
    starts: document.querySelectorAll('.project-start').length,
    preparing: document.querySelectorAll('.project.preparing').length,
    case02: document.querySelector('.project:nth-child(2) .project-start')?.getAttribute('href'),
    text: document.querySelector('#app').innerText
  })`);
  check('lobby', '案件 01/02/03/04 皆可玩', lobby.starts === 4 && lobby.preparing === 0 && lobby.case02?.includes('case-02.html'), JSON.stringify(lobby));

  await page.click('.project:nth-child(2) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  const intro = await page.text();
  const introLower = intro.toLowerCase();
  check('intro', '公開三份來源與純模擬邊界', ['customers.csv', 'invoices.csv', 'refunds.csv', '不會啟動真 sub-agent'].every((text) => introLower.includes(text.toLowerCase())), intro);
  await shot(page, '01-intro-desktop');

  await page.click('[data-start-case]');
  await page.waitFor('document.querySelector("[data-case02-action]")');
  await page.eval(`(() => { const state = window.__AIEG_CASE02_TEST__.state; state.rng.event = { kind: 'injected', values: Array(32).fill(1), cursor: 0 }; window.__AIEG_CASE02_TEST__.setState(state); })()`);
  const initial = await page.eval('window.__AIEG_CASE02_TEST__.state');
  check('resources', '案內 Token/壓力/時間固定重設', initial.token === 18 && initial.stress === 0 && initial.timeLeft === 12, JSON.stringify({ token: initial.token, stress: initial.stress, time: initial.timeLeft }));

  await page.click('[data-case02-action="B01"]');
  const noDefault = await page.eval(`({
    values: [...document.querySelectorAll('[data-case02-option]')].map((el) => el.value),
    disabled: document.querySelector('[data-case02-confirm]').disabled
  })`);
  check('decision', '契約三項都沒有預選正解，未選完不能確認', noDefault.disabled && noDefault.values.every((value) => value === ''), JSON.stringify(noDefault));
  const beforeCancel = await page.eval('window.__AIEG_CASE02_TEST__.state');
  await page.press('Escape');
  await page.waitFor('window.__AIEG_CASE02_TEST__.screen === "board"');
  const afterCancel = await page.eval('window.__AIEG_CASE02_TEST__.state');
  check('cancel', '預覽按 Escape 取消不消耗資源或寫入狀態', JSON.stringify(beforeCancel) === JSON.stringify(afterCancel));

  await action(page, 'B01', { select: { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' } });
  await action(page, 'B02', { radio: 'one' });
  await action(page, 'B03');
  await page.waitFor('document.querySelector("[data-case02-reward]")');
  const rewardCount = await page.eval('document.querySelectorAll("[data-case02-reward]").length');
  check('reward', '首次整合出現可收藏/融合的三選一', rewardCount === 3, String(rewardCount));
  await page.click('[data-case02-reward]');
  await page.waitFor('window.__AIEG_CASE02_TEST__.screen === "board"');

  await action(page, 'B04', { radio: 'contract' });
  await action(page, 'B07');
  await action(page, 'B06', { radio: 'full' });
  const ready = await page.eval(`({ view: window.__AIEG_CASE02_TEST__.state, text: document.querySelector('#app').innerText })`);
  check('integration', '契約、變更、追溯與跨來源測試都成為真狀態', ready.view.ledger.includes('cross_source_tests') && ready.view.provenance && ready.view.tests.coverage === 4, JSON.stringify(ready.view.ledger));

  await action(page, 'B09', 'input[value="verified"]');
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const ending = await page.eval(`({
    text: document.querySelector('#app').innerText,
    career: JSON.parse(localStorage.getItem('ai-engineer-game.career.v1')).career
  })`);
  check('ending', 'verified 結局寫回 8 EXP、卡片與完成紀錄', ending.text.includes('C02-VERIFIED') && ending.career.exp === 8 && ending.career.completedCases['case-02'].plays === 1 && Object.keys(ending.career.cards).length === 1, JSON.stringify(ending.career));
  check('ledger', 'milestone 與卡獎勵使用穩定 ID 記帳', ending.career.rewardLedger.includes('case-02:verified_delivery') && ending.career.rewardLedger.includes('case-02:reward:integration-kit'), JSON.stringify(ending.career.rewardLedger));
  await shot(page, '02-verified-ending');

  await page.click('[data-return-lobby]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  check('return', '完成後回大廳並顯示案 2 次數', (await page.text()).includes('已完成 1 次'));

  await page.setViewport(390, 844, true);
  const mobile = await page.eval(`({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    heights: [...document.querySelectorAll('.project-start')].map((el) => el.getBoundingClientRect().height)
  })`);
  check('mobile', '390px 無橫向溢出且案件入口可觸控', mobile.width <= mobile.viewport && mobile.heights.every((height) => height >= 44), JSON.stringify(mobile));
  await shot(page, '03-lobby-mobile');

  const external = page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank');
  check('privacy', '全流程沒有外部請求或真模型呼叫', external.length === 0, external.join(', '));
  check('browser', '全流程沒有 JavaScript 錯誤', page.errors.length === 0, page.errors.join(' | '));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: process.env.CHROME_PATH ?? EXECUTABLES[BROWSER] });
  try { await run(browser.page, base); }
  catch (error) {
    check('browser', '完整案件 02 瀏覽器流程', false, error.stack ?? error.message);
    await shot(browser.page, 'error').catch(() => {});
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = results.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, base, total: results.length, failed: failed.length, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
