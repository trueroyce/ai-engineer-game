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
const OUT = path.resolve(ROOT, arg('--out') ?? path.join('docs/testing/artifacts/phase-21', BROWSER));
const results = [];

function check(group, name, pass, detail = '') {
  const item = { group, name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} [${group}] ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

async function shot(page, name) {
  await page.screenshot(path.join(OUT, `${name}.png`));
}

async function finishCase(page, endingId = 'E01') {
  await page.eval(`(() => {
    const state = window.__AIEG_NARRATIVE_TEST__.state;
    state.phase = 'ended';
    state.ledger = ['requirements_clear', 'confirmed_spec', 'working_core', 'full_verification', 'final_delivery'];
    state.ending = { id: '${endingId}', baseId: '${endingId}', title: '測試結案', text: '這是一筆瀏覽器回歸用的公開結案。', facets: [] };
    window.__AIEG_NARRATIVE_TEST__.setState(state);
  })()`);
  await page.waitFor('document.querySelector("[data-return-lobby]")');
}

async function run(page, base) {
  await page.goto(base);
  const onboarding = await page.eval(`({
    title: document.querySelector('h1')?.textContent,
    templates: document.querySelectorAll('[data-template]').length,
    classic: Boolean(document.querySelector('a[href="./classic.html"]'))
  })`);
  check('onboarding', '新職涯提供六角色且保留第一版入口', onboarding.templates === 6 && onboarding.classic, JSON.stringify(onboarding));
  await page.tabTo('[data-template="balanced"]');
  const focus = await page.focusInfo();
  check('keyboard', '角色選擇可用 Tab 聚焦且有可見焦點', focus.focusVisible && focus.outline !== 'none', JSON.stringify(focus));
  await page.press('Enter');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll(".project").length === 4');
  const lobby = await page.eval(`({
    projects: document.querySelectorAll('.project').length,
    starts: document.querySelectorAll('.project-start').length,
    preparing: document.querySelectorAll('.project.preparing').length,
    text: document.querySelector('#app').textContent
  })`);
  check('lobby', '案件 01/02/03/04 都有開始入口', lobby.projects === 4 && lobby.starts === 4 && lobby.preparing === 0, JSON.stringify(lobby));
  await shot(page, '01-lobby-desktop');

  await page.setViewport(390, 844, true);
  const mobile = await page.eval(`({ width: document.documentElement.scrollWidth, viewport: innerWidth, startHeight: document.querySelector('.project-start').getBoundingClientRect().height })`);
  check('mobile', '390px 手機版無水平溢位且案件入口維持觸控高度', mobile.width <= mobile.viewport && mobile.startHeight >= 44, JSON.stringify(mobile));
  await shot(page, '02-lobby-mobile');
  await page.setViewport(1280, 900, false);

  await page.click('.project-start');
  await page.waitFor('document.querySelectorAll("[data-card]").length === 3');
  const setup = await page.eval(`({ cards: [...document.querySelectorAll('[data-card]')].map((el) => el.dataset.card), text: document.querySelector('#app').textContent })`);
  check('case', '職涯第一案直接沿用開場三選一並說明持有/啟用', setup.cards.length === 3 && setup.text.includes('職涯攜卡') && setup.text.includes('收藏卡不會暗中生效'), setup.text);
  await page.click(`[data-card="${setup.cards[0]}"]`);
  await page.click('[data-start]');
  await page.waitFor('document.querySelector("[data-action]")');
  const resources = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  check('case', '新案件短期 Token、壓力與時間按第一案規則重置', resources.token === 24 && resources.stress === 0 && resources.time === 12, JSON.stringify(resources));

  await finishCase(page);
  const firstSettlement = await page.eval(`({
    text: document.querySelector('#app').textContent,
    career: JSON.parse(localStorage.getItem('ai-engineer-game.career.v1')).career
  })`);
  check('settlement', '結案自動保存 career EXP、卡庫與回大廳入口', firstSettlement.career.exp === 6 && Object.keys(firstSettlement.career.cards).length >= 1 && firstSettlement.text.includes('職涯已結算'), JSON.stringify(firstSettlement.career));
  await shot(page, '03-career-settlement');
  await page.click('[data-return-lobby]');
  await page.waitFor('document.querySelectorAll(".project").length === 4');
  check('settlement', '完成或止損後可回大廳看到跨案摘要', (await page.text()).includes('已結束 1 次'));

  await page.click('.project-start');
  await page.waitFor('document.querySelectorAll("[data-card]").length === 3');
  const replayCards = await page.eval('[...document.querySelectorAll("[data-card]")].map((el) => el.dataset.card)');
  await page.click(`[data-card="${replayCards[0]}"]`);
  await page.click('[data-start]');
  await page.waitFor('document.querySelector("[data-action]")');
  await finishCase(page);
  const replay = await page.eval("JSON.parse(localStorage.getItem('ai-engineer-game.career.v1')).career");
  check('ledger', '重玩相同里程碑不重領 career EXP，但遊玩次數更新', replay.exp === 6 && replay.completedCases['case-01'].plays === 2, JSON.stringify({ exp: replay.exp, plays: replay.completedCases['case-01'].plays }));

  const external = page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank');
  check('privacy', '整個流程沒有外部網路請求', external.length === 0, external.join(', '));
  check('browser', '整個流程沒有 JavaScript 錯誤', page.errors.length === 0, page.errors.join(' | '));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: process.env.CHROME_PATH ?? EXECUTABLES[BROWSER] });
  try { await run(browser.page, base); }
  catch (error) {
    check('browser', '完整瀏覽器流程', false, error.stack ?? error.message);
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
