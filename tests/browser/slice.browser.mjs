// 單案切片的真實瀏覽器回歸（tasks 1.4／4.4–4.8）。用法：
//   node tests/browser/slice.browser.mjs                 # 自行啟動本機伺服器
//   node tests/browser/slice.browser.mjs --url http://127.0.0.1:8080/   # 對已用 npm start 啟動的伺服器
// 以真實滑鼠／鍵盤事件操作使用者已安裝的 Chrome／Edge（headless），不安裝任何套件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';
import careful from '../golden/careful-revised.fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/testing/artifacts/phase-02');
const urlArg = process.argv.indexOf('--url');
const results = [];
const FORBIDDEN = /hiddenDefects|defectAdded|隱藏缺陷 ?\d|秘密骰 ?\d/;

function check(scenario, name, pass, detail = '') {
  results.push({ scenario, name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? '✔' : '✖'} [${scenario}] ${name}${detail && !pass ? ` — ${detail}` : ''}`);
}

function injectionScript({ success = [], defect = [], card = [] }) {
  const opts = { gameId: 'browser', rng: { success: { values: success }, defect: { values: defect }, card: { values: card } } };
  return `window.__AIEG_TEST_CREATE_OPTIONS__ = ${JSON.stringify(opts)};`;
}

async function attr(page, selector, name) {
  return page.eval(`document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(name)})`);
}

async function noLeak(page, scenario, where) {
  const html = await page.html();
  check(scenario, `${where}：DOM 不含 H／秘密骰`, !FORBIDDEN.test(html));
}

async function setupBalancedAndPick(page, pick) {
  await page.click('[data-cmd="template"][data-template="balanced"]');
  await page.click('[data-cmd="startGame"]');
  await page.waitFor('document.querySelector("#h-opening")');
  for (const id of pick) await page.click(`[data-cmd="pickOpening"][data-card-id="${id}"]`);
  await page.click('[data-cmd="confirmOpening"]');
  await page.waitFor('document.querySelector("#h-turn")');
}

async function doAction(page, action, { toggles = [], expect = {} } = {}, scenario, label) {
  await page.click(`[data-cmd="openPreview"][data-action="${action}"]`);
  await page.waitFor('document.querySelector("section.preview")');
  for (const id of toggles) {
    await page.click(`[data-cmd="toggle"][data-card="${id}"]`);
    await page.waitFor(`document.querySelector('[data-cmd="toggle"][data-card="${id}"]').checked`);
  }
  for (const [k, v] of Object.entries(expect)) {
    const got = await attr(page, 'section.preview', `data-preview-${k}`);
    check(scenario, `${label} 預覽 ${k}=${v}`, got === String(v), `畫面為 ${got}`);
  }
  await page.click('[data-cmd="confirmAction"]');
  await page.waitFor('!document.querySelector("section.preview")');
}

async function statusTokenStress(page) {
  return page.eval(`(() => {
    const t = document.body.innerText;
    const tok = t.match(/Token\\s*(\\d+)／24/); const st = t.match(/壓力\\s*(\\d+)（≥10/);
    return { T: tok && Number(tok[1]), S: st && Number(st[1]) };
  })()`);
}

async function scenarioSmoke(page, base) {
  const S = 'smoke';
  await page.setInitScript(null);
  page.requests.length = 0;
  await page.goto(base);
  const text = await page.text();
  check(S, '頁面顯示規則版本 v0.3-T3', text.includes('v0.3-T3'));
  check(S, '常駐切片標示', text.includes('開發里程碑：單案切片，尚非完整第一版'));
  const external = page.requests.filter((u) => !u.startsWith('http://127.0.0.1:') && !u.startsWith('data:'));
  check(S, '所有網路請求都在 127.0.0.1（無外部資源）', external.length === 0, external.join(', '));
  check(S, `載入了 index、styles 與 ES modules（${page.requests.length} 個請求）`, page.requests.some((u) => u.endsWith('/src/ui/main.js')) && page.requests.some((u) => u.endsWith('/src/core/engine.js')));

  await page.click('[data-cmd="template"][data-template="analyst"]');
  const vals = await page.eval('["A","E","V"].map(k => document.querySelector(`[data-attr="${k}"]`).value).join("/")');
  check(S, '模板一鍵套用：需求分析型 → 3/2/1', vals === '3/2/1', vals);
  await page.typeInto('[data-attr="E"]', '3');
  await page.waitFor('document.querySelector("[data-attr=E]").value === "3"');
  const invalidText = await page.text();
  check(S, '非法配置（總和 7）顯示原因', invalidText.includes('三項總和必須為 6，目前為 7'));
  check(S, '非法配置時開局按鈕停用', await page.eval('document.querySelector("[data-cmd=startGame]").disabled'));
  await page.click('[data-cmd="startGame"]').catch(() => {});
  check(S, '點擊停用的開局按鈕不會進入抽卡', !(await page.eval('Boolean(document.querySelector("#h-opening"))')));
  await page.typeInto('[data-attr="A"]', '1');
  check(S, '1/3/1（總和 5）仍非法、開局鈕仍停用', await page.eval('document.querySelector("[data-cmd=startGame]").disabled'));
  await page.typeInto('[data-attr="V"]', '2');
  await page.waitFor('!document.querySelector("[data-cmd=startGame]").disabled');
  check(S, '自由配點 1/3/2 合法 → 可開局', true);
  await page.click('[data-cmd="startGame"]');
  await page.waitFor('document.querySelector("#h-opening")');
  const ids = await page.eval('[...document.querySelectorAll("[data-cmd=pickOpening]")].map(x => x.dataset.cardId).join(",")');
  check(S, '開局顯示 4 張不同候選', new Set(ids.split(',')).size === 4, ids);
  check(S, '候選卡顯示 L1/L2 與虛構標示', (await page.text()).includes('遊戲虛構工具，不代表真實 Claude Code 功能'));
  const first = ids.split(',')[0];
  await page.click(`[data-cmd="pickOpening"][data-card-id="${first}"]`);
  check(S, '只選 1 張時確認鈕停用', await page.eval('document.querySelector("[data-cmd=confirmOpening]").disabled'));
  await page.click(`[data-cmd="pickOpening"][data-card-id="${first}"]`);
  const ids2 = await page.eval('[...document.querySelectorAll("[data-cmd=pickOpening]")].map(x => x.dataset.cardId).join(",")');
  check(S, '勾選／取消多次重繪後候選不變（不重抽）', ids2 === ids, `${ids} vs ${ids2}`);
  await page.reload();
  const afterReload = await page.eval('Boolean(document.querySelector("#h-setup"))');
  check(S, '整頁重新整理 = 新局（回到角色建立；首版不存檔），不是同局重抽', afterReload);
  await page.screenshot(path.join(OUT, 'smoke-setup.png'));
}

async function scenarioDeliver(page, base) {
  const S = 'deliver';
  const rows = careful.turns.filter((r) => r.turn <= 6);
  await page.setInitScript(injectionScript({ success: careful.successDice, defect: careful.defectDice, card: [careful.opening.candidates, careful.levelDrafts[0].candidates.map(([id]) => id)] }));
  await page.goto(base);
  check(S, '開局候選標為指定樣本', true);
  await page.click('[data-cmd="template"][data-template="balanced"]');
  await page.click('[data-cmd="startGame"]');
  await page.waitFor('document.querySelector("#h-opening")');
  check(S, '畫面標示「指定候選樣本（測試注入），不是隨機抽中」', (await page.text()).includes('指定候選樣本（測試注入），不是隨機抽中'));
  for (const id of careful.opening.pick) await page.click(`[data-cmd="pickOpening"][data-card-id="${id}"]`);
  await page.click('[data-cmd="confirmOpening"]');
  await page.waitFor('document.querySelector("#h-turn")');
  check(S, 'J2／J3 顯示本切片未開放且無接案鈕', (await page.text()).includes('本切片未開放') && !(await page.eval('Boolean(document.querySelector("[data-project=J2]"))')));
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await page.waitFor('document.body.innerText.includes("狀態：進行中")');
  check(S, '接案後不再顯示放棄鈕（同回合不可放棄）', !(await page.eval('Boolean(document.querySelector("[data-cmd=abandon]"))')));

  for (const row of rows) {
    const expect = { cost: row.cost };
    if (row.s) expect.p = row.s[2];
    if (row.h) expect.q = row.h[2];
    if (row.turn === 2) {
      // Esc 取消預覽不改狀態
      const before = await statusTokenStress(page);
      await page.click('[data-cmd="openPreview"][data-action="implement"]');
      await page.waitFor('document.querySelector("section.preview")');
      await page.press('Escape');
      await page.waitFor('!document.querySelector("section.preview")');
      const after = await statusTokenStress(page);
      check(S, '第 2 回合：Esc 取消預覽，Token／壓力不變', before.T === after.T && before.S === after.S, JSON.stringify({ before, after }));
      // 連點兩下確認只結算一次
      await page.click('[data-cmd="openPreview"][data-action="implement"]');
      await page.waitFor('document.querySelector("section.preview")');
      for (const [k, v] of Object.entries(expect)) {
        const got = await attr(page, 'section.preview', `data-preview-${k}`);
        check(S, `第 2 回合 預覽 ${k}=${v}`, got === String(v), `畫面為 ${got}`);
      }
      const seqOf = 'Number.parseInt(document.querySelector("#result").innerText.trim().slice(1), 10)';
      const seqBefore = await page.eval(seqOf);
      await page.eval('(() => { const b = document.querySelector("[data-cmd=confirmAction]"); b.click(); b.click(); })()');
      await page.click('[data-cmd="confirmAction"]', { clickCount: 2 }).catch(() => {});
      await page.waitFor('!document.querySelector("section.preview")');
      const seqAfter = await page.eval(seqOf);
      check(S, '第 2 回合：快速連點確認只產生一筆事件', seqAfter === seqBefore + 1, `${seqBefore}→${seqAfter}`);
    } else {
      await doAction(page, row.action, { expect }, S, `第 ${row.turn} 回合`);
    }
    if (await page.eval('Boolean(document.querySelector("#h-draft"))')) {
      const t = await page.text();
      check(S, `第 ${row.turn} 回合升級抽選顯示「現有工具升級：C5 L1→L2」`, t.includes('現有工具升級：C5 L1→L2'));
      await page.screenshot(path.join(OUT, 'level-draft.png'));
      await page.click('[data-cmd="pickDraft"][data-card-id="C5"]');
      await page.click('[data-cmd="confirmDraft"]');
      await page.waitFor('!document.querySelector("#h-draft")');
    }
    const ts = await statusTokenStress(page);
    if (row.turn < 6) check(S, `第 ${row.turn} 回合後 T/S = ${row.T}/${row.S}`, ts.T === row.T && ts.S === row.S, JSON.stringify(ts));
    await noLeak(page, S, `第 ${row.turn} 回合`);
  }
  const t = await page.text();
  check(S, '顯示單案結算', t.includes('單案結算'));
  check(S, 'J1 待辦工具：已交付', t.includes('J1 待辦工具：已交付'));
  check(S, '分數 2、Token 11、壓力 3', t.includes('分數 2') && t.includes('Token 11、壓力 3'));
  check(S, '標明開發里程碑、非完整第一版', t.includes('這是開發里程碑的單案結算，不是完整第一版的整局結算'));
  const seqs = await page.eval('(document.body.innerText.match(/#(\\d+)/g) || []).length');
  check(S, '結果紀錄存在', seqs > 0);
  await page.screenshot(path.join(OUT, 'deliver-summary.png'));
}

async function scenarioCrash(page, base) {
  const S = 'crash';
  await page.setInitScript(injectionScript({ success: [100, 100, 100, 100], defect: [1, 1, 1, 1], card: [['C1', 'C2', 'C5', 'C4']] }));
  await page.goto(base);
  await setupBalancedAndPick(page, ['C5', 'C2']);
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await page.waitFor('document.body.innerText.includes("狀態：進行中")');
  // C2 開關：開啟費用 4→3、q 35→40；關閉回原值
  await page.click('[data-cmd="openPreview"][data-action="rush"]');
  await page.waitFor('document.querySelector("section.preview")');
  const off = [await attr(page, 'section.preview', 'data-preview-cost'), await attr(page, 'section.preview', 'data-preview-q')];
  await page.click('[data-cmd="toggle"][data-card="C2"]');
  await page.waitFor('document.querySelector("section.preview").dataset.previewCost === "3"');
  const on = [await attr(page, 'section.preview', 'data-preview-cost'), await attr(page, 'section.preview', 'data-preview-q')];
  await page.screenshot(path.join(OUT, 'turn-preview-c2.png'));
  check(S, 'C2 預設關閉：趕工費 4、q 35', off.join('/') === '4/35', off.join('/'));
  check(S, 'C2 開啟即時更新：費 3、q 40', on.join('/') === '3/40', on.join('/'));
  await page.click('[data-cmd="toggle"][data-card="C2"]');
  await page.waitFor('document.querySelector("section.preview").dataset.previewCost === "4"');
  await page.click('[data-cmd="confirmAction"]');
  await page.waitFor('!document.querySelector("section.preview")');
  check(S, '確認時 C2 關閉 → 實扣 4（T18→14）', (await statusTokenStress(page)).T === 14);
  for (let i = 0; i < 3; i++) await doAction(page, 'rush', {}, S, `趕工 ${i + 2}`);
  const txt = await page.text();
  check(S, '進行中專案顯示「可能仍有未發現問題」', txt.includes('可能仍有未發現問題'));
  await noLeak(page, S, '四次趕工後（引擎內 H=4）');
  await doAction(page, 'deliver', {}, S, '第 1 次交付');
  const rej = await page.eval('document.querySelector("#result").innerText');
  check(S, '退件只說未通過，不公開數量', rej.includes('驗收未通過，仍有未定位問題') && !/\d+ ?個/.test(rej), rej);
  const warn = await (async () => { await page.click('[data-cmd="openPreview"][data-action="deliver"]'); await page.waitFor('document.querySelector("section.preview")'); return page.text(); })();
  check(S, 'S9 交付預覽警告「若退件，壓力將達 10，立即崩潰」', warn.includes('若退件，壓力將達 10，立即崩潰'));
  await page.click('[data-cmd="confirmAction"]');
  await page.waitFor('document.querySelector("#h-summary")');
  const t = await page.text();
  check(S, '崩潰 → 單案結算顯示「壓力崩潰」', t.includes('壓力崩潰'));
  check(S, 'J1 未交付', t.includes('J1 待辦工具：未交付'));
  await noLeak(page, S, '崩潰結算');
  await page.screenshot(path.join(OUT, 'crash-summary.png'));
}

async function scenarioExpire(page, base) {
  const S = 'expire';
  await page.setInitScript(null);
  await page.goto(base);
  const ids = await (async () => {
    await page.click('[data-cmd="template"][data-template="balanced"]');
    await page.click('[data-cmd="startGame"]');
    await page.waitFor('document.querySelector("#h-opening")');
    return page.eval('[...document.querySelectorAll("[data-cmd=pickOpening]")].map(x => x.dataset.cardId)');
  })();
  check(S, '種子模式不顯示指定樣本標示', !(await page.text()).includes('指定候選樣本'));
  for (const id of ids.slice(0, 2)) await page.click(`[data-cmd="pickOpening"][data-card-id="${id}"]`);
  await page.click('[data-cmd="confirmOpening"]');
  await page.waitFor('document.querySelector("#h-turn")');
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await page.waitFor('document.body.innerText.includes("狀態：進行中")');
  for (let i = 0; i < 6; i++) await doAction(page, 'rest', {}, S, `休息 ${i + 1}`);
  const t = await page.text();
  check(S, 'J1 工期 6 用完 → 單案結算顯示逾期', t.includes('J1 待辦工具：逾期'));
  await page.click('[data-cmd="newGame"]');
  await page.waitFor('document.querySelector("#h-setup")');
  check(S, '開始新局回到角色建立', true);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  let base;
  if (urlArg > 0) base = process.argv[urlArg + 1];
  else {
    server = await startServer({ port: 0, quiet: true });
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  const browser = await launch();
  const meta = { date: new Date().toISOString(), browser: browser.version.Browser, userAgent: browser.version['User-Agent'], executable: browser.executable, base };
  console.log(`瀏覽器：${meta.browser}（${meta.executable}）；網址：${base}`);
  try {
    for (const run of [scenarioSmoke, scenarioDeliver, scenarioCrash, scenarioExpire]) {
      try {
        await run(browser.page, base);
      } catch (e) {
        check(run.name, '情境執行中斷', false, e.message);
      }
    }
    check('all', '頁面無 JavaScript 錯誤', browser.page.errors.length === 0, browser.page.errors.join(' | '));
  } finally {
    await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
  const failed = results.filter((r) => !r.pass);
  fs.writeFileSync(path.join(OUT, 'browser-results.json'), JSON.stringify({ meta, total: results.length, failed: failed.length, results }, null, 2));
  console.log(`\n共 ${results.length} 項檢查，失敗 ${failed.length} 項。結果：docs/testing/artifacts/phase-02/browser-results.json`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
