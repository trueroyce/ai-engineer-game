// 完整第一版的真實瀏覽器回歸（tasks 5.5–5.8、6.1–6.5、8.2–8.3）。用法：
//   node tests/browser/full.browser.mjs [--browser chrome|edge] [--headed] [--url http://127.0.0.1:8080/]
// 以真實滑鼠／鍵盤事件（CDP Input.dispatch*）操作使用者已安裝的 Chrome／Edge；臨時 profile；不安裝任何套件。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';
import { replay } from '../../src/core/log.js';
import careful from '../golden/careful-revised.fixture.js';
import rush from '../golden/rush-revised.fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const HEADED = argv.includes('--headed');
const BROWSER = arg('--browser') ?? 'chrome';
const EXECUTABLES = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
};
const LABEL = `${BROWSER}-${HEADED ? 'headed' : 'headless'}`;
const OUT = path.join(ROOT, 'docs/testing/artifacts/phase-03', LABEL);
const FORBIDDEN = /hiddenDefects|defectAdded|隱藏缺陷 H=|秘密骰 h\d/;
const results = [];
const shots = [];

function check(scenario, name, pass, detail = '') {
  results.push({ scenario, name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() });
  console.log(`${pass ? '✔' : '✖'} [${scenario}] ${name}${detail && !pass ? ` — ${detail}` : ''}`);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot(file);
  shots.push(path.relative(ROOT, file).replaceAll('\\', '/'));
}

function injection(rng) {
  const opts = { gameId: 'browser', rng: { success: { values: rng.success ?? [] }, defect: { values: rng.defect ?? [] }, card: { values: rng.card ?? [] } } };
  return `window.__AIEG_TEST_CREATE_OPTIONS__ = ${JSON.stringify(opts)};`;
}

const attr = (page, sel, name) => page.eval(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)})`);
const exists = (page, sel) => page.eval(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
const appText = (page) => page.eval('document.getElementById("app").textContent');
const heading = (page) => page.eval('document.querySelector("#h-screen")?.textContent ?? ""');

async function noLeak(page, S, where) {
  check(S, `${where}：DOM 不含 H／秘密骰`, !FORBIDDEN.test(await page.html()));
}

async function open(page, base, rng, { audit = false } = {}) {
  await page.setInitScript(rng ? injection(rng) : null);
  // Scenario transitions may leave an in-progress game behind. Accept only this
  // test-owned navigation; the smoke scenario still verifies the real warning.
  page.dialogResponse = true;
  try {
    await page.goto(`${base}${audit ? '?audit=1' : ''}`);
  } finally {
    page.dialogResponse = false;
  }
}

async function setup(page, { template = 'balanced', pick }) {
  await page.click(`[data-cmd="template"][data-template="${template}"]`);
  await page.click('[data-cmd="startGame"]');
  await page.waitFor('document.querySelector("#h-screen")?.textContent.startsWith("開局抽卡")');
  const ids = pick ?? (await page.eval('[...document.querySelectorAll("[data-cmd=pickOpening]")].map(x => x.dataset.cardId)')).slice(0, 2);
  for (const id of ids) await page.click(`[data-cmd="pickOpening"][data-card-id="${id}"]`);
  await page.click('[data-cmd="confirmOpening"]');
  await page.waitFor('document.querySelector("#h-screen")?.textContent.startsWith("第 1 回合")');
}

async function act(page, action, { toggles = [], expect = {} } = {}, S = '', label = '') {
  await page.click(`[data-cmd="openPreview"][data-action="${action}"]`);
  await page.waitFor('document.querySelector("section.preview")');
  for (const id of toggles) {
    await page.click(`[data-cmd="toggle"][data-card="${id}"]`);
    await page.waitFor(`document.querySelector('[data-cmd="toggle"][data-card="${id}"]')?.checked`);
  }
  for (const [k, v] of Object.entries(expect)) {
    const got = await attr(page, 'section.preview', `data-preview-${k}`);
    check(S, `${label} 預覽 ${k}=${v}`, got === String(v), `畫面為 ${got}`);
  }
  await page.click('[data-cmd="confirmAction"]');
  await page.waitFor('!document.querySelector("section.preview")');
}

async function ts(page) {
  return page.eval(`(() => {
    const t = document.getElementById('app').innerText;
    const tok = t.match(/Token\\s*(\\d+)／24/) || t.match(/Token (\\d+)、壓力/);
    const st = t.match(/壓力\\s*(\\d+)（≥10/) || t.match(/、壓力 (\\d+)/);
    return { T: tok && Number(tok[1]), S: st && Number(st[1]) };
  })()`);
}

async function waitForFile(dir, timeout = 10000) {
  const start = Date.now();
  for (;;) {
    const f = fs.readdirSync(dir).find((x) => x.endsWith('.json'));
    if (f) {
      const full = path.join(dir, f);
      const text = fs.readFileSync(full, 'utf8');
      if (text.trim().endsWith('}')) return { file: full, text };
    }
    if (Date.now() - start > timeout) throw new Error('匯出檔未出現');
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function exportAndReplay(page, S, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aieg-dl-'));
  await page.allowDownloads(dir);
  await page.click('[data-cmd="exportLog"]');
  const { text } = await waitForFile(dir);
  const log = JSON.parse(text);
  const evidence = path.join(OUT, `${name}-audit-log.json`);
  fs.writeFileSync(evidence, text);
  const seqOk = log.events.every((e, i) => e.seq === i + 1);
  const ids = log.events.map((e) => e.operationId);
  check(S, `匯出 JSON：事件序號連續（${log.events.length} 筆）`, seqOk);
  check(S, '匯出 JSON：每筆事件的 operationId 不重複（重送沒有產生第二筆效果）', new Set(ids).size === ids.length);
  let same = false;
  let detail = '';
  try {
    const s = replay(log);
    assert.deepEqual(s.events, log.events);
    assert.equal(s.stateVersion, log.finalStateVersion);
    same = true;
  } catch (e) { detail = e.message.split('\n')[0]; }
  check(S, '匯出 JSON 在 Node 重播：事件逐筆深度相等、stateVersion 相同', same, detail);
  fs.rmSync(dir, { recursive: true, force: true });
  return log;
}

// ---- 黃金重播：在瀏覽器中依 fixture 操作全 18 回合 ----

async function playGolden(page, base, fx, S) {
  await open(page, base, { success: fx.successDice, defect: fx.defectDice, card: [fx.opening.candidates, ...fx.levelDrafts.map((d) => d.candidates.map(([id]) => id))] });
  await setup(page, { pick: fx.opening.pick });
  check(S, '開局候選標為指定樣本（測試注入）', true);
  const drafts = [...fx.levelDrafts];
  for (const row of fx.turns) {
    const at = `第 ${row.turn} 回合`;
    if (!(await heading(page)).startsWith(`第 ${row.turn} 回合`)) check(S, `${at} 畫面回合正確`, false, await heading(page));
    if (row.accept) {
      await page.click(`[data-cmd="accept"][data-project="${row.accept}"]`);
      await page.waitFor('!document.querySelector("[data-cmd=accept]")');
    }
    const expect = { cost: row.cost };
    if (row.s) expect.p = row.s[2];
    if (row.h) expect.q = row.h[2];
    const toggles = Object.entries(row.toggles).filter(([, on]) => on).map(([id]) => id);
    if (fx.name === 'careful_revised' && row.turn === 2) {
      // 連點兩下確認只結算一次
      await page.click('[data-cmd="openPreview"][data-action="implement"]');
      await page.waitFor('document.querySelector("section.preview")');
      const before = await page.eval('Number.parseInt(document.querySelector("#result").innerText.trim().slice(1), 10)');
      await page.click('[data-cmd="confirmAction"]', { clickCount: 2 });
      await page.waitFor('!document.querySelector("section.preview")');
      const after = await page.eval('Number.parseInt(document.querySelector("#result").innerText.trim().slice(1), 10)');
      check(S, `${at} 快速連點確認只產生一筆事件`, after === before + 1, `${before}→${after}`);
    } else {
      await act(page, row.action, { toggles, expect }, S, at);
    }
    while ((await heading(page)).startsWith('升級抽選')) {
      const d = drafts.shift();
      const text = await appText(page);
      const labels = d.candidates.map(([id, kind]) => (kind === 'upgrade' ? `現有工具升級：${id} L1→L2` : `新工具：${id} L1`));
      check(S, `${at} 升級候選：${labels.join('、')}`, labels.every((l) => text.includes(l)));
      if (d.choice.type === 'forfeit') {
        await shot(page, `${fx.name}-turn${row.turn}-forfeit`);
        await page.click('[data-cmd="forfeitDraft"]');
      } else {
        await page.click(`[data-cmd="pickDraft"][data-card-id="${d.choice.cardId}"]`);
        if (d.choice.replace) {
          await page.waitFor('document.querySelector("[data-cmd=pickReplace]")');
          const t2 = await appText(page);
          check(S, `${at} 滿槽替換顯示將失去與將得到`, t2.includes('將失去') && t2.includes('將得到'));
          await page.click(`[data-cmd="pickReplace"][data-card-id="${d.choice.replace}"]`);
          await shot(page, `${fx.name}-turn${row.turn}-replace`);
        }
        await page.click('[data-cmd="confirmDraft"]');
      }
      await page.waitFor('!document.querySelector("#h-screen")?.textContent.startsWith("升級抽選")');
    }
    const text = await appText(page);
    if (row.tags.includes('rejected')) check(S, `${at} 退件只說「驗收未通過，仍有未定位問題」`, text.includes('驗收未通過，仍有未定位問題'));
    if (row.tags.includes('expired')) check(S, `${at} 顯示逾期`, text.includes('逾期（壓力 +1）'));
    if (row.tags.includes('delivered')) check(S, `${at} 顯示交付成功`, text.includes('交付成功'));
    const now = await ts(page);
    check(S, `${at} 後 T/S = ${row.T}/${row.S}`, now.T === row.T && now.S === row.S, JSON.stringify(now));
    await noLeak(page, S, at);
  }
  const t = await appText(page);
  check(S, `整局結算：結局「${fx.final.ending}」`, t.includes(`結局：${fx.final.ending}`));
  check(S, `整局結算：第 18 回合期限結算、總分 ${fx.final.score}`, t.includes('第 18 回合期限結算') && t.includes(`總分 ${fx.final.score}`));
  check(S, '整局結算：列出關鍵選擇（附事件序號）', /關鍵選擇[\s\S]*#\d+ 第 \d+ 回合/.test(t));
  await shot(page, `${fx.name}-settlement`);
  const log = await exportAndReplay(page, S, fx.name);
  check(S, `匯出紀錄最終分數 ${fx.final.score}`, log.events.at(-1).after.score === fx.final.score);
}

// ---- 其他情境 ----

async function scenarioSmoke(page, base) {
  const S = 'smoke';
  await open(page, base, null);
  const text = await appText(page);
  check(S, '顯示規則版本 v0.3-T3', text.includes('v0.3-T3'));
  check(S, '完整版不再顯示單案切片限制', !/單案切片|本切片|開發里程碑/.test(text));
  check(S, '先看到遊戲目標與期限', text.includes('18 回合') && text.includes('壓力達 10 立即崩潰'));
  await page.click('[data-cmd="template"][data-template="analyst"]');
  check(S, '模板一鍵套用：需求分析型 → 3/2/1', (await page.eval('["A","E","V"].map(k => document.querySelector(`[data-attr="${k}"]`).value).join("/")')) === '3/2/1');
  await page.typeInto('[data-attr="E"]', '3');
  await page.waitFor('document.querySelector("[data-attr=E]").value === "3"');
  check(S, '非法配置（總和 7）顯示原因且開局鈕停用', (await appText(page)).includes('三項總和必須為 6，目前為 7') && (await page.eval('document.querySelector("[data-cmd=startGame]").disabled')));
  await page.typeInto('[data-attr="E"]', '2');
  await page.click('[data-cmd="startGame"]');
  await page.waitFor('document.querySelector("#h-screen")?.textContent.startsWith("開局抽卡")');
  const ids = await page.eval('[...document.querySelectorAll("[data-cmd=pickOpening]")].map(x => x.dataset.cardId).join(",")');
  check(S, '開局 4 張不同候選、虛構標示', new Set(ids.split(',')).size === 4 && (await appText(page)).includes('遊戲虛構工具，不代表真實 Claude Code 功能'));
  await page.click(`[data-cmd="pickOpening"][data-card-id="${ids.split(',')[0]}"]`);
  await page.click(`[data-cmd="pickOpening"][data-card-id="${ids.split(',')[0]}"]`);
  check(S, '重繪後候選不變（不重抽）', (await page.eval('[...document.querySelectorAll("[data-cmd=pickOpening]")].map(x => x.dataset.cardId).join(",")')) === ids);
  for (const id of ids.split(',').slice(0, 2)) await page.click(`[data-cmd="pickOpening"][data-card-id="${id}"]`);
  await page.click('[data-cmd="confirmOpening"]');
  await page.waitFor('document.querySelector("#h-screen")?.textContent.startsWith("第 1 回合")');
  const turnText = await appText(page);
  check(S, '三案都有接案鈕', ['J1', 'J2', 'J3'].every((id) => turnText.includes(`接 ${id}`)));
  // 教學旁欄
  const before = await ts(page);
  await page.click('[data-cmd="toggleSidebar"]');
  await page.waitFor('document.querySelector("#cli-panel")');
  const side = await appText(page);
  check(S, 'CLI 旁欄列出五個指令、真實用途／遊戲對照／限制、查核日期', ['/context', '/compact', '/clear', '/rename', '/resume', '真實用途', '遊戲對照', '限制', '2026-10-24'].every((x) => side.includes(x)));
  check(S, 'CLI 旁欄 aria-expanded=true', (await attr(page, '[data-cmd="toggleSidebar"]', 'aria-expanded')) === 'true');
  await shot(page, 'sidebar-open');
  await page.click('[data-cmd="toggleSidebar"]');
  const after = await ts(page);
  check(S, '開關旁欄不改 Token／壓力', before.T === after.T && before.S === after.S);
  // 離開警告與重新開始確認
  page.dialogs.length = 0;
  page.dialogResponse = false;
  page.client.send('Page.navigate', { url: 'about:blank' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  check(S, '進行中離開頁面 → beforeunload 確認', page.dialogs.includes('beforeunload'), JSON.stringify(page.dialogs));
  check(S, '取消離開後仍在本局', await exists(page, '#h-screen'));
  await page.click('[data-cmd="askNewGame"]');
  check(S, '重新開始需確認並提示會失去當局', (await appText(page)).includes('重新開始會失去目前這一局'));
  await page.press('Escape');
  check(S, 'Esc 取消重新開始', (await heading(page)).startsWith('第 1 回合'));
  await page.click('[data-cmd="askNewGame"]');
  await page.click('[data-cmd="confirmNewGame"]');
  await page.waitFor('document.querySelector("#h-screen")?.textContent === "角色建立"');
  check(S, '確認重新開始 → 回到角色建立', true);
  page.dialogs.length = 0;
  page.dialogResponse = true;
  await page.reload();
  check(S, '尚未開局時重新整理不跳離開警告', !page.dialogs.includes('beforeunload'), JSON.stringify(page.dialogs));
  page.dialogResponse = false;
}

async function scenarioCrash(page, base) {
  const S = 'crash';
  await open(page, base, { success: [100, 100, 100, 100], defect: [1, 1, 1, 1], card: [['C1', 'C2', 'C5', 'C4']] });
  await setup(page, { pick: ['C5', 'C2'] });
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await page.waitFor('!document.querySelector("[data-cmd=accept]")');
  await page.click('[data-cmd="openPreview"][data-action="rush"]');
  await page.waitFor('document.querySelector("section.preview")');
  const off = `${await attr(page, 'section.preview', 'data-preview-cost')}/${await attr(page, 'section.preview', 'data-preview-q')}`;
  await page.click('[data-cmd="toggle"][data-card="C2"]');
  await page.waitFor('document.querySelector("section.preview").dataset.previewCost === "3"');
  const on = `${await attr(page, 'section.preview', 'data-preview-cost')}/${await attr(page, 'section.preview', 'data-preview-q')}`;
  check(S, 'C2 預設關閉 費4／q35；開啟即時 費3／q40', off === '4/35' && on === '3/40', `${off} ${on}`);
  await page.click('[data-cmd="toggle"][data-card="C2"]');
  await page.waitFor('document.querySelector("section.preview").dataset.previewCost === "4"');
  await page.click('[data-cmd="confirmAction"]');
  await page.waitFor('!document.querySelector("section.preview")');
  for (let i = 0; i < 3; i++) await act(page, 'rush', {}, S);
  check(S, '「可能仍有未發現問題」', (await appText(page)).includes('可能仍有未發現問題'));
  await noLeak(page, S, '引擎內 H=4');
  await act(page, 'deliver', {}, S);
  check(S, '退件只說未通過、不公開數量', (await page.eval('document.querySelector("#result").innerText')).includes('驗收未通過，仍有未定位問題'));
  await page.click('[data-cmd="openPreview"][data-action="deliver"]');
  await page.waitFor('document.querySelector("section.preview")');
  check(S, 'S9 交付預覽警告退件即崩潰', (await appText(page)).includes('若退件，壓力將達 10，立即崩潰'));
  await page.click('[data-cmd="confirmAction"]');
  await page.waitFor('document.querySelector("#h-screen")?.textContent === "整局結算"');
  const t = await appText(page);
  check(S, '崩潰 → 整局結算「壓力崩潰」、J1 未交付', t.includes('結局：壓力崩潰') && t.includes('J1 待辦工具：未交付'));
  await noLeak(page, S, '崩潰結算');
  await shot(page, 'crash-settlement');
}

async function scenarioEarlySettle(page, base) {
  const S = 'earlySettle';
  await open(page, base, { success: [1, 1], defect: [100, 100], card: [['C1', 'C2', 'C5', 'C4']] });
  await setup(page, { pick: ['C5', 'C2'] });
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await act(page, 'implement', {}, S);
  await act(page, 'implement', {}, S);
  await page.click('[data-cmd="askSettle"]');
  await page.waitFor('document.querySelector("#h-settle")');
  const t = await appText(page);
  check(S, '提前結算確認列出已達標未交付的 J1', t.includes('J1 待辦工具：進度 4／4（已達標但未交付）') && t.includes('未交付案不會自動交付、不計分'));
  await shot(page, 'early-settle-confirm');
  await page.click('[data-cmd="earlySettle"]');
  await page.waitFor('document.querySelector("#h-screen")?.textContent === "整局結算"');
  const s = await appText(page);
  check(S, '提前結算 → 交件落空、J1 未交付不計分', s.includes('結局：交件落空') && s.includes('第 3 回合開始時提前結算') && s.includes('J1 待辦工具：未交付'));
}

async function scenarioKeyboard(page, base) {
  const S = 'keyboard';
  await open(page, base, { success: [1], defect: [100], card: [['C1', 'C2', 'C5', 'C4']] });
  await page.tabTo('[data-cmd="template"][data-template="sprinter"]');
  await page.press('Enter');
  check(S, 'Enter 套用模板 1/3/2', (await page.eval('["A","E","V"].map(k => document.querySelector(`[data-attr="${k}"]`).value).join("/")')) === '1/3/2');
  const f = await page.focusInfo();
  check(S, '焦點可見（:focus-visible 且有外框）', f.focusVisible && f.outline !== 'none', JSON.stringify(f));
  await page.tabTo('[data-cmd="startGame"]');
  await page.press('Enter');
  await page.waitFor('document.querySelector("#h-screen")?.textContent.startsWith("開局抽卡")');
  for (const id of ['C5', 'C2']) {
    await page.tabTo(`[data-cmd="pickOpening"][data-card-id="${id}"]`);
    await page.press(' ');
  }
  await page.tabTo('[data-cmd="confirmOpening"]');
  await page.press('Enter');
  await page.waitFor('document.querySelector("#h-screen")?.textContent.startsWith("第 1 回合")');
  await page.tabTo('[data-cmd="accept"][data-project="J1"]');
  await page.press('Enter');
  await page.waitFor('!document.querySelector("[data-cmd=accept]")');
  await page.tabTo('[data-cmd="openPreview"][data-action="implement"]');
  await page.press('Enter');
  await page.waitFor('document.querySelector("section.preview")');
  check(S, '開啟預覽後焦點在「確認執行」', (await page.focusInfo()).cmd === 'confirmAction');
  await page.press('Escape');
  await page.waitFor('!document.querySelector("section.preview")');
  check(S, 'Esc 取消預覽、Token 不變', (await ts(page)).T === 18);
  await page.tabTo('[data-cmd="openPreview"][data-action="implement"]');
  await page.press('Enter');
  await page.waitFor('document.querySelector("section.preview")');
  await page.press(' ');
  await page.waitFor('!document.querySelector("section.preview")');
  check(S, 'Space 確認後焦點移到 aria-live 結果區', await page.eval('document.activeElement.id === "result" && document.activeElement.getAttribute("aria-live") === "polite"'));
  for (let turn = 2; turn <= 18; turn++) {
    await page.tabTo('[data-cmd="openPreview"][data-action="rest"]');
    await page.press('Enter');
    await page.waitFor('document.querySelector("section.preview")');
    await page.press('Enter');
    await page.waitFor('!document.querySelector("section.preview")');
  }
  await page.waitFor('document.querySelector("#h-screen")?.textContent === "整局結算"');
  const t = await appText(page);
  check(S, '純鍵盤完成整局 → 第 18 回合期限結算', t.includes('第 18 回合期限結算') && t.includes('J1 待辦工具：逾期'));
  check(S, '結算後焦點移到標題', await page.eval('document.activeElement.id === "h-screen"'));
}

async function scenarioMobile(page, base) {
  const S = 'mobile360';
  await page.setViewport(360, 740, true);
  try {
    await open(page, base, { success: [1], defect: [100], card: [['C1', 'C2', 'C3', 'C4']] });
    const layoutOk = async (where) => {
      const r = await page.eval(`(() => {
        const W = document.documentElement.clientWidth;
        const overflow = document.documentElement.scrollWidth - W;
        const bad = [];
        for (const b of document.querySelectorAll('button, input')) {
          b.scrollIntoView({ block: 'center' });
          const rect = b.getBoundingClientRect();
          if (rect.width === 0) continue;
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          const covered = !(hit === b || b.contains(hit) || hit?.closest('label')?.contains(b));
          if (rect.left < -0.5 || rect.right > W + 0.5 || covered) bad.push((b.dataset.cmd || b.tagName) + (covered ? '(遮擋)' : '(越界)'));
        }
        return { W, overflow, bad };
      })()`);
      check(S, `${where}：寬 ${r.W}px 無水平捲動、所有按鈕在畫面內且未被遮擋`, r.overflow <= 0 && r.bad.length === 0, JSON.stringify(r));
    };
    await layoutOk('角色建立');
    await setup(page, { pick: ['C1', 'C3'] });
    await page.click('[data-cmd="accept"][data-project="J1"]');
    await page.click('[data-cmd="openPreview"][data-action="implement"]');
    await page.waitFor('document.querySelector("section.preview")');
    await layoutOk('回合畫面＋預覽');
    await shot(page, 'mobile-360-preview');
  } finally {
    await page.setViewport(0);
  }
}

async function scenarioAudit(page, base) {
  const S = 'audit';
  const rng = { success: [1], defect: [1], card: [['C1', 'C2', 'C5', 'C4']] };
  await open(page, base, rng);
  await setup(page, { pick: ['C5', 'C2'] });
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await act(page, 'implement', {}, S);
  const normal = await page.html();
  check(S, '一般網址：不顯示稽核標示、H、秘密骰，進行中無匯出', !/稽核模式|隱藏缺陷 H=|秘密骰 h\d/.test(normal) && !normal.includes('data-cmd="exportLog"'));
  await open(page, base, rng, { audit: true });
  await setup(page, { pick: ['C5', 'C2'] });
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await act(page, 'implement', {}, S);
  const t = await appText(page);
  check(S, '?audit=1：常駐稽核標示', t.includes('稽核模式：畫面顯示隱藏缺陷與秘密骰'));
  check(S, '?audit=1：顯示 H=1 與秘密骰 h1=1', t.includes('隱藏缺陷 H=1') && t.includes('秘密骰 h1=1 ≤ q15 → 新增 1 個隱藏缺陷'));
  check(S, '?audit=1：進行中可匯出', await exists(page, '[data-cmd="exportLog"]'));
  await shot(page, 'audit-mode');
}

async function scenarioC3(page, base) {
  const S = 'c3';
  await open(page, base, { success: [1, 1], defect: [100], card: [['C3', 'C5', 'C1', 'C4']] });
  await setup(page, { pick: ['C3', 'C5'] });
  await page.click('[data-cmd="accept"][data-project="J1"]');
  await act(page, 'implement', {}, S);
  await page.click('[data-cmd="openPreview"][data-action="verify"]');
  await page.waitFor('document.querySelector("section.preview")');
  const off = `${await attr(page, 'section.preview', 'data-preview-cost')}/${await attr(page, 'section.preview', 'data-preview-p')}`;
  await page.click('[data-cmd="toggle"][data-card="C3"]');
  await page.waitFor('document.querySelector("section.preview").dataset.previewCost === "3"');
  const on = `${await attr(page, 'section.preview', 'data-preview-cost')}/${await attr(page, 'section.preview', 'data-preview-p')}`;
  check(S, 'C3 預設關閉 費2／p70；開啟 費3／p90', off === '2/70' && on === '3/90', `${off} ${on}`);
  await page.click('[data-cmd="confirmAction"]');
  await page.waitFor('!document.querySelector("section.preview")');
  check(S, '確認時 C3 開啟 → 實扣 3（T15→12）', (await ts(page)).T === 12);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const startedAt = new Date().toISOString();
  let server = null;
  let base = arg('--url');
  if (!base) {
    server = await startServer({ port: 0, quiet: true });
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  const browser = await launch({ executable: process.env.CHROME_PATH ?? EXECUTABLES[BROWSER], headed: HEADED });
  const meta = {
    label: LABEL, mode: HEADED ? 'headed（可見視窗，未傳 --headless=new）' : 'headless（--headless=new）', url: base,
    browser: browser.version.Browser, userAgent: browser.version['User-Agent'], executable: browser.executable,
    args: browser.args, startedAt,
  };
  console.log(`${LABEL}：${meta.browser}（${meta.executable}）；網址：${base}`);
  const scenarios = [
    scenarioSmoke,
    (p, b) => playGolden(p, b, careful, 'careful18'),
    (p, b) => playGolden(p, b, rush, 'rush18'),
    scenarioCrash, scenarioEarlySettle, scenarioKeyboard, scenarioMobile, scenarioAudit, scenarioC3,
  ];
  const names = ['smoke', 'careful18', 'rush18', 'crash', 'earlySettle', 'keyboard', 'mobile360', 'audit', 'c3'];
  const only = arg('--only');
  try {
    for (let i = 0; i < scenarios.length; i++) {
      if (only && !only.split(',').includes(names[i])) continue;
      const t0 = Date.now();
      try {
        await scenarios[i](browser.page, base);
        console.log(`  （${names[i]} 用時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
      } catch (e) {
        check(names[i], '情境執行中斷', false, e.message);
        await shot(browser.page, `${names[i]}-error`).catch(() => {});
      }
    }
    const external = browser.page.requests.filter((u) => !u.startsWith('http://127.0.0.1:') && !u.startsWith('data:') && !u.startsWith('blob:') && u !== 'about:blank');
    check('all', `全部 ${browser.page.requests.length} 個網路請求都在 127.0.0.1（無外部資源）`, external.length === 0, external.join(', '));
    check('all', '整個回歸期間頁面無 JavaScript 錯誤', browser.page.errors.length === 0, browser.page.errors.join(' | '));
  } finally {
    await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
  meta.finishedAt = new Date().toISOString();
  const failed = results.filter((r) => !r.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ meta, total: results.length, failed: failed.length, screenshots: shots, results }, null, 2));
  console.log(`\n${LABEL}：共 ${results.length} 項檢查，失敗 ${failed.length} 項。結果：${path.relative(ROOT, path.join(OUT, 'results.json'))}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
