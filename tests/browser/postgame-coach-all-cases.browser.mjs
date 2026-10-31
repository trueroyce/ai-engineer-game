import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClaudeAnalysisService } from '../../src/local-coach/claude-analysis.js';
import { createRunStore } from '../../src/mcp/run-store.js';
import { isCanonicalRunId } from '../../src/postgame/run-schema.js';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const ANALYSIS_MODE = arg('--analysis') ?? 'stub';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.resolve(arg('--out') ?? path.join(ROOT, 'docs/testing/artifacts/postgame-coach-all-cases', `${BROWSER}-${ANALYSIS_MODE}`));
const results = [];
const audits = [];

function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail: String(detail) };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

function stubAnalysisService() {
  return Object.freeze({
    async analyze(runId) {
      return Object.freeze({
        runId,
        critique: Object.freeze({
          headline: '隔離 stub 講評',
          summary: '這只驗證按鈕、儲存與回應呈現；不能當成真實 Claude 輸出。',
          strengths: Object.freeze(['正常保存公開局紀錄。']),
          risks: Object.freeze([]),
          nextActions: Object.freeze(['另以 --analysis real-claude 執行真實模型 gate。']),
          luckAndLimits: 'stub 不檢查內容品質。',
        }),
        usage: Object.freeze({ turns: 0, durationMs: 0, estimatedCostUsd: 0 }),
        reused: false,
      });
    },
    cancel() { return false; },
  });
}

async function selectValue(page, selector, value) {
  await page.eval(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

async function newCareer(page, base) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click('[data-template="beginner"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  const starter = await page.eval('document.querySelector("[data-starter-card]").dataset.starterCard');
  await page.click(`[data-starter-card="${starter}"]`);
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  return starter;
}

async function continue01(page) {
  await page.waitFor('document.querySelector("[data-continue]")');
  await page.click('[data-continue]');
  if (await page.eval('Boolean(document.querySelector("[data-upgrade]"))')) {
    await page.click('[data-upgrade]');
    await page.waitFor('document.querySelector("[data-action]")');
  }
}

async function settleCase01(page) {
  await page.click('[data-action="A01"]');
  await page.waitFor('document.querySelector("[data-confirm]")');
  await page.click('[data-confirm]');
  await continue01(page);
  await page.click('[data-action="A12"]');
  await page.waitFor('document.querySelector("[data-confirm]")');
  await page.click('input[value="stop"]');
  await page.click('[data-confirm]');
}

async function continueCareerCase(page, caseNumber) {
  await page.waitFor(`document.querySelector('[data-case${caseNumber}-continue]')`);
  await page.click(`[data-case${caseNumber}-continue]`);
  if (await page.eval(`window.__AIEG_CASE${caseNumber}_TEST__?.screen === "reward"`)) {
    await page.click(`[data-case${caseNumber}-reward]`);
    await page.waitFor(`window.__AIEG_CASE${caseNumber}_TEST__.screen === "board"`);
  }
}

async function settleCase02(page) {
  await page.click('[data-case02-action="B01"]');
  await page.waitFor('document.querySelector("[data-case02-confirm]")');
  await selectValue(page, '[data-case02-option="idPolicy"]', 'canonical-map');
  await selectValue(page, '[data-case02-option="datePolicy"]', 'normalize-iso');
  await selectValue(page, '[data-case02-option="duplicatePolicy"]', 'latest-export');
  await page.click('[data-case02-confirm]');
  await continueCareerCase(page, '02');
  await page.click('[data-case02-action="B09"]');
  await page.waitFor('document.querySelector("[data-case02-confirm]")');
  await page.click('input[value="stop"]');
  await page.click('[data-case02-confirm]');
}

async function settleCase03(page) {
  await page.click('[data-case03-action="C01"]');
  await page.waitFor('document.querySelector("[data-case03-confirm]")');
  await page.click('input[value="full"]');
  await page.click('[data-case03-confirm]');
  await continueCareerCase(page, '03');
  await page.click('[data-case03-action="C07"]');
  await page.waitFor('document.querySelector("[data-case03-confirm]")');
  await page.click('input[value="stop"]');
  await page.click('[data-case03-confirm]');
}

async function settleCase04(page) {
  await page.click('[data-case04-action="D01"]');
  await page.waitFor('document.querySelector("[data-case04-confirm]")');
  await page.click('input[value="logs"]');
  await page.click('[data-case04-confirm]');
  await continueCareerCase(page, '04');
  await page.click('[data-case04-action="D09"]');
  await page.waitFor('document.querySelector("[data-case04-confirm]")');
  await page.click('input[value="stop"]');
  await page.click('[data-case04-confirm]');
}

async function enterAndSettle(page, caseId) {
  const index = Number(caseId.slice(-2));
  await page.click(`.project:nth-child(${index}) .project-start`);
  if (caseId === 'case-01') {
    await page.waitFor('document.querySelector("[data-next=cards]")');
    await page.click('[data-next=cards]');
    await page.waitFor('document.querySelector("[data-action]")');
    await settleCase01(page);
  } else {
    await page.waitFor('document.querySelector("[data-start-case]")');
    await page.click('[data-start-case]');
    await page.waitFor(`window.__AIEG_CASE${caseId.slice(-2)}_TEST__?.screen === "board"`);
    if (caseId === 'case-02') await settleCase02(page);
    if (caseId === 'case-03') await settleCase03(page);
    if (caseId === 'case-04') await settleCase04(page);
  }
  await page.waitFor('document.querySelector("[data-analyze-run]")');
}

function critiqueFromAudit(audit) {
  if (!audit?.stdout) return null;
  try { return JSON.parse(audit.stdout).structured_output ?? null; }
  catch { return null; }
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'runs'), { recursive: true });
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'aieg-coach-e2e-runs-'));
  const analysisService = ANALYSIS_MODE === 'real-claude'
    ? createClaudeAnalysisService({ projectRoot: ROOT, runsDir: runs, onAudit(entry) { audits.push(entry); } })
    : stubAnalysisService();
  let server;
  const browser = await launch({ executable: EXE[BROWSER], width: 1280, height: 900 });
  try {
    server = await startServer({ port: 0, root: ROOT, runsDir: runs, quiet: true, analysisService });
    const base = `http://127.0.0.1:${server.address().port}/`;
    const { page } = browser;
    for (const caseId of ['case-01', 'case-02', 'case-03', 'case-04']) {
      const starter = await newCareer(page, base);
      await enterAndSettle(page, caseId);
      const copy = await page.eval('document.body.textContent ?? ""');
      check(`${caseId} coach copy is user-facing`, !copy.includes('本次開發測試') && (copy.includes('只有你主動操作時才會開始') || copy.includes('按下即會使用你的 Claude 帳號額度')), copy);
      const before = new Set(fs.readdirSync(runs).filter((name) => name.endsWith('.json')));
      const auditStart = audits.length;
      await page.click('[data-analyze-run]');
      await page.waitFor('document.querySelector(".coach-analysis.done, .coach-analysis.error")', 120_000);
      const ui = await page.eval(`({
        done: Boolean(document.querySelector('.coach-analysis.done')),
        text: document.querySelector('[data-analysis-result]')?.textContent ?? '',
        save: document.querySelector('[data-save-status]')?.textContent ?? ''
      })`);
      check(`${caseId} actual analysis button completes`, ui.done, ui.text);
      const created = fs.readdirSync(runs).filter((name) => name.endsWith('.json') && !before.has(name));
      check(`${caseId} creates exactly one genuinely generated run`, created.length === 1 && new RegExp(`^${caseId.replace('-', '')}-[a-f0-9]{16}\\.json$`).test(created[0]), created.join(','));
      if (created.length !== 1) continue;
      const runId = created[0].slice(0, -5);
      const record = await createRunStore(runs).get(runId);
      check(`${caseId} generated ID passes the shared canonical contract`, isCanonicalRunId(runId) && record.caseId === caseId && record.timeline.length >= 2, JSON.stringify({ runId, recordCase: record.caseId, decisions: record.timeline.length }));
      check(`${caseId} saved status and analysis UI use the same ID`, ui.save.includes(runId), ui.save);
      fs.copyFileSync(path.join(runs, created[0]), path.join(OUT, 'runs', created[0]));
      if (ANALYSIS_MODE === 'real-claude') {
        const audit = audits.slice(auditStart).find((item) => item.runId === runId);
        const critique = critiqueFromAudit(audit);
        const combined = critique ? [critique.headline, critique.summary, ...(critique.strengths ?? []), ...(critique.risks ?? []), ...(critique.nextActions ?? []), critique.luckAndLimits].join('\n') : '';
        const endingGrounded = combined.includes(record.ending.title) || combined.includes(record.ending.tier);
        const resourceGrounded = ['token', 'stress', 'time'].filter((key) => combined.includes(String(record.finalResources[key]))).length >= 2;
        check(`${caseId} real Claude output is structured and grounded in this run`, Boolean(critique) && endingGrounded && resourceGrounded && critique.nextActions.length >= 1 && critique.nextActions.length <= 3, JSON.stringify({ ending: record.ending, finalResources: record.finalResources, critique }));
        fs.writeFileSync(path.join(OUT, `claude-audit-${caseId}.json`), JSON.stringify({
          syntheticQaRun: true,
          caseId,
          runId,
          recordFacts: { ending: record.ending, finalResources: record.finalResources, decisionCount: record.timeline.length },
          audit,
        }, null, 2));
      }
      check(`${caseId} analysis is rendered as escaped text`, !await page.eval('Boolean(document.querySelector(".coach-analysis.done script, .coach-analysis.done img, .coach-analysis.done iframe"))'));
    }
    const external = page.requests.filter((url) => !url.startsWith(base) && !url.startsWith('data:') && url !== 'about:blank');
    check('browser sends no external requests', external.length === 0, external.join(', '));
    check('browser has no uncaught JavaScript errors', page.errors.length === 0, page.errors.join(' | '));
  } catch (error) {
    check('all-case postgame coach flow completes', false, error.stack ?? error.message);
    await browser.page.screenshot(path.join(OUT, 'error.png')).catch(() => {});
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await browser.close();
  }
  const payload = {
    browser: BROWSER,
    analysisMode: ANALYSIS_MODE,
    actualModelUsed: ANALYSIS_MODE === 'real-claude',
    total: results.length,
    failed: results.filter((item) => !item.pass).length,
    results,
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(payload, null, 2));
  console.log(`${BROWSER}/${ANALYSIS_MODE}: ${results.length} checks, ${payload.failed} failed.`);
  process.exit(payload.failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
