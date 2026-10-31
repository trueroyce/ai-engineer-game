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
  const onboarding = await page.eval(`(async () => {
    const portraits = [...document.querySelectorAll('[data-template] .raster-template')];
    const backgrounds = portraits.map((node) => getComputedStyle(node).backgroundImage);
    const decoded = await Promise.all(portraits.map((node) => new Promise((resolve) => {
      const url = getComputedStyle(node).getPropertyValue('--portrait-image').match(/url\\(["']?(.*?)["']?\\)/)?.[1];
      const image = new Image();
      image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ url, width: 0, height: 0 });
      image.src = url;
    })));
    return {
      title: document.querySelector('h1')?.textContent,
      templates: document.querySelectorAll('[data-template]').length,
      classic: Boolean(document.querySelector('a[href="./classic.html"]')),
      portraits: portraits.length,
      backgrounds,
      decoded,
      selected: (() => {
        const node = document.querySelector('[data-template][aria-pressed="true"]');
        const style = getComputedStyle(node);
        return { text: node?.textContent ?? '', color: style.color, background: style.backgroundColor };
      })()
    };
  })()`);
  check('onboarding', '新職涯提供六角色且保留第一版入口', onboarding.templates === 6 && onboarding.classic, JSON.stringify(onboarding));
  check('onboarding', '六張職涯立繪實際套用且可解碼', onboarding.portraits === 6 && onboarding.backgrounds.every((value) => value.includes('url(')) && onboarding.decoded.every((asset) => asset.width > 0 && asset.height > 0), JSON.stringify(onboarding));
  check('onboarding', '預選角色卡的文字與底色維持可讀對比', onboarding.selected.text.length > 20 && onboarding.selected.color !== onboarding.selected.background, JSON.stringify(onboarding.selected));
  await shot(page, '00-onboarding-desktop');
  await page.tabTo('[data-template="balanced"]');
  const focus = await page.focusInfo();
  check('keyboard', '角色選擇可用 Tab 聚焦且有可見焦點', focus.focusVisible && focus.outline !== 'none', JSON.stringify(focus));
  await page.press('Enter');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project").length === 4');
  const lobby = await page.eval(`(async () => {
    const decodeArt = (nodes, property) => Promise.all(nodes.map((node) => new Promise((resolve) => {
      const background = getComputedStyle(node).backgroundImage;
      const url = getComputedStyle(node).getPropertyValue(property).match(/url\\(["']?(.*?)["']?\\)/)?.[1];
      const image = new Image();
      image.onload = () => resolve({ background, url, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ background, url, width: 0, height: 0 });
      image.src = url;
    })));
    const caseNodes = [...document.querySelectorAll('.project .raster-case-file')];
    const cardNodes = [...document.querySelectorAll('.owned-card .raster-card')];
    return {
      projects: document.querySelectorAll('.project').length,
      starts: document.querySelectorAll('.project-start').length,
      preparing: document.querySelectorAll('.project.preparing').length,
      text: document.querySelector('#app').textContent,
      activeCardText: document.querySelector('.owned-card.active')?.textContent ?? '',
      activeCardBadge: getComputedStyle(document.querySelector('.owned-card.active'), '::after').content,
      caseArt: await decodeArt(caseNodes, '--scene-image'),
      cardArt: await decodeArt(cardNodes, '--card-image')
    };
  })()`);
  check('lobby', '案件 01/02/03/04 都有開始入口', lobby.projects === 4 && lobby.starts === 4 && lobby.preparing === 0, JSON.stringify(lobby));
  check('lobby', '四案背景圖實際套用、請求並可解碼', lobby.caseArt.length === 4 && lobby.caseArt.every((asset) => asset.background.includes('url(') && asset.width > 0 && asset.height > 0), JSON.stringify(lobby.caseArt));
  check('lobby', '卡庫插圖實際套用、請求並可解碼', lobby.cardArt.length >= 1 && lobby.cardArt.every((asset) => asset.background.includes('url(') && asset.width > 0 && asset.height > 0), JSON.stringify(lobby.cardArt));
  check('lobby', '已裝備卡只保留一個清楚狀態，不重複點擊提示', lobby.activeCardBadge.includes('已裝備') && !lobby.activeCardText.includes('本案啟用中') && !lobby.activeCardText.includes('點一下'), JSON.stringify(lobby));
  await shot(page, '01-lobby-desktop');

  await page.setViewport(390, 844, true);
  const mobile = await page.eval(`({ width: document.documentElement.scrollWidth, viewport: innerWidth, startHeight: document.querySelector('.project-start').getBoundingClientRect().height })`);
  check('mobile', '390px 手機版無水平溢位且案件入口維持觸控高度', mobile.width <= mobile.viewport && mobile.startHeight >= 44, JSON.stringify(mobile));
  await shot(page, '02-lobby-mobile');
  await page.setViewport(1280, 900, false);

  await page.click('.project-start');
  await page.waitFor('document.querySelector("[data-next=cards]")');
  await page.click('[data-next=cards]');
  await page.waitFor('document.querySelector("[data-action]")');
  const setup = await page.eval(`({ equipped: window.__AIEG_NARRATIVE_TEST__.state.equipped, hasOpeningDraw: Boolean(document.querySelector('[data-card]')) })`);
  check('case', '職涯第一案沿用大廳裝備，沒有重抽工具', setup.equipped.length === 1 && !setup.hasOpeningDraw, JSON.stringify(setup));
  const resources = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  check('case', '新案件短期 Token、壓力與時間按第一案規則重置', resources.token === 24 && resources.stress === 0 && resources.time === 12, JSON.stringify(resources));

  await finishCase(page);
  const firstSettlement = await page.eval(`({
    text: document.querySelector('#app').textContent,
    career: JSON.parse(localStorage.getItem('ai-engineer-game.career.v2')).career
  })`);
  check('settlement', '結案自動保存 career EXP、卡庫與回大廳入口', firstSettlement.career.exp === 6 && Object.keys(firstSettlement.career.cards).length >= 1 && firstSettlement.text.includes('職涯已結算'), JSON.stringify(firstSettlement.career));
  await shot(page, '03-career-settlement');
  await page.click('[data-return-lobby]');
  await page.waitFor('document.querySelectorAll(".project").length === 4');
  check('settlement', '完成或止損後可回大廳看到跨案摘要', (await page.text()).includes('已結束 1 次'));

  await page.click('.project-start');
  await page.waitFor('document.querySelector("[data-next=cards]")');
  await page.click('[data-next=cards]');
  await page.waitFor('document.querySelector("[data-action]")');
  await finishCase(page);
  const replay = await page.eval("JSON.parse(localStorage.getItem('ai-engineer-game.career.v2')).career");
  check('ledger', '合法新 run 會再次結算 EXP 並更新遊玩次數', replay.exp === 12 && replay.completedCases['case-01'].plays === 2, JSON.stringify({ exp: replay.exp, plays: replay.completedCases['case-01'].plays }));

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
