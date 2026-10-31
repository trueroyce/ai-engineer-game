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
const OUT = path.join(ROOT, 'docs/testing/artifacts/phase-31-case01-route', BROWSER);
const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass || !detail ? '' : ` — ${detail}`}`);
}

async function claimReward(page) {
  if (await page.eval('Boolean(document.querySelector("[data-upgrade]"))')) {
    await page.click('[data-upgrade]');
    await page.waitFor('document.querySelector("[data-action]")');
  }
}

async function runAction(page, actionId, option = null) {
  await page.click(`[data-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-confirm]")');
  if (option) {
    await page.eval(`(() => { const element = document.querySelector('[data-option="${option.key}"]'); element.value = '${option.value}'; element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await page.waitFor('!document.querySelector("[data-confirm]").disabled');
  }
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const result = await page.eval('({ title: document.querySelector(".event-result h1")?.textContent, stateVersion: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  await page.click('[data-continue]');
  await page.waitFor('document.querySelector("[data-upgrade]") || document.querySelector("[data-action]")');
  await claimReward(page);
  return result;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch({ executable: EXE[BROWSER] });
  try {
    const page = browser.page;
    await page.goto(`${base}case-01.html?seed=ui-route-10`);
    await page.click('[data-next="cards"]');
    await page.waitFor('document.querySelector("[data-card]")');
    await page.click('[data-card]');
    await page.click('[data-start]');
    await page.waitFor('document.querySelector("[data-action=A01]")');

    await runAction(page, 'A01');
    await runAction(page, 'A04');
    await runAction(page, 'A05');
    await runAction(page, 'A07', { key: 'target', value: 'core' });

    check('natural UI route opens A13 after actual A07 result', await page.eval('Boolean(document.querySelector("[data-action=A13]"))'));
    await page.click('[data-action="A13"]');
    await page.waitFor('document.querySelector("[data-option=route]")');
    check('success choice offers steady and expand in the rendered UI', await page.eval('document.querySelectorAll("[data-option=route] option").length === 3'));
    await page.eval(`(() => { const element = document.querySelector('[data-option="route"]'); element.value = 'expand'; element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await page.click('[data-confirm]');
    await page.waitFor('document.querySelector("[data-continue]")');
    await page.click('[data-continue]');
    await page.waitFor('document.querySelector("[data-action]")');
    await claimReward(page);
    check('expand changes legal work by opening A03', await page.eval('Boolean(document.querySelector("[data-action=A03]"))'));
    check('expand leaves a named public issue', await page.eval('window.__AIEG_NARRATIVE_TEST__.state.knownIssues.some(x => x.code === "phase31-extra-scope" && x.status !== "fixed")'));

    await runAction(page, 'A09');
    await runAction(page, 'A08');
    check('two later works reveal A14 instead of resolving the consequence automatically', await page.eval('Boolean(document.querySelector("[data-action=A14]")) && window.__AIEG_NARRATIVE_TEST__.state.story.followUpWork >= 2'));
    await runAction(page, 'A14', { key: 'route', value: 'cut-back' });
    check('cut-back resolves only the named scope issue', await page.eval('window.__AIEG_NARRATIVE_TEST__.state.requirement.scope === "bounded" && window.__AIEG_NARRATIVE_TEST__.state.knownIssues.find(x => x.code === "phase31-extra-scope").status === "fixed"'));
    check('no external requests or console errors', page.requests.every((url) => url.startsWith(base) || url.startsWith('data:') || url === 'about:blank') && page.errors.length === 0, page.errors.join(' | '));
    await page.screenshot(path.join(OUT, 'case01-delayed-consequence.png'));
  } catch (error) {
    check('browser flow completed', false, error.stack ?? error.message);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = checks.filter((item) => !item.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: BROWSER, checks, failed: failed.length }, null, 2));
  console.log(`${BROWSER}: ${checks.length} checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
