import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { validateRunRecord } from '../../src/postgame/run-schema.js';
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
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/phase-18/${BROWSER}-mcp-export`);
const DOWNLOADS = path.join(OUT, 'downloads');
const results = [];
const screenshots = [];

function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}
async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot(file); screenshots.push(path.relative(ROOT, file).replaceAll('\\', '/'));
}
async function waitForDownloads(count, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const files = fs.readdirSync(DOWNLOADS).filter((name) => name.endsWith('.json'));
    const partial = fs.readdirSync(DOWNLOADS).some((name) => name.endsWith('.crdownload'));
    if (files.length >= count && !partial) {
      const before = files.map((name) => fs.statSync(path.join(DOWNLOADS, name)).size);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const stable = files.every((name, index) => fs.existsSync(path.join(DOWNLOADS, name))
        && fs.statSync(path.join(DOWNLOADS, name)).size === before[index]
        && before[index] > 0);
      if (stable) return files.sort();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待 ${count} 個 JSON 下載逾時`);
}
function endedState() {
  let state = createNarrativeGame({ seed: 'browser-mcp-export', templateId: 'balanced' });
  state = performAction(state, 'A01', { operationId: 'browser-export-a01', stateVersion: state.stateVersion, designate: 'A01-B' }).state;
  state = performAction(state, 'A12', { operationId: 'browser-export-stop', stateVersion: state.stateVersion, intent: 'stop' }).state;
  return state;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXECUTABLES[BROWSER], width: 1280, height: 900 });
  const meta = { browser: browser.version.Browser, executable: browser.executable, base, startedAt: new Date().toISOString(), automation: 'CDP synthetic ended-state export UI; not a human playtest' };
  try {
    const { page } = browser;
    await page.allowDownloads(DOWNLOADS);
    await page.goto(`${base}case-01.html?seed=browser-mcp-export`);
    const state = endedState();
    await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
    await page.waitFor('document.querySelector("[data-export-run]")');
    const before = await page.eval('JSON.stringify(window.__AIEG_NARRATIVE_TEST__.state)');
    const ui = await page.eval(`({ text: document.querySelector('.coach-export')?.textContent, height: document.querySelector('[data-export-run]').getBoundingClientRect().height })`);
    check('結局顯示最小揭露與直接存入 runs 的說明', /不含姓名、帳號、金鑰、seed/.test(ui.text) && /直接把這局/.test(ui.text) && /runs/.test(ui.text) && !/手動放/.test(ui.text), JSON.stringify(ui));
    check('匯出按鈕符合 44px 操作高度', ui.height >= 43.5, String(ui.height));

    await page.click('[data-export-run]');
    const firstFiles = await waitForDownloads(1);
    const firstPath = path.join(DOWNLOADS, firstFiles[0]);
    const firstBytes = fs.readFileSync(firstPath);
    const record = JSON.parse(firstBytes.toString('utf8'));
    validateRunRecord(record);
    check('真下載檔名使用安全 run ID', firstFiles[0].startsWith(record.runId) && firstFiles[0].endsWith('.json'), firstFiles[0]);
    check('真下載通過 v1 schema 且保留 decision/outcome/cost', record.timeline.some((item) => item.kind === 'work' && item.decision && item.observedOutcome && item.resourceCost), JSON.stringify(record.timeline.map((item) => item.kind)));
    check('下載檔沒有 seed 或 hidden state', !/"seed"|functionState|eventDecisions|operationResults|"abilities"/.test(firstBytes.toString('utf8')));
    check('下載狀態回饋可讀', (await page.eval('document.querySelector("[data-export-status]").textContent')).includes(record.runId));

    fs.unlinkSync(firstPath);
    await page.click('[data-export-run]');
    const secondFiles = await waitForDownloads(1);
    const secondPath = path.join(DOWNLOADS, secondFiles[0]);
    const secondBytes = fs.readFileSync(secondPath);
    const after = await page.eval('JSON.stringify(window.__AIEG_NARRATIVE_TEST__.state)');
    check('重複匯出內容 byte-identical', firstBytes.equals(secondBytes));
    check('重複匯出不改 game state 或 RNG 紀錄', before === after);

    await page.setViewport(360, 760, true);
    const narrow = await page.eval(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, button: document.querySelector('[data-export-run]').getBoundingClientRect().height })`);
    check('360px 結局匯出無橫向溢出且仍可操作', narrow.scroll <= narrow.client + 1 && narrow.button >= 43.5, JSON.stringify(narrow));
    await shot(page, 'ending-export-360');

    const external = page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('blob:') && url !== 'about:blank');
    check('匯出流程沒有外部網路請求', external.length === 0, external.join(', '));
    check('瀏覽器沒有 JavaScript 錯誤', page.errors.length === 0, page.errors.join(' | '));
  } catch (error) {
    check('瀏覽器匯出流程完成', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  meta.finishedAt = new Date().toISOString();
  const failed = results.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ meta, total: results.length, failed: failed.length, screenshots, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} MCP export checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
