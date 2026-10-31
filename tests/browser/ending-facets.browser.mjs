import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNarrativeGame } from '../../src/narrative/engine.js';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.resolve(arg('--out') ?? path.join(ROOT, 'docs/testing/artifacts/ending-facets', BROWSER));
const results = [];

function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail: String(detail) };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

async function claimCase01Reward(page) {
  if (!(await page.eval('Boolean(document.querySelector("[data-upgrade]"))'))) return;
  await page.click('[data-upgrade]');
  await page.waitFor('document.querySelector("[data-action]")');
}

async function case01Action(page, actionId, option = null) {
  await page.click(`[data-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-confirm]")');
  if (option) {
    await page.eval(`(() => {
      const element = document.querySelector('[data-option="${option.key}"]');
      element.value = '${option.value}';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitFor('!document.querySelector("[data-confirm]").disabled');
  }
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  await page.click('[data-continue]');
  await page.waitFor('document.querySelector("[data-upgrade]") || document.querySelector("[data-action]")');
  await claimCase01Reward(page);
}

async function normalCase01Ending(page, base) {
  await page.goto(`${base}case-01.html?seed=ui-route-10`);
  await page.click('[data-next="cards"]');
  await page.waitFor('document.querySelector("[data-card]")');
  await page.click('[data-card]');
  await page.click('[data-start]');
  await page.waitFor('document.querySelector("[data-action=A01]")');
  await case01Action(page, 'A01');
  await case01Action(page, 'A04');
  await case01Action(page, 'A05');
  await case01Action(page, 'A07', { key: 'target', value: 'persistence' });
  await case01Action(page, 'A13', { key: 'route', value: 'steady' });
  await case01Action(page, 'A09');
  await case01Action(page, 'A08');
  await case01Action(page, 'A14', { key: 'route', value: 'cite-evidence' });
  await page.click('[data-action="A12"]');
  await page.waitFor('document.querySelector("[data-confirm]")');
  await page.click('input[value="stop"]');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector(".ending-badge")');
  return page.eval(`({
    baseId: window.__AIEG_NARRATIVE_TEST__.state.ending.baseId,
    facetIds: window.__AIEG_NARRATIVE_TEST__.state.ending.facets,
    titles: [...document.querySelectorAll('.ending-badge h2')].map((node) => node.innerText.trim()),
    copy: [...document.querySelectorAll('.ending-badge p')].map((node) => node.innerText.trim()),
  })`);
}

async function freshCareerCase(page, base, caseNumber) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click('[data-template="beginner"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  await page.click(`.project:nth-child(${caseNumber}) .project-start`);
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  await page.waitFor(`Boolean(window.__AIEG_CASE0${caseNumber}_TEST__?.state)`);
}

async function badgeAudit(page, cardSelector = '.ending-badge', headingSelector = 'h2') {
  await page.waitFor(`document.querySelectorAll(${JSON.stringify(cardSelector)}).length > 0`);
  await page.waitFor(`[...document.querySelectorAll(${JSON.stringify(cardSelector)})].every((node) => Number(getComputedStyle(node).opacity) > .99)`);
  return page.eval(`(() => ({
    viewport: innerWidth,
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    badges: [...document.querySelectorAll(${JSON.stringify(cardSelector)})].map((card) => {
      const title = card.querySelector(${JSON.stringify(headingSelector)});
      const copy = card.querySelector('p');
      const cardRect = card.getBoundingClientRect();
      const titleRect = title?.getBoundingClientRect();
      const copyRect = copy?.getBoundingClientRect();
      const titleStyle = title ? getComputedStyle(title) : null;
      const copyStyle = copy ? getComputedStyle(copy) : null;
      return {
        title: title?.innerText.trim() ?? '',
        copy: copy?.innerText.trim() ?? '',
        titleDisplay: titleStyle?.display ?? '',
        titleVisibility: titleStyle?.visibility ?? '',
        titleOpacity: titleStyle?.opacity ?? '',
        titleColor: titleStyle?.color ?? '',
        copyDisplay: copyStyle?.display ?? '',
        copyVisibility: copyStyle?.visibility ?? '',
        copyOpacity: copyStyle?.opacity ?? '',
        titleInside: Boolean(titleRect && titleRect.width > 0 && titleRect.height > 0 && titleRect.left >= cardRect.left - 2 && titleRect.right <= cardRect.right + 2),
        copyInside: Boolean(copyRect && copyRect.width > 0 && copyRect.height > 0 && copyRect.left >= cardRect.left - 2 && copyRect.right <= cardRect.right + 2),
      };
    }),
  }))()`);
}

function visible(audit, expectedCount) {
  return audit.badges.length === expectedCount
    && !audit.documentOverflow
    && audit.badges.every((item) => item.title && item.copy
      && item.titleDisplay !== 'none' && item.copyDisplay !== 'none'
      && item.titleVisibility === 'visible' && item.copyVisibility === 'visible'
      && Number(item.titleOpacity) > .99 && Number(item.copyOpacity) > .99
      && item.titleColor !== 'rgba(0, 0, 0, 0)'
      && item.titleInside && item.copyInside);
}

async function checkAtDesktopAndMobile(page, name, expectedCount, cardSelector = '.ending-badge', headingSelector = 'h2') {
  await page.setViewport(1280, 900, false);
  const desktop = await badgeAudit(page, cardSelector, headingSelector);
  check(`${name} desktop badge titles and explanations are visible`, visible(desktop, expectedCount), JSON.stringify(desktop));
  await page.screenshot(path.join(OUT, `${name}-desktop.png`));
  await page.setViewport(390, 844, true);
  const mobile = await badgeAudit(page, cardSelector, headingSelector);
  check(`${name} 390px badge titles and explanations are visible`, visible(mobile, expectedCount), JSON.stringify(mobile));
  await page.eval(`document.querySelector(${JSON.stringify(cardSelector)})?.scrollIntoView({ block: 'center' })`);
  await page.screenshot(path.join(OUT, `${name}-390.png`));
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, root: ROOT, quiet: true, enableLocalCoach: false });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXE[BROWSER], width: 1280, height: 900 });
  try {
    const { page } = browser;
    const normal = await normalCase01Ending(page, base);
    check('normal UI Case 01 route earns the same two badges reported by the user', normal.baseId === 'E08'
      && normal.facetIds.join(',') === 'implementation-persistence,route-steady'
      && normal.titles.every(Boolean) && normal.copy.every(Boolean), JSON.stringify(normal));
    await checkAtDesktopAndMobile(page, 'case01-normal-ui', 2);

    await page.goto(`${base}case-01.html?seed=ending-facet-audit`);
    const case01 = createNarrativeGame({ seed: 'ending-facet-audit', templateId: 'balanced' });
    case01.phase = 'ended';
    case01.ending = {
      baseId: 'E01',
      title: '先穩住，再讓承諾有證據',
      text: '你選擇鎖住已驗證範圍，後來的承諾追問也用紀錄接住。',
      facets: ['implementation-persistence', 'route-steady'],
    };
    await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(case01)})`);
    await checkAtDesktopAndMobile(page, 'case01-legacy-two', 2);
    case01.ending.facets = [];
    await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(case01)})`);
    check('case01 with no earned facets renders no empty or invented badge', !(await page.eval('Boolean(document.querySelector(".ending-facets, .ending-badge"))')));

    const cases = [
      [2, 'C02-STOP', 'case02', '資料整合的長名稱仍要完整顯示'],
      [3, 'C03-STOP', 'case03', '客戶承諾與工程證據都要說得清楚'],
      [4, 'C04-STOP', 'case04', '先保留現場，再決定怎麼救'],
    ];
    for (const [number, baseId, name, longTitle] of cases) {
      await page.setViewport(1280, 900, false);
      await freshCareerCase(page, base, number);
      await page.eval(`(() => {
        const hook = window.__AIEG_CASE0${number}_TEST__;
        const state = hook.state;
        state.phase = 'ended';
        state.ending = {
          baseId: '${baseId}',
          title: '誠實止損',
          text: '保留目前證據與下一步。',
          playFacets: [
            { id: 'long-title', title: '${longTitle}', text: '這段說明必須在卡片裡完整可見，不能只剩裝飾圖案。' },
            { id: 'second-title', title: '第二個特色稱號', text: '多個稱號並列時也要保留標題與解釋。' },
          ],
        };
        hook.setState(state);
      })()`);
      await checkAtDesktopAndMobile(page, name, 2, number === 4 ? '.source-card' : '.ending-badge', number === 4 ? 'h3' : 'h2');
    }

    const external = browser.page.requests.filter((url) => !url.startsWith(base) && !url.startsWith('data:') && url !== 'about:blank');
    check('badge audit makes no external browser requests', external.length === 0, external.join(', '));
    check('badge audit has no uncaught browser errors', browser.page.errors.length === 0, browser.page.errors.join(' | '));
  } catch (error) {
    check('ending facet audit completes', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await browser.close();
  }
  const payload = { browser: BROWSER, total: results.length, failed: results.filter((item) => !item.pass).length, results };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(payload, null, 2));
  console.log(`${BROWSER}: ${payload.total} checks, ${payload.failed} failed.`);
  process.exit(payload.failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
