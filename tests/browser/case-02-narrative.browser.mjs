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
const OUT = path.resolve(ROOT, arg('--out') ?? `docs/testing/artifacts/case-02-narrative/${BROWSER}`);
const results = [];

function check(group, name, pass, detail = '') {
  const item = { group, name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} [${group}] ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

async function shot(page, name) { await page.screenshot(path.join(OUT, `${name}.png`)); }

async function freshCareer(page, base) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click('[data-template="balanced"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  return page.eval(`({
    links: [...document.querySelectorAll('.project-start')].map((item) => item.getAttribute('href')),
    starts: document.querySelectorAll('.project-start').length
  })`);
}

async function choose(page, id, choices = {}) {
  await page.click(`[data-case02-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case02-confirm]")');
  for (const [key, value] of Object.entries(choices.select ?? {})) {
    await page.eval(`(() => { const item = document.querySelector('[data-case02-option="${key}"]'); item.value = '${value}'; item.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  if (choices.radio) await page.click(`input[value="${choices.radio}"]`);
  await page.click('[data-case02-confirm]');
  if (id !== 'B09') await page.waitFor('document.querySelector("[data-case02-continue]")');
}

async function continueToBoard(page) {
  await page.click('[data-case02-continue]');
  if (await page.eval('Boolean(document.querySelector("[data-case02-reward]"))')) {
    await page.click('[data-case02-reward]');
  }
  await page.waitFor('window.__AIEG_CASE02_TEST__.screen === "board"');
}

async function run(page, base) {
  const lobby = await freshCareer(page, base);
  check('other-cases', '四案入口仍完整', lobby.starts === 4 && ['case-01.html', 'case-02.html', 'case-03.html', 'case-04.html'].every((name) => lobby.links.some((href) => href?.includes(name))), JSON.stringify(lobby));

  await page.click('.project:nth-child(2) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  await page.waitFor('document.querySelector("[data-case02-scene]")');
  const opening = await page.eval(`({ text: document.querySelector('[data-case02-scene]').innerText, cast: document.querySelectorAll('.scene-cast').length, runId: window.__AIEG_CASE02_TEST__.state.runId })`);
  check('cast', '開場固定三位角色且由資料窗口說明衝突', opening.cast === 3 && opening.text.includes('小陳') && opening.text.includes('同一筆'), JSON.stringify(opening));

  await page.eval(`(() => { const state = window.__AIEG_CASE02_TEST__.state; state.token = 30; state.timeLeft = 30; state.rng.event = { kind:'injected', values:[100,1,...Array(40).fill(1)], cursor:0 }; window.__AIEG_CASE02_TEST__.setState(state); })()`);
  await choose(page, 'B01', { select: { idPolicy:'canonical-map', datePolicy:'normalize-iso', duplicatePolicy:'latest-export' } });
  const failed = await page.eval(`({ scene: document.querySelector('[data-case02-scene]').innerText, state: window.__AIEG_CASE02_TEST__.state })`);
  check('failure', '失敗由角色開出可行救援而非死路', failed.state.story.openRecovery?.sourceAction === 'B01' && failed.scene.includes('三種可行救援'), failed.scene);
  await continueToBoard(page);

  await choose(page, 'B10', { radio:'prototype' });
  const rescued = await page.eval(`({ scene: document.querySelector('[data-case02-scene]').innerText, state: window.__AIEG_CASE02_TEST__.state })`);
  check('recovery', '隔離原型有成本並留下有限範圍', rescued.state.story.scope === 'prototype' && rescued.state.story.recoveryHistory.at(-1)?.route === 'prototype', JSON.stringify(rescued.state.story));
  await continueToBoard(page);

  const beforeReload = await page.eval('({ runId: window.__AIEG_CASE02_TEST__.state.runId, story: window.__AIEG_CASE02_TEST__.state.story })');
  page.dialogResponse = true;
  await page.reload();
  page.dialogResponse = false;
  await page.waitFor('window.__AIEG_CASE02_TEST__.screen === "board"');
  const afterReload = await page.eval('({ runId: window.__AIEG_CASE02_TEST__.state.runId, story: window.__AIEG_CASE02_TEST__.state.story, cast: document.querySelectorAll(".scene-cast").length })');
  check('save', '刷新保留同一 run、救援選擇與角色舞台', beforeReload.runId === afterReload.runId && afterReload.story.scope === 'prototype' && afterReload.cast === 3, JSON.stringify({ beforeReload, afterReload }));

  await page.eval(`(() => { const state = window.__AIEG_CASE02_TEST__.state; state.token = 30; state.timeLeft = 30; state.rng.event = { kind:'injected', values:Array(60).fill(1), cursor:0 }; window.__AIEG_CASE02_TEST__.setState(state); })()`);
  await choose(page, 'B02', { radio:'two' });
  const normalized = await page.eval(`({ scene: document.querySelector('[data-case02-scene]').innerText, strategy: window.__AIEG_CASE02_TEST__.state.normalization.strategy })`);
  check('result-copy', '兩個 agent 的結果場景使用已完成狀態', normalized.strategy === 'two' && normalized.scene.includes('兩份 brief 都交卷') && !normalized.scene.includes('先告訴我分工邊界'), normalized.scene);
  await page.setViewport(390, 844, true);
  const mobileStage = await page.eval(`({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    roleSizes: [...document.querySelectorAll('.scene-cast small')].map((item) => parseFloat(getComputedStyle(item).fontSize)),
    clipped: [...document.querySelectorAll('.scene-cast small')].some((item) => item.scrollWidth > item.clientWidth)
  })`);
  check('mobile', '390px 角色標籤至少 11px 且無水平溢出', mobileStage.roleSizes.every((size) => size >= 11) && !mobileStage.clipped && mobileStage.scrollWidth <= mobileStage.width, JSON.stringify(mobileStage));
  await shot(page, '00-b02-result-mobile');
  await page.setViewport(1280, 900, false);
  await continueToBoard(page);
  await choose(page, 'B03');
  const merge = await page.eval(`({ scene: document.querySelector('[data-case02-scene]').innerText, state: window.__AIEG_CASE02_TEST__.state })`);
  check('delayed', '平行 brief 分歧在合併時具名回來', merge.state.story.commitments.parallelSchemaDrift === 'surfaced' && /分歧|欄位/.test(merge.scene), merge.scene);
  check('success-choice', '成功結果提出穩交、補品質或追加來源', merge.state.story.openOpportunity?.sourceAction === 'B03' && merge.scene.includes('下一步由你決定'), merge.scene);
  await continueToBoard(page);

  await choose(page, 'B12', { radio:'shared-sample' });
  await continueToBoard(page);
  await choose(page, 'B11', { radio:'gamble' });
  await continueToBoard(page);
  await choose(page, 'B06', { radio:'focused' });
  const consequence = await page.eval(`({ scene: document.querySelector('[data-case02-scene]').innerText, state: window.__AIEG_CASE02_TEST__.state })`);
  check('callback', '客服臨時表在測試時要求補證據', consequence.state.story.commitments.extraSource === 'surfaced' && consequence.scene.includes('客服臨時表') && consequence.scene.includes('前因回來了'), consequence.scene);
  await shot(page, '01-delayed-consequence');
  await continueToBoard(page);

  await choose(page, 'B12', { radio:'targeted-proof' });
  const resolved = await page.eval(`({ scene: document.querySelector('[data-case02-scene]').innerText, state: window.__AIEG_CASE02_TEST__.state })`);
  check('resolution', '定向證據只處理對應缺口', resolved.state.story.commitments.extraSource === 'resolved' && resolved.scene.includes('可追蹤的修復'), resolved.scene);
  await continueToBoard(page);

  await choose(page, 'B09', { radio:'limited' });
  await page.waitFor('document.querySelector("[data-return-lobby]")');
  const ending = await page.eval(`({ text: document.querySelector('[data-case02-scene]').innerText, runId: window.__AIEG_CASE02_TEST__.state.runId })`);
  check('ending', '結局回應成功後追加來源的早先決定', ending.text.includes('順手') && ending.text.includes('追加來源'), ending.text);
  await shot(page, '02-ending-callback');

  await page.click('[data-return-lobby]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  await page.click('.project:nth-child(2) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  const replay = await page.eval('({ runId: window.__AIEG_CASE02_TEST__.state.runId, story: window.__AIEG_CASE02_TEST__.state.story })');
  check('replay', '完成後重開建立新 run 且不帶入前局故事承諾', replay.runId !== ending.runId && replay.story.recoveryHistory.length === 0 && replay.story.opportunityHistory.length === 0, JSON.stringify(replay));

  const external = page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank');
  check('privacy', '原型沒有外部請求或模型呼叫', external.length === 0, external.join(', '));
  check('browser', '完整敘事原型沒有 JavaScript 錯誤', page.errors.length === 0, page.errors.join(' | '));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: process.env.CHROME_PATH ?? EXECUTABLES[BROWSER] });
  try { await run(browser.page, base); }
  catch (error) {
    check('browser', '完整第二案敘事原型流程', false, error.stack ?? error.message);
    await shot(browser.page, 'error').catch(() => {});
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = results.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser:BROWSER, base, total:results.length, failed:failed.length, results }, null, 2));
  console.log(`${BROWSER}: ${results.length} checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
