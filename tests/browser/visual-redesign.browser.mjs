import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeEnding, createNarrativeGame } from '../../src/narrative/engine.js';
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
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/phase-15/${BROWSER}-visual`);
const results = [];
const screenshots = [];

function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot(file);
  screenshots.push(path.relative(ROOT, file).replaceAll('\\', '/'));
}

async function viewportAudit(page, label) {
  const metrics = await page.eval(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    minButton: Math.min(...[...document.querySelectorAll('button')].map((node) => node.getBoundingClientRect().height)),
    h1: document.querySelector('h1')?.getBoundingClientRect().toJSON(),
  }))()`);
  check(`${label} 沒有橫向溢出`, metrics.scrollWidth <= metrics.clientWidth + 1, JSON.stringify(metrics));
  check(`${label} 操作目標至少 44px`, metrics.minButton >= 43.5, JSON.stringify(metrics));
}

async function execute(page, actionId) {
  await page.click(`[data-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-confirm]")');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXECUTABLES[BROWSER], width: 1280, height: 900 });
  const meta = { browser: browser.version.Browser, executable: browser.executable, base, startedAt: new Date().toISOString() };
  try {
    const { page } = browser;
    await page.goto(`${base}case-01.html?seed=balance-011`);
    await page.waitFor('document.querySelectorAll("[data-template]").length === 6');
    const intro = await page.eval(`(async () => {
      const portraits = [...document.querySelectorAll('.template-card .raster-template')];
      const portraitBackgrounds = portraits.map((node) => getComputedStyle(node).backgroundImage);
      const portraitAssets = await Promise.all(portraits.map((node) => new Promise((resolve) => {
        const url = getComputedStyle(node).getPropertyValue('--portrait-image').match(/url\\(["']?(.*?)["']?\\)/)?.[1];
        const image = new Image();
        image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({ url, width: 0, height: 0 });
        image.src = url;
      })));
      return {
        portraits: portraits.length,
        portraitBackgrounds,
        portraitAssets,
        names: [...document.querySelectorAll('.template-card strong')].map((node) => node.textContent),
        ctaTop: document.querySelector('[data-next="cards"]').getBoundingClientRect().top,
        ctaBottom: document.querySelector('[data-next="cards"]').getBoundingClientRect().bottom,
        allocation: Boolean(document.querySelector('.attrs, [data-attr]')),
      };
    })()`);
    check('選角有六張獨立肖像且不露配點', intro.portraits === 6 && new Set(intro.names).size === 6 && !intro.allocation, JSON.stringify(intro));
    check('選角六張立繪實際套用且可解碼', intro.portraitBackgrounds.every((value) => value.includes('url(')) && intro.portraitAssets.every((asset) => asset.width > 0 && asset.height > 0), JSON.stringify(intro));
    check('開場主 CTA 在第一個桌面視窗內', intro.ctaTop >= 0 && intro.ctaBottom <= 900, JSON.stringify(intro));
    await viewportAudit(page, '1280px 選角');
    await shot(page, '01-character-selection-1280');

    await page.click('[data-template="ultimate"]');
    await page.click('[data-next="cards"]');
    await page.waitFor('document.querySelectorAll("[data-card]").length === 3');
    const cards = await page.eval(`({ art: document.querySelectorAll('[data-card] .card-illustration').length, labels: [...document.querySelectorAll('[data-card]')].map((node) => node.textContent) })`);
    check('開場三張候選都有插畫、名稱、等級與效果', cards.art === 3 && cards.labels.every((text) => /Lv\.1/.test(text)), JSON.stringify(cards));
    await shot(page, '02-opening-cards-1280');

    await page.click('[data-card]');
    await page.click('[data-start]');
    await page.waitFor('document.querySelector(".caseboard")');
    const mainStage = await page.eval(`({ scene: Boolean(document.querySelector('.case-scene')), status: Boolean(document.querySelector('.status-sentence')), primary: document.querySelectorAll('.work-list > .work').length, delivery: Boolean(document.querySelector('[data-action="A12"]')) })`);
    check('主回合先顯示狀態、案件場景與可用工作', mainStage.scene && mainStage.status && mainStage.primary >= 2 && mainStage.delivery, JSON.stringify(mainStage));
    await viewportAudit(page, '1280px 主回合');
    await shot(page, '03-caseboard-1280');

    await page.setViewport(768, 900, false);
    await page.eval('scrollTo(0, 0)');
    await viewportAudit(page, '768px 主回合');
    await shot(page, '04-caseboard-768');

    await page.click('[data-action="A01"]');
    await page.waitFor('document.querySelector("[data-confirm]")');
    const preview = await page.eval(`(() => { const hud = document.querySelector('.hud').getBoundingClientRect(); const result = document.querySelector('.result').getBoundingClientRect(); return { hudBottom: hud.bottom, resultTop: result.top, h1Top: document.querySelector('.result h1').getBoundingClientRect().top }; })()`);
    check('工作預覽標題沒有被 HUD 遮住', preview.h1Top >= preview.hudBottom - 1, JSON.stringify(preview));
    await shot(page, '05-work-preview-768');
    await page.click('[data-confirm]');
    await page.waitFor('document.querySelector("[data-continue]")');
    const process = await page.eval(`({ beats: document.querySelectorAll('.process-beat').length, icons: document.querySelectorAll('.process-icon').length, summary: Boolean(document.querySelector('.result-receipt')) })`);
    check('事件結果有四段時間線、四個圖示與公開摘要', process.beats === 4 && process.icons === 4 && process.summary, JSON.stringify(process));
    const processColors = await page.eval(`[...document.querySelectorAll('.process-beat')].map((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }))`);
    const safeArea = await page.eval(`(async () => {
      const lastBeat = document.querySelector('.process-beat:last-child');
      lastBeat.scrollIntoView({ block: 'end' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const beat = lastBeat.getBoundingClientRect();
      const actions = document.querySelector('.event-result .sticky-actions').getBoundingClientRect();
      return { beatBottom: beat.bottom, actionsTop: actions.top, gap: actions.top - beat.bottom };
    })()`);
    check('768px 最後一段流程卡不被 sticky 繼續列遮住', safeArea.beatBottom <= safeArea.actionsTop - 8, JSON.stringify(safeArea));
    const keyboardSafe = await page.eval(`(async () => {
      const summary = document.querySelector('.event-result .tutorial > summary');
      summary.focus();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const focused = summary.getBoundingClientRect();
      const actions = document.querySelector('.event-result .sticky-actions').getBoundingClientRect();
      return { isFocused: document.activeElement === summary, focusedBottom: focused.bottom, actionsTop: actions.top };
    })()`);
    check('768px 鍵盤焦點不被 sticky 繼續列遮住', keyboardSafe.isFocused && keyboardSafe.focusedBottom <= keyboardSafe.actionsTop - 4, JSON.stringify(keyboardSafe));
    check('四段事件文字與紙面維持可讀對比', processColors.every((item) => item.color !== item.background && item.background !== 'rgb(16, 24, 45)'), JSON.stringify(processColors));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await shot(page, '06-event-process-768');
    await page.click('[data-continue]');

    await page.setViewport(1280, 900, false);
    await execute(page, 'A04');
    await page.click('[data-continue]');
    await page.waitFor('document.querySelectorAll("[data-upgrade]").length === 3');
    const reward = await page.eval(`({ cards: document.querySelectorAll('[data-upgrade] .card-illustration').length, fusion: document.querySelector('#app').textContent.includes('融合') })`);
    check('中途獎勵三張都有插圖並說明融合', reward.cards === 3 && reward.fusion, JSON.stringify(reward));
    await shot(page, '07-upgrade-cards-1280');
    await page.click('[data-upgrade]');
    await page.waitFor('document.querySelector(".caseboard")');

    await page.setViewport(360, 760, true);
    await page.eval('scrollTo(0, 0)');
    await viewportAudit(page, '360px 主回合');
    const mobile = await page.eval(`({ progress: document.querySelector('.progress')?.tagName, caseArtHidden: getComputedStyle(document.querySelector('.case-scene')).display === 'none', hudColumns: getComputedStyle(document.querySelector('.hud')).gridTemplateColumns })`);
    check('窄版壓縮 HUD、收起案件插畫且保留進度', mobile.progress === 'DETAILS' && mobile.caseArtHidden && mobile.hudColumns.split(' ').length === 2, JSON.stringify(mobile));
    await shot(page, '08-caseboard-360');

    await page.setViewport(1280, 900, false);
    const endingState = createNarrativeGame({ seed: 'visual-ending', templateId: 'ultimate', selectedCards: ['C1'] });
    endingState.token = 13;
    endingState.stress = 8;
    endingState.repairHistory = true;
    endingState.phase = 'ended';
    endingState.ending = composeEnding(endingState, 'E01');
    await page.eval(`scrollTo(0, document.body.scrollHeight); window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(endingState)})`);
    await page.waitFor('document.querySelector(".ending-tableau")');
    await page.waitFor("document.activeElement === document.querySelector('.ending h1')");
    const ending = await page.eval(`(() => { const hud = document.querySelector('.hud')?.getBoundingClientRect(); const h1 = document.querySelector('.ending h1')?.getBoundingClientRect(); return { tier: document.querySelector('.ending-stamp strong')?.textContent, art: document.querySelector('.ending-illustration')?.className, expression: document.querySelector('.ending-illustration .raster-template')?.getAttribute('style'), badges: document.querySelectorAll('.ending-badge').length, rules: document.querySelector('.ending-rules')?.tagName, scrollY, h1Top: h1?.top, hudBottom: hud?.bottom, focused: document.activeElement === document.querySelector('.ending h1') }; })()`);
    check('結局以主要交付層級為主、特色稱號醒目且規則可收合', ending.tier === '正式交付' && ending.art.includes('ending-formal') && ending.expression.includes('player-ultimate-relieved.png') && ending.badges >= 1 && ending.rules === 'DETAILS', JSON.stringify(ending));
    check('結局階段切換回到可見標題並移動邏輯焦點', ending.h1Top >= ending.hudBottom - 1 && ending.focused, JSON.stringify(ending));
    await viewportAudit(page, '1280px 結局');
    await shot(page, '09-ending-1280');

    await page.client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const motion = await page.eval(`getComputedStyle(document.querySelector('.button')).transitionDuration`);
    check('偏好減少動畫時 transition 為零', motion.split(',').every((value) => value.trim() === '0s'), motion);

    const external = page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank');
    check('所有請求維持本機且無外部字型或圖片', external.length === 0, external.join(', '));
    check('瀏覽器沒有 JavaScript 錯誤', page.errors.length === 0, page.errors.join(' | '));
  } catch (error) {
    check('視覺流程完成', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  meta.finishedAt = new Date().toISOString();
  const failed = results.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ meta, total: results.length, failed: failed.length, screenshots, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} visual checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });

