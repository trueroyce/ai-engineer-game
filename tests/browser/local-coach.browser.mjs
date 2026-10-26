import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { AnalysisError } from '../../src/local-coach/claude-analysis.js';
import { createRunStore } from '../../src/mcp/run-store.js';
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
const OUT = path.resolve(arg('--out') ?? path.join(os.tmpdir(), 'aieg-local-coach-browser', BROWSER));
const results = [];

function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail: String(detail) };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

function endedState() {
  let state = createNarrativeGame({ seed: 'browser-local-coach', templateId: 'balanced' });
  state = performAction(state, 'A01', { operationId: 'browser-coach-a01', stateVersion: state.stateVersion, designate: 'A01-B' }).state;
  state = performAction(state, 'A12', { operationId: 'browser-coach-stop', stateVersion: state.stateVersion, intent: 'stop' }).state;
  return state;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'aieg-browser-runs-'));
  let localServer = null;
  let staticServer = null;
  let analysisMode = 'success';
  let analysisCount = 0;
  let pendingReject = null;
  const analysisService = {
    analyze(runId, options) {
      analysisCount += 1;
      if (analysisMode === 'hang') return new Promise((_resolve, reject) => { pendingReject = reject; });
      return Promise.resolve({
        runId,
        reused: false,
        critique: {
          headline: '<img src=x onerror=alert(1)> 合成講評',
          summary: '只依公開紀錄整理。',
          strengths: ['有留下可觀察證據。'],
          risks: ['單局不能代表穩定能力。'],
          nextActions: ['先確認需求。', '再跑公開檢查。'],
          luckAndLimits: '事件結果含骰運。',
        },
        usage: { turns: options.reanalyze ? 4 : 3, durationMs: 25, estimatedCostUsd: 0.01 },
      });
    },
    cancel() {
      if (!pendingReject) return false;
      pendingReject(new AnalysisError('analysis_cancelled', '已取消這次分析，沒有產生講評。'));
      pendingReject = null;
      return true;
    },
  };
  const browser = await launch({ executable: EXECUTABLES[BROWSER], width: 1280, height: 900 });
  try {
    localServer = await startServer({ port: 0, root: ROOT, runsDir: runs, quiet: true, analysisService });
    const localBase = `http://127.0.0.1:${localServer.address().port}/`;
    const { page } = browser;
    await page.goto(`${localBase}case-01.html?seed=browser-local-coach`);
    await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(endedState())})`);
    await page.waitFor('document.querySelector("[data-save-run]")');

    const localUi = await page.eval(`({
      coach: document.querySelector('.coach-export')?.textContent,
      oldButton: !Boolean(document.querySelector('[data-export-run]')),
      buttonHeight: document.querySelector('[data-save-run]').getBoundingClientRect().height
    })`);
    check('本機 capability 顯示直接儲存入口', /直接把這局/.test(localUi.coach) && !/手動|下載/.test(localUi.coach));
    check('直接儲存與下載備份按鈕都可操作', !localUi.oldButton && localUi.buttonHeight >= 43.5, JSON.stringify(localUi));

    const before = await page.eval('JSON.stringify(window.__AIEG_NARRATIVE_TEST__.state)');
    await page.click('[data-save-run]');
    await page.waitFor('document.querySelector("[data-save-status]")?.textContent.includes("已存入本機 runs")');
    const files = fs.readdirSync(runs).filter((name) => name.endsWith('.json'));
    check('成功只建立一個 runId 檔名', files.length === 1 && /^case01-[a-f0-9]{16}\.json$/.test(files[0]), files.join(','));
    const firstBytes = fs.readFileSync(path.join(runs, files[0]));
    const record = JSON.parse(firstBytes.toString('utf8'));
    validateRunRecord(record);
    check('saved record excludes hidden engine state', !/"seed"|functionState|eventDecisions|operationResults|"abilities"/.test(firstBytes.toString('utf8')));
    check('成功回讀與 MCP store 一致', (await createRunStore(runs).get(record.runId)).runId === record.runId);

    await page.click('[data-save-run]');
    await page.waitFor('document.querySelector("[data-save-status]")?.textContent.includes("這局已在本機 runs")');
    check('重複儲存不增加檔案且 bytes 不變', fs.readdirSync(runs).filter((name) => name.endsWith('.json')).length === 1
      && firstBytes.equals(fs.readFileSync(path.join(runs, files[0]))));
    check('成功與重複儲存不改遊戲 state 或 RNG', before === await page.eval('JSON.stringify(window.__AIEG_NARRATIVE_TEST__.state)'));

    await page.click('[data-analyze-run]');
    await page.waitFor('document.querySelector(".coach-analysis.done")');
    const analysisUi = await page.eval(`({
      text: document.querySelector('.coach-analysis.done')?.textContent,
      injectedImage: Boolean(document.querySelector('.coach-analysis.done img')),
      state: JSON.stringify(window.__AIEG_NARRATIVE_TEST__.state)
    })`);
    check('one-click analysis renders structured critique as text', /合成講評/.test(analysisUi.text) && /事件結果含骰運/.test(analysisUi.text), analysisUi.text);
    check('model text is escaped and does not mutate game state', !analysisUi.injectedImage && analysisUi.state === before, JSON.stringify(analysisUi));
    check('one-click analysis invokes exactly one stub model run', analysisCount === 1, String(analysisCount));

    analysisMode = 'hang';
    await page.click('[data-reanalyze-run]');
    await page.waitFor('document.querySelector("[data-cancel-analysis]")');
    await page.click('[data-cancel-analysis]');
    await page.waitFor('document.querySelector(".coach-analysis.error")');
    const cancelledText = await page.eval('document.querySelector(".coach-analysis.error").textContent');
    check('explicit reanalysis can cancel only its pending child and reports no false success', analysisCount === 2 && /取消/.test(cancelledText), cancelledText);

    await closeServer(localServer);
    localServer = null;
    await page.click('[data-save-run]');
    await page.waitFor('document.querySelector("[data-save-status]")?.textContent.includes("儲存失敗")');
    const failedStatus = await page.eval('document.querySelector("[data-save-status]").textContent');
    check('server 不存在時明示失敗且不假稱成功', /儲存失敗/.test(failedStatus) && !/已存入/.test(failedStatus), failedStatus);

    staticServer = await startServer({ port: 0, root: ROOT, runsDir: runs, quiet: true, enableLocalCoach: false });
    const staticBase = `http://127.0.0.1:${staticServer.address().port}/`;
    await page.goto(`${staticBase}case-01.html?seed=browser-static`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(endedState())})`);
    const staticUi = await page.eval(`({
      coach: Boolean(document.querySelector('.coach-export')),
      save: Boolean(document.querySelector('[data-save-run]')),
      text: document.querySelector('#app').textContent
    })`);
    check('無 capability 的靜態版完全不渲染教練入口', !staticUi.coach && !staticUi.save && !/手動放|賽後教練|runs/.test(staticUi.text), JSON.stringify(staticUi));
    check('瀏覽器流程沒有未捕捉 JavaScript 錯誤', page.errors.length === 0, page.errors.join(' | '));
  } catch (error) {
    check('本機賽後教練瀏覽器流程完成', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    await closeServer(localServer);
    await closeServer(staticServer);
    await browser.close();
    fs.rmSync(runs, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, total: results.length, failed: results.filter((item) => !item.pass).length, results }, null, 2));
  const failed = results.filter((item) => !item.pass);
  console.log(`${BROWSER}: ${results.length} local-coach checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
