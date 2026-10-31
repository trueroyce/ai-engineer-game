import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' };
const OUT = path.join(ROOT, 'docs/testing/artifacts/phase-32-case04', BROWSER);
const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass || !detail ? '' : ` — ${detail}`}`);
}

async function freshCase04(page, base) {
  await page.goto(base);
  await page.eval('localStorage.clear()');
  await page.reload();
  await page.click('[data-template="ultimate"]');
  await page.click('[data-create]');
  await page.waitFor('document.querySelectorAll("[data-starter-card]").length === 3');
  await page.click('[data-starter-card]');
  await page.waitFor('document.querySelectorAll(".project-start").length === 4');
  await page.click('.project:nth-child(4) .project-start');
  await page.waitFor('document.querySelector("[data-start-case]")');
  await page.click('[data-start-case]');
  await page.waitFor('window.__AIEG_CASE04_TEST__?.screen === "board"');
}

async function auditKeyboardRepaint(page, base) {
  await freshCase04(page, base);
  await page.click('[data-case04-action="D01"]');
  const selector = 'input[name="method"][value="logs"]';
  await page.waitFor(`document.querySelector(${JSON.stringify(selector)})`);
  await page.tabTo(selector);
  await page.eval('scrollTo(0, 180)');
  const before = await page.eval('({ scrollY, checked: document.activeElement.checked })');
  await page.press(' ');
  await page.waitFor(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`);
  const after = await page.eval(`({ scrollY, checked: document.querySelector(${JSON.stringify(selector)}).checked, focused: document.activeElement === document.querySelector(${JSON.stringify(selector)}) })`);
  await page.press('Tab');
  const afterTab = await page.eval('({ tag: document.activeElement?.tagName, inside: document.querySelector("#app").contains(document.activeElement) })');
  check('case 04 radio change preserves focus, scroll and the next Tab stop', !before.checked && after.checked && after.focused && after.scrollY === before.scrollY && afterTab.inside && afterTab.tag !== 'BODY', JSON.stringify({ before, after, afterTab }));
  await page.click('[data-case04-cancel]');
  page.dialogResponse = true;
}

async function claimReward(page) {
  if (await page.eval('window.__AIEG_CASE04_TEST__.screen === "reward"')) {
    await page.waitFor('document.querySelector("[data-case04-reward]")');
    await page.click('[data-case04-reward]');
    await page.waitFor('window.__AIEG_CASE04_TEST__.screen === "board"');
  }
}

async function auditMobileTransition(page, base) {
  await freshCase04(page, base);
  const initialRoute = await page.eval(`({
    actions: [...document.querySelectorAll('[data-case04-action]')].map((node) => node.dataset.case04Action),
    steps: [...document.querySelectorAll('.route-step')].map((node) => ({ className: node.className, text: node.textContent.trim() })),
    note: document.querySelector('.route-note')?.textContent ?? ''
  })`);
  check('case 04 initial board shows the full locked roadmap and the first actionable step', initialRoute.actions.join(',') === 'D01,D09' && initialRoute.steps.length === 5 && initialRoute.steps[0].className.includes('current') && initialRoute.steps.slice(1).every((step) => step.className.includes('locked') && step.text.includes('尚未開放')) && initialRoute.note.includes('不等於完成'), JSON.stringify(initialRoute));
  await page.setViewport(390, 844, true);
  const mobileRoute = await page.eval(`({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    columns: getComputedStyle(document.querySelector('.route-steps')).gridTemplateColumns,
    stepWidths: [...document.querySelectorAll('.route-step')].map((node) => node.getBoundingClientRect().width)
  })`);
  check('390px roadmap stacks into one readable column without horizontal overflow', mobileRoute.width <= mobileRoute.viewport && mobileRoute.stepWidths.every((width) => width <= mobileRoute.viewport) && !mobileRoute.columns.includes(' '), JSON.stringify(mobileRoute));
  const lockedContrast = await page.eval(`(() => {
    const channel = (value) => {
      const ratio = value / 255;
      return ratio <= .04045 ? ratio / 12.92 : ((ratio + .055) / 1.055) ** 2.4;
    };
    const rgb = (value) => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value) => {
      const [r, g, b] = rgb(value).map(channel);
      return .2126 * r + .7152 * g + .0722 * b;
    };
    return [...document.querySelectorAll('.route-step.locked')].map((node) => {
      const text = node.querySelector('small');
      const foreground = getComputedStyle(text).color;
      const background = getComputedStyle(node).backgroundColor;
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return {
        opacity: getComputedStyle(node).opacity,
        foreground,
        background,
        contrast: (lighter + .05) / (darker + .05),
        borderLeftWidth: getComputedStyle(node).borderLeftWidth,
        reason: text.textContent.trim()
      };
    });
  })()`);
  check('locked roadmap reasons remain readable while the border still marks the locked state', lockedContrast.length === 4 && lockedContrast.every((item) => item.opacity === '1' && item.contrast >= 4.5 && Number.parseFloat(item.borderLeftWidth) >= 4 && item.reason.includes('尚未開放')), JSON.stringify(lockedContrast));
  await page.eval('window.scrollTo(0, document.documentElement.scrollHeight)');
  await page.click('[data-case04-action="D01"]');
  await page.waitFor('document.querySelector("[data-case04-confirm]")');
  await page.waitFor("document.activeElement === document.querySelector('.preview h1')");
  const preview = await page.eval(`({
    scrollY,
    viewportHeight: innerHeight,
    titleTop: document.querySelector('.preview h1')?.getBoundingClientRect().top,
    focusedScreenTitle: document.activeElement === document.querySelector('.preview h1')
  })`);
  check('390px board-to-preview reveals and focuses the new title', preview.scrollY < 1200 && preview.titleTop >= 0 && preview.titleTop < preview.viewportHeight && preview.focusedScreenTitle, JSON.stringify(preview));
  await page.click('[data-case04-cancel]');
  page.dialogResponse = true;
  await page.setViewport(1280, 900, true);
}

async function act(page, id, value) {
  await page.waitFor(`document.querySelector('[data-case04-action="${id}"]')`);
  await page.click(`[data-case04-action="${id}"]`);
  await page.waitFor('document.querySelector("[data-case04-confirm]")');
  await page.click(`input[value="${value}"]`);
  await page.click('[data-case04-confirm]');
  if (id === 'D09') {
    await page.waitFor('document.querySelector(".ending")');
    return;
  }
  await page.waitFor('document.querySelector("[data-case04-continue]")');
  await page.click('[data-case04-continue]');
  await claimReward(page);
}

async function playStory(page, base, strategy, expectedConsequence) {
  await freshCase04(page, base);
  await act(page, 'D01', strategy === 'investigate' ? 'reproduce' : 'logs');
  await act(page, 'D02', strategy);

  const workGroups = await page.eval(`({
    ids: [...document.querySelectorAll('[data-case04-action]')].map((node) => node.dataset.case04Action),
    labels: [...document.querySelectorAll('[data-case04-action]')].map((node) => node.textContent.trim()),
    counts: [...document.querySelectorAll('.action-choice-count')].map((node) => node.textContent.trim())
  })`);
  const expectedGroups = strategy === 'rollback' ? 'D10,D09' : 'D03,D09';
  const roadmap = await page.eval(`({
    done: document.querySelectorAll('.route-step.done').length,
    current: document.querySelector('.route-step.current')?.textContent ?? '',
    locked: [...document.querySelectorAll('.route-step.locked')].map((node) => node.textContent.trim())
  })`);
  check(`${strategy}: board distinguishes two work groups from their six nested choices`, workGroups.ids.join(',') === expectedGroups && workGroups.labels.some((label) => label.includes('2 種做法')) && workGroups.labels.some((label) => label.includes('4 種做法')) && workGroups.counts.length === 2, JSON.stringify(workGroups));
  check(`${strategy}: roadmap marks completed strategy and explains the current gate`, roadmap.done === 2 && roadmap.current.includes(strategy === 'rollback' ? '資料相容處理' : '穩定化方式') && roadmap.locked.every((text) => text.includes('尚未開放')), JSON.stringify(roadmap));
  if (strategy === 'patch') await page.screenshot(path.join(OUT, 'work-groups-after-strategy.png'));

  const beforeReload = await page.eval('({ runId: window.__AIEG_CASE04_TEST__.state.runId, version: window.__AIEG_CASE04_TEST__.state.stateVersion, token: window.__AIEG_CASE04_TEST__.state.token })');
  page.dialogResponse = true;
  await page.reload();
  page.dialogResponse = false;
  const afterReload = await page.eval('({ runId: window.__AIEG_CASE04_TEST__.state.runId, version: window.__AIEG_CASE04_TEST__.state.stateVersion, token: window.__AIEG_CASE04_TEST__.state.token })');
  check(`${strategy}: reload resumes the exact active run`, JSON.stringify(beforeReload) === JSON.stringify(afterReload), JSON.stringify({ beforeReload, afterReload }));

  if (strategy === 'rollback') {
    check('rollback: D10 preflight is visible before execution and D03 is locked', await page.eval('Boolean(document.querySelector(\'[data-case04-action="D10"]\')) && !document.querySelector(\'[data-case04-action="D03"]\')'));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(page, 'D10', 'inspect');
      if (await page.eval('window.__AIEG_CASE04_TEST__.state.compatibilityDecision?.status === "decided"')) break;
    }
    check('rollback: compatibility is decided before any service execution', await page.eval('window.__AIEG_CASE04_TEST__.state.compatibilityDecision?.revision === window.__AIEG_CASE04_TEST__.state.revision && window.__AIEG_CASE04_TEST__.state.service.attempted === false'));
  }
  await act(page, 'D03', strategy === 'patch' ? 'parallel' : 'sequential');
  const route = await page.eval('window.__AIEG_CASE04_TEST__.state.story.outcome === "success" ? "freeze" : "alternate"');
  await act(page, 'D04', route);
  if (strategy === 'rollback') {
    await act(page, 'D11', 'verified');
    check('rollback: customer rejects an unsupported full-scope proposal with public reasons', await page.eval('window.__AIEG_CASE04_TEST__.state.approval?.decision === "rejected" && window.__AIEG_CASE04_TEST__.state.approval?.suggestedScope === "limited" && window.__AIEG_CASE04_TEST__.state.approval?.reasons?.length > 0'));
    await act(page, 'D11', 'limited');
    check('rollback: responsible person visibly approves the proposed limited scope', await page.eval('window.__AIEG_CASE04_TEST__.state.approval?.owner === "客戶／產品負責人" && window.__AIEG_CASE04_TEST__.state.approval?.scope === "limited"'));
  }
  await act(page, 'D05', strategy === 'investigate' ? 'requirement' : strategy === 'rollback' ? 'deploy' : 'code');
  await act(page, 'D07', 'full');

  const revealed = await page.eval('window.__AIEG_CASE04_TEST__.state.story.pendingConsequence');
  check(`${strategy}: early decision returns after two later works`, revealed?.revealed && revealed?.id === expectedConsequence, JSON.stringify(revealed));
  check(`${strategy}: delayed consequence opens a real recovery action`, await page.eval("Boolean(document.querySelector('[data-case04-action=\"D06\"]'))"));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(page, 'D06', 'contain');
    if (await page.eval('window.__AIEG_CASE04_TEST__.state.story.pendingConsequence.resolved')) break;
  }
  const state = await page.eval('window.__AIEG_CASE04_TEST__.state');
  check(`${strategy}: named consequence has a visible resolution`, state.story.pendingConsequence.resolved && state.issues.some((item) => item.id.includes(expectedConsequence)), JSON.stringify(state.issues));
  if (strategy === 'rollback') {
    check('rollback: delayed schema drift invalidates the early approval', state.approval?.status === 'stale', JSON.stringify(state.approval));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(page, 'D08', 'complete');
      if (await page.eval('window.__AIEG_CASE04_TEST__.state.handoff.complete')) break;
    }
    await act(page, 'D11', 'limited');
    await act(page, 'D09', 'limited');
  } else await act(page, 'D09', 'stop');
  const endingText = await page.text();
  const endingBase = await page.eval('window.__AIEG_CASE04_TEST__.state.ending.baseId');
  check(`${strategy}: ending cites the chosen strategy without claiming verified delivery`, endingText.includes('本局稱號') && endingBase === (strategy === 'rollback' ? 'C04-LIMITED' : 'C04-STOP') && !endingText.includes('所有公開條件完成'));
  const endingPresentation = await page.eval(`({
    heroBackground: getComputedStyle(document.querySelector('.ending .hero')).backgroundImage,
    playerExpression: document.querySelector('.raster-case04-art .raster-template')?.getAttribute('style') ?? '',
    scrollY,
    titleTop: document.querySelector('.ending h1')?.getBoundingClientRect().top,
    focusedTitle: document.activeElement === document.querySelector('.ending h1')
  })`);
  const expectedExpression = strategy === 'rollback' ? 'skeptical' : 'worried';
  check(`${strategy}: long ending copy remains on a readable light sheet`, !endingPresentation.heroBackground.includes('url('), JSON.stringify(endingPresentation));
  check(`${strategy}: ending uses the outcome-specific player expression`, endingPresentation.playerExpression.includes(`player-ultimate-${expectedExpression}.png`), endingPresentation.playerExpression);
  check(`${strategy}: ending reveals and focuses the visible title`, endingPresentation.titleTop >= 0 && endingPresentation.titleTop < 900 && endingPresentation.focusedTitle, JSON.stringify(endingPresentation));
  check(`${strategy}: static mode does not render the local coach`, await page.eval('document.querySelector("[data-analyze-run]") === null'));
  return { strategy, route, consequence: revealed.id };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true, enableLocalCoach: false });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXE[BROWSER] });
  const stories = [];
  try {
    const page = browser.page;
    await auditMobileTransition(page, base);
    await auditKeyboardRepaint(page, base);
    stories.push(await playStory(page, base, 'patch', 'patch-coupling'));
    await page.screenshot(path.join(OUT, 'patch-ending.png'));
    stories.push(await playStory(page, base, 'investigate', 'wrong-requirement'));
    stories.push(await playStory(page, base, 'rollback', 'schema-drift'));
    await page.setViewport(360, 800, true);
    const mobile = await page.eval('({ width: document.documentElement.scrollWidth, viewport: innerWidth, coach: Boolean(document.querySelector("[data-analyze-run]")) })');
    check('360px ending has no horizontal overflow and no coach probe', mobile.width <= mobile.viewport && !mobile.coach, JSON.stringify(mobile));
    await page.screenshot(path.join(OUT, 'rollback-ending-mobile.png'));
    check('three natural UI stories have distinct decisions and consequences', new Set(stories.map((item) => JSON.stringify(item))).size === 3, JSON.stringify(stories));
    check('no external requests or console errors', page.requests.every((url) => url.startsWith(base) || url.startsWith('data:') || url === 'about:blank') && page.errors.length === 0, page.errors.join(' | '));
  } catch (error) {
    check('case 04 browser flow completed', false, error.stack ?? error.message);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = checks.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, stories, checks, failed: failed.length }, null, 2));
  console.log(`${BROWSER}: ${checks.length} case 04 checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
