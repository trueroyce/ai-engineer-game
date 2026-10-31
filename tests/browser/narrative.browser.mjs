// 敘事案件 01 的真實瀏覽器回歸。使用使用者已安裝的 Chrome／Edge 與零依賴 CDP 驅動。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';
import { createNarrativeGame, performAction } from '../../src/narrative/engine.js';

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
const OUT = path.join(ROOT, 'docs/testing/artifacts/phase-04', LABEL);
const results = [];
const shots = [];
const FORBIDDEN = /(?:A(?:0[1-9]|1[0-2])-[A-D]|E0[1-8]|OpenSpec|\/opsx|eventKey|functionState|hiddenFlags?|分支樹|擲骰|權重|機率|seed)/i;

function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() });
  console.log(`${pass ? '✔' : '✖'} [${group}] ${name}${pass || !detail ? '' : ` — ${detail}`}`);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot(file);
  shots.push(path.relative(ROOT, file).replaceAll('\\', '/'));
}

async function noLeak(page, group, where) {
  const html = await page.html();
  check(group, `${where}：DOM 不含內部事件、結局代碼、概率或開發規格字樣`, !FORBIDDEN.test(html));
}

async function setup(page, base) {
  await page.goto(`${base}case-01.html`);
  await page.waitFor('document.querySelector("[data-template=balanced]")');
  const text = await page.text();
  check('setup', '載入案件 01 標題', text.includes('就一個待辦清單，應該很快吧'));
  check('setup', '模擬說明恰出現一次', (text.match(/不會連線執行Claude Code/g) || []).length === 1);
  check('setup', '四種角色模板可選', await page.eval('document.querySelectorAll("[data-template]").length') === 4);
  await page.click('[data-template="analyst"]');
  check('setup', '模板會套用 3/2/1', (await page.text()).includes('分析 3　實作 2　驗證 1'));
  await page.click('[data-template="balanced"]');
  await page.click('[data-next="cards"]');
  await page.waitFor('document.querySelectorAll("[data-card]").length === 4');
  const cards = await page.eval('[...document.querySelectorAll("[data-card]")].map(x=>x.dataset.card)');
  check('setup', '固定本局抽四張不同工具', cards.length === 4 && new Set(cards).size === 4, cards.join(','));
  await page.click(`[data-card="${cards[0]}"]`);
  check('setup', '只選一張時不能開始', await page.eval('document.querySelector("[data-start]").disabled'));
  await page.click(`[data-card="${cards[1]}"]`);
  await page.click('[data-start]');
  await page.waitFor('document.querySelector("[data-action=A05]")');
  check('setup', 'HUD 只顯示基本資源與加班', (await page.text()).includes('Token') && (await page.text()).includes('壓力') && (await page.text()).includes('時間'));
  await noLeak(page, 'setup', '開局後');
  await shot(page, '01-play-start');
}

async function mouseFlow(page) {
  await page.click('[data-action="A05"]');
  await page.waitFor('document.querySelector("[data-confirm]")');
  const preview = await page.text();
  check('mouse', '先顯示核准敘事、成本、風險與 CLI 操作，再允許確認', preview.includes('工作預覽') && preview.includes('預期成本') && preview.includes('已知風險') && preview.includes('/diff') && Boolean(await page.eval('document.querySelector(".terminal")?.textContent.includes("[工具動作]")')));
  await page.press('Escape');
  await page.waitFor('document.querySelector("[data-action=A05]")');
  check('mouse', 'Escape 關閉預覽而不執行', await page.eval('document.querySelector(".hud .stat strong")?.textContent.trim() === "24"'));
  await page.click('[data-action="A05"]');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const resultShape = await page.eval('({ terminal: document.querySelector(".terminal")?.textContent.includes("[工具輸出]"), story: (document.querySelector(".story")?.textContent.length ?? 0) > 40, summary: (document.querySelector(".summary")?.textContent.length ?? 0) > 10 })');
  check('mouse', '結果含 CLI／工具輸出、長敘事與自然語言摘要', resultShape.terminal && resultShape.story && resultShape.summary, JSON.stringify(resultShape));
  await noLeak(page, 'mouse', '工作結果');
  await shot(page, '02-action-result');
  await page.click('[data-continue]');
  await page.waitFor('document.querySelector("[data-view-result=A05]")');
  const playAfter = await page.text();
  check('repeat', '右側顯示自然語言案件進度與交付缺口', playAfter.includes('案件進度') && playAfter.includes('目前成果') && playAfter.includes('正式交付'));
  check('repeat', '同版本工作把查看紀錄與開始新工作分成兩個入口', await page.eval('Boolean(document.querySelector("[data-view-result=A05]") && document.querySelector("[data-action=A05]"))'));
  const beforeRepeat = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  await page.click('[data-view-result="A05"]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const afterRepeat = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  check('repeat', '查看上次結果不扣 Token／時間／加班', JSON.stringify(beforeRepeat) === JSON.stringify(afterRepeat));
  check('repeat', '查看直接讀保存紀錄，不經新工作預覽', (await page.text()).includes('這是先前結果，只供查看') && !Boolean(await page.eval('document.querySelector("[data-confirm]")')));
  await page.click('[data-continue]');
}

async function keyboardAndMobile(page) {
  await page.tabTo('[data-action="A01"]');
  await page.press('Enter');
  await page.waitFor('document.querySelector("[data-cancel]")');
  check('keyboard', 'Tab＋Enter 可開啟工作預覽', (await page.text()).includes('再問一句，少做三天'));
  await page.press('Escape');
  await page.waitFor('document.querySelector("[data-action=A01]")');
  await page.setViewport(360, 760, true);
  const metrics = await page.eval('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,buttons:[...document.querySelectorAll("button")].every(b=>b.getBoundingClientRect().height>=35)})');
  check('mobile', '360px 無水平溢出', metrics.sw <= metrics.cw + 1, JSON.stringify(metrics));
  check('mobile', '窄版按鈕保有可操作高度', metrics.buttons, JSON.stringify(metrics));
  await shot(page, '03-mobile-360');
  await page.setViewport(1280, 900, false);
}

async function finish(page) {
  await page.click('[data-action="A12"]');
  await page.waitFor('document.querySelector("input[value=stop]")');
  await page.click('input[value="stop"]');
  await page.waitFor('!document.querySelector("[data-confirm]").disabled');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-new]")');
  const text = await page.text();
  check('ending', '由實際 UI 選擇停止並到達單一完整結局', text.includes('主動止損，今天不再召喚新問題'));
  check('ending', '結算可用新種子重玩', Boolean(await page.eval('document.querySelector("[data-new]")')));
  await noLeak(page, 'ending', '結算畫面');
  await shot(page, '04-ending');
}

async function startSeededRoute(page, base, seed) {
  await page.goto(`${base}case-01.html?seed=${encodeURIComponent(seed)}`);
  await page.waitFor('document.querySelector("[data-next=cards]")');
  await page.click('[data-next="cards"]');
  await page.waitFor('document.querySelectorAll("[data-card]").length === 4');
  const cards = await page.eval('[...document.querySelectorAll("[data-card]")].map(x=>x.dataset.card)');
  await page.click(`[data-card="${cards[0]}"]`);
  await page.click(`[data-card="${cards[1]}"]`);
  await page.click('[data-start]');
  await page.waitFor('document.querySelector("[data-action]")');
}

async function openAction(page, actionId) {
  if (!(await page.eval(`Boolean(document.querySelector('[data-action="${actionId}"]'))`))) {
    await page.click('[data-more]');
    await page.waitFor(`document.querySelector('[data-action="${actionId}"]')`);
  }
  await page.click(`[data-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-confirm]")');
}

async function viewPrevious(page, actionId) {
  if (!(await page.eval(`Boolean(document.querySelector('[data-view-result="${actionId}"]'))`))) {
    await page.click('[data-more]');
    await page.waitFor(`document.querySelector('[data-view-result="${actionId}"]')`);
  }
  const before = await page.eval('({ resources: window.__AIEG_NARRATIVE_TEST__.view.resources, stateVersion: window.__AIEG_NARRATIVE_TEST__.state.stateVersion, workCount: window.__AIEG_NARRATIVE_TEST__.state.workCount })');
  await page.click(`[data-view-result="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-continue]")');
  const viewed = await page.eval('({ resources: window.__AIEG_NARRATIVE_TEST__.view.resources, stateVersion: window.__AIEG_NARRATIVE_TEST__.state.stateVersion, workCount: window.__AIEG_NARRATIVE_TEST__.state.workCount, text: document.querySelector(".result")?.textContent, title: document.querySelector(".result h1")?.textContent, hasConfirm: Boolean(document.querySelector("[data-confirm]")) })');
  return { before, viewed };
}

async function runAction(page, actionId) {
  await openAction(page, actionId);
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  await page.click('[data-continue]');
  await page.waitFor('document.querySelector("[data-upgrade]") || document.querySelector("[data-action]")');
  if (await page.eval('Boolean(document.querySelector("[data-upgrade]"))')) {
    await page.click('[data-upgrade]');
    await page.waitFor('document.querySelector("[data-action]")');
  }
}

async function deliver(page, intent, expectedTitle, group) {
  await openAction(page, 'A12');
  if (group === 'route-E01') {
    const readiness = await page.eval('({state:window.__AIEG_NARRATIVE_TEST__.state,view:window.__AIEG_NARRATIVE_TEST__.view})');
    const currentEvidence = Object.values(readiness.state.evidence).filter((item) => item.artifactRevision === readiness.state.artifact.revision && item.result === 'pass');
    check(group, '正式交付前由瀏覽器操作取得完整本版證據', readiness.state.artifact.kind === 'implementation' && currentEvidence.length === 6 && readiness.state.knownIssues.every((item) => item.status === 'fixed'));
  }
  await page.click(`input[value="${intent}"]`);
  await page.waitFor('!document.querySelector("[data-confirm]").disabled');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-new]")');
  check(group, `由玩家工作選擇實際到達 ${expectedTitle}`, (await page.text()).includes(expectedTitle));
  await noLeak(page, group, `${expectedTitle} 結局`);
}

function readyDeliveryState({ overtimeUsed = 0, wrongDraft = false } = {}) {
  const state = createNarrativeGame({ seed: `browser-playtest-ui-${overtimeUsed}-${wrongDraft}` });
  state.timeLeft = 0;
  state.workCount = 12 + overtimeUsed;
  state.overtimeUsed = overtimeUsed;
  state.artifact.kind = 'implementation';
  state.artifact.revision = 7;
  state.repairHistory = true;
  state.documents.draft = wrongDraft;
  state.documents.wrongCompletionRule = wrongDraft;
  for (const id of Object.keys(state.functionState)) {
    state.functionState[id] = 'correct';
    state.evidence[id] = { requirementId: id, artifactRevision: 7, result: 'pass' };
  }
  return state;
}

async function setTestState(page, state) {
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-action=A12]")');
}

async function playtestUiRegressions(page, base) {
  const ready = readyDeliveryState();
  await setTestState(page, ready);
  const before = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  await openAction(page, 'A12');
  const deliveryPreview = await page.text();
  check('playtest-ui', 'A12 預覽明示免費且不耗時間或加班', deliveryPreview.includes('免費查看與結案，不消耗 Token、時間或加班') && !deliveryPreview.includes('另含加班代價'));
  await page.click('input[value="formal"]');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-new]")');
  const after = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  check('playtest-ui', 'D0 且未加班的正式交付為 E03，資源保持不變', (await page.text()).includes('有驚無險，返工也算走過的路') && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));

  let capped = createNarrativeGame({ seed: 'browser-hard-cap-ui' });
  capped = performAction(capped, 'A01', { operationId: 'browser-hard-cap-history', stateVersion: capped.stateVersion, designate: 'A01-A' }).state;
  capped.timeLeft = 0;
  capped.workCount = 14;
  capped.overtimeUsed = 2;
  await setTestState(page, capped);
  const hardCap = await page.eval('({newWork:[...document.querySelectorAll("[data-action]")].map(x=>x.dataset.action),rest:Boolean(document.querySelector("[data-rest]")),history:Boolean(document.querySelector("[data-view-result=A01]"))})');
  check('playtest-ui', '硬上限只保留交付與唯讀歷史，沒有新工作或休息', JSON.stringify(hardCap.newWork) === JSON.stringify(['A12']) && !hardCap.rest && hardCap.history, JSON.stringify(hardCap));

  const staleDraft = readyDeliveryState({ wrongDraft: true });
  await setTestState(page, staleDraft);
  const progress = await page.eval('document.querySelector(".progress")?.textContent');
  check('playtest-ui', '六項已驗證時舊草稿只顯示不阻擋的歷史提醒', progress.includes('歷史提醒') && progress.includes('不阻擋目前交付') && !progress.includes('需求草稿有一段需要訂正'), progress);
}

async function canonicalBrowserRoutes(page, base) {
  const seed = 'browser-round2-2';

  await startSeededRoute(page, base, seed);
  await runAction(page, 'A05');
  await runAction(page, 'A07');
  await runAction(page, 'A08');
  await deliver(page, 'formal', '小而可靠，牛奶活到明天', 'route-E01');
  await shot(page, '05-e01-formal');

  await startSeededRoute(page, base, seed);
  await runAction(page, 'A05');
  await runAction(page, 'A08');
  await deliver(page, 'limited', '誠實試用，附帶一張小紙條', 'route-E04');
  await shot(page, '06-e04-limited');

  await startSeededRoute(page, base, seed);
  await runAction(page, 'A05');
  await runAction(page, 'A07');
  await runAction(page, 'A08');
  for (let i = 0; i < 10; i += 1) {
    await page.click('[data-rest]');
    await page.waitFor('document.querySelector("[data-continue]")');
    await page.click('[data-continue]');
    await page.waitFor('document.querySelector("[data-action]")');
  }
  check('route-E06', '第 13 次工作由 UI 實際使用一次加班', (await page.text()).includes('1 / 2'));
  await deliver(page, 'formal', '做對了，但鐘比你早交卷', 'route-E06');
  await shot(page, '07-e06-overtime');
}

async function checkedCBranchRoutes(page, base) {
  const cases = [
    { seed: 'nat-core-0', target: 'core', scope: '新增、完成與取消', story: '你要補核心操作', observed: '第二條', summary: '核心操作與刪除證據失效' },
    { seed: 'nat-delete-2', target: 'delete', scope: '刪除單一項目', story: '你要處理單筆刪除', observed: '第二筆', summary: '刪除證據失效' },
  ];
  for (const item of cases) {
    await startSeededRoute(page, base, item.seed);
    await runAction(page, 'A05');
    await openAction(page, 'A07');
    await page.eval(`document.querySelector("[data-option=target]").value=${JSON.stringify(item.target)}; document.querySelector("[data-option=target]").dispatchEvent(new Event("change", {bubbles:true}))`);
    await page.click('[data-option-check="checkDelete"]');
    await page.click('[data-confirm]');
    await page.waitFor('document.querySelector("[data-continue]")');
    const immediate = await page.eval('({eventId:window.__AIEG_NARRATIVE_TEST__.state.lastEvent.event.id,text:document.querySelector(".result")?.textContent,story:document.querySelector(".story")?.textContent,summary:document.querySelector(".summary")?.textContent})');
    check('a07-c-natural', `固定自然 seed ${item.seed}（未指定事件）實際解析為 checked A07-C`, immediate.eventId === 'A07-C', JSON.stringify(immediate));
    check('a07-c-natural', `${item.target} 即時結果的範圍、已觀察缺陷與摘要一致`, immediate.text.includes(`本次範圍：${item.scope}`) && immediate.story.includes(item.story) && immediate.story.includes(item.observed) && !immediate.story.includes('你要保存') && immediate.summary.includes(item.summary), JSON.stringify(immediate));
    const immediateStory = immediate.story;
    const immediateSummary = immediate.summary;
    await page.click('[data-continue]');
    await page.waitFor('document.querySelector("[data-upgrade]") || document.querySelector("[data-action]")');
    if (await page.eval('Boolean(document.querySelector("[data-upgrade]"))')) {
      await page.click('[data-upgrade]');
      await page.waitFor('document.querySelector("[data-action]")');
    }
    const viewed = await viewPrevious(page, 'A07');
    check('a07-c-natural', `${item.target} 歷史回看保留同一 checked A07-C 文本且零成本`, viewed.viewed.text.includes(immediateStory) && viewed.viewed.text.includes(immediateSummary) && viewed.viewed.text.includes(`範圍：${item.scope}`) && !viewed.viewed.hasConfirm && JSON.stringify(viewed.before) === JSON.stringify({ resources: viewed.viewed.resources, stateVersion: viewed.viewed.stateVersion, workCount: viewed.viewed.workCount }), JSON.stringify(viewed));
    await page.click('[data-continue]');
    await deliver(page, 'stop', '主動止損，今天不再召喚新問題', 'a07-c-natural');
  }
}

async function revisionEntryRoutes(page, base) {
  await startSeededRoute(page, base, 'browser-round2-2');
  await runAction(page, 'A05');
  await runAction(page, 'A06');
  const a06RevisionBefore = await page.eval('window.__AIEG_NARRATIVE_TEST__.state.revisions.A06');
  await openAction(page, 'A06');
  check('revision-ui', '追問入口在第二次 A06 由玩家可見', Boolean(await page.eval('document.querySelector("[data-option-check=newRevision]")')));
  await page.click('[data-option-check="newRevision"]');
  const paidQuestionPreview = await page.eval('({ checked: document.querySelector("[data-option-check=newRevision]")?.checked, confirm: document.querySelector("[data-confirm]")?.textContent, text: document.querySelector(".result")?.textContent })');
  check('revision-ui', '選擇新問題後預覽立即改為付費確認', paidQuestionPreview.checked && paidQuestionPreview.confirm === '確認執行' && paidQuestionPreview.text.includes('1 Token') && !paidQuestionPreview.text.includes('同一個輸入與產物版本'), JSON.stringify(paidQuestionPreview));
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  check('revision-ui', 'A06 新問題從 UI 建立新 revision 並照常結算', await page.eval(`window.__AIEG_NARRATIVE_TEST__.state.revisions.A06 === ${a06RevisionBefore + 1}`));
  const a06Title = await page.eval('document.querySelector(".result h1")?.textContent');
  await page.click('[data-continue]');
  await page.waitFor('document.querySelector("[data-view-result=A06]")');
  const a06Viewed = await viewPrevious(page, 'A06');
  check('revision-ui', 'A06 新 revision 可直接唯讀回看同一結果且零成本', a06Viewed.viewed.title === a06Title && !a06Viewed.viewed.hasConfirm && JSON.stringify(a06Viewed.before) === JSON.stringify({ resources: a06Viewed.viewed.resources, stateVersion: a06Viewed.viewed.stateVersion, workCount: a06Viewed.viewed.workCount }), JSON.stringify(a06Viewed));
  await page.click('[data-continue]');
  await deliver(page, 'stop', '主動止損，今天不再召喚新問題', 'revision-ui');

  await startSeededRoute(page, base, 'browser-edit-5');
  await runAction(page, 'A01');
  await runAction(page, 'A04');
  const a04RevisionBefore = await page.eval('window.__AIEG_NARRATIVE_TEST__.state.revisions.A04');
  await openAction(page, 'A04');
  check('revision-ui', 'A04 錯誤驗收稿顯示訂正入口', Boolean(await page.eval('document.querySelector("[data-option-check=repairDraft]")')));
  await page.click('[data-option-check="repairDraft"]');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  check('revision-ui', 'A04 訂正從 UI 建立新 revision', await page.eval(`window.__AIEG_NARRATIVE_TEST__.state.revisions.A04 === ${a04RevisionBefore + 1}`));
  const a04Title = await page.eval('document.querySelector(".result h1")?.textContent');
  await page.click('[data-continue]');
  const a04Viewed = await viewPrevious(page, 'A04');
  check('revision-ui', 'A04 repairDraft 可直接唯讀回看同一結果且零成本', a04Viewed.viewed.title === a04Title && !a04Viewed.viewed.hasConfirm && JSON.stringify(a04Viewed.before) === JSON.stringify({ resources: a04Viewed.viewed.resources, stateVersion: a04Viewed.viewed.stateVersion, workCount: a04Viewed.viewed.workCount }), JSON.stringify(a04Viewed));
  await page.click('[data-continue]');
  await deliver(page, 'stop', '主動止損，今天不再召喚新問題', 'revision-ui');

  await startSeededRoute(page, base, 'browser-repair-184');
  await runAction(page, 'A05');
  await runAction(page, 'A07');
  await runAction(page, 'A11');
  const a11RevisionBefore = await page.eval('window.__AIEG_NARRATIVE_TEST__.state.revisions.A11');
  await openAction(page, 'A11');
  check('revision-ui', 'A11 相鄰缺陷顯示下一個修復入口', Boolean(await page.eval('document.querySelector("[data-option-check=repairDraft]")')));
  await page.click('[data-option-check="repairDraft"]');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  check('revision-ui', 'A11 第二次修復從 UI 建立新 revision', await page.eval(`window.__AIEG_NARRATIVE_TEST__.state.revisions.A11 === ${a11RevisionBefore + 1}`));
  await page.click('[data-continue]');
  await deliver(page, 'stop', '主動止損，今天不再召喚新問題', 'revision-ui');

  await startSeededRoute(page, base, 'browser-repair-184');
  await runAction(page, 'A05');
  await openAction(page, 'A07');
  await page.eval('document.querySelector("[data-option=target]").value="core"; document.querySelector("[data-option=target]").dispatchEvent(new Event("change", {bubbles:true}))');
  await page.click('[data-option-check="useC2"]');
  await page.click('[data-option-check="checkDelete"]');
  const targetPreview = await page.eval('({ value: document.querySelector("[data-option=target]")?.value, c2: document.querySelector("[data-option-check=useC2]")?.checked, checkDelete: document.querySelector("[data-option-check=checkDelete]")?.checked, confirm: document.querySelector("[data-confirm]")?.textContent, text: document.querySelector(".result")?.textContent })');
  check('history-ui', '非預設 core、C2 與刪除檢查在執行前使用同一即時成本預覽', targetPreview.value === 'core' && targetPreview.c2 && targetPreview.checkDelete && targetPreview.confirm === '確認執行' && targetPreview.text.includes('2 Token'), JSON.stringify(targetPreview));
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const coreTitle = await page.eval('document.querySelector(".result h1")?.textContent');
  const coreResultText = await page.eval('document.querySelector(".result")?.textContent');
  check('history-ui', '非預設 core 結果明示本次範圍且不沿用保存敘事', coreResultText.includes('本次範圍：新增、完成與取消') && !coreResultText.includes('把保存接好了') && !coreResultText.includes('你要保存'), coreResultText);
  await page.click('[data-continue]');
  const coreViewed = await viewPrevious(page, 'A07');
  check('history-ui', 'A07 回看保留 core、C2 與檢查資訊且零成本', coreViewed.viewed.title === coreTitle && coreViewed.viewed.text.includes('範圍：新增、完成與取消') && coreViewed.viewed.text.includes('使用「讓模型多做一點」') && coreViewed.viewed.text.includes('已做雙同名刪除檢查') && JSON.stringify(coreViewed.before) === JSON.stringify({ resources: coreViewed.viewed.resources, stateVersion: coreViewed.viewed.stateVersion, workCount: coreViewed.viewed.workCount }), JSON.stringify(coreViewed));
  await page.click('[data-continue]');

  await openAction(page, 'A07');
  const restored = await page.eval('({ target: document.querySelector("[data-option=target]")?.value, c2: document.querySelector("[data-option-check=useC2]")?.checked, checked: document.querySelector("[data-option-check=checkDelete]")?.checked, disabled: document.querySelector("[data-confirm]")?.disabled })');
  check('history-ui', '開始新工作保留上次語意選項，但同輸入不允許假裝重做', restored.target === 'core' && restored.c2 && restored.checked && restored.disabled, JSON.stringify(restored));
  await page.eval('document.querySelector("[data-option=target]").value="persistence"; document.querySelector("[data-option=target]").dispatchEvent(new Event("change", {bubbles:true}))');
  const paidPreview = await page.eval('({ text: document.querySelector(".result")?.textContent, disabled: document.querySelector("[data-confirm]")?.disabled, before: window.__AIEG_NARRATIVE_TEST__.view.resources })');
  check('history-ui', '改選 persistence 成為明確付費新工作，preview 可執行', paidPreview.text.includes('2 Token') && !paidPreview.disabled, JSON.stringify(paidPreview));
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const paidAfter = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  check('history-ui', '新工作 execute 與 preview 同為 2 Token／一次時間', paidPreview.before.token - paidAfter.token === 2 && paidPreview.before.time - paidAfter.time === 1, JSON.stringify({ before: paidPreview.before, after: paidAfter }));
  await page.click('[data-continue]');

  await openAction(page, 'A09');
  await page.click('[data-option-check="useC3"]');
  const c3Preview = await page.eval('({ checked: document.querySelector("[data-option-check=useC3]")?.checked, text: document.querySelector(".result")?.textContent, disabled: document.querySelector("[data-confirm]")?.disabled })');
  check('history-ui', 'C3 開啟後顯示付費檢查且可執行', c3Preview.checked && c3Preview.text.includes('3 Token') && !c3Preview.disabled, JSON.stringify(c3Preview));
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const c3Title = await page.eval('document.querySelector(".result h1")?.textContent');
  await page.click('[data-continue]');
  const c3Viewed = await viewPrevious(page, 'A09');
  check('history-ui', 'C3 工作可直接回看原結果與工具選項且零成本', c3Viewed.viewed.title === c3Title && c3Viewed.viewed.text.includes('使用「加做一次交叉檢查」') && JSON.stringify(c3Viewed.before) === JSON.stringify({ resources: c3Viewed.viewed.resources, stateVersion: c3Viewed.viewed.stateVersion, workCount: c3Viewed.viewed.workCount }), JSON.stringify(c3Viewed));
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  let server;
  let base = arg('--url');
  if (!base) {
    server = await startServer({ port: 0, quiet: true });
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  const browser = await launch({ executable: process.env.CHROME_PATH ?? EXECUTABLES[BROWSER], headed: HEADED });
  const meta = { browser: browser.version.Browser, executable: browser.executable, mode: HEADED ? 'headed' : 'headless', base, startedAt: new Date().toISOString() };
  console.log(`${LABEL}：${meta.browser}；${base}`);
  try {
    await setup(browser.page, base);
    await mouseFlow(browser.page);
    await keyboardAndMobile(browser.page);
    await finish(browser.page);
    await canonicalBrowserRoutes(browser.page, base);
    await checkedCBranchRoutes(browser.page, base);
    await revisionEntryRoutes(browser.page, base);
    await playtestUiRegressions(browser.page, base);
    const external = browser.page.requests.filter((u) => !u.startsWith('http://127.0.0.1:') && !u.startsWith('data:') && u !== 'about:blank');
    check('all', '所有請求均為本機同源', external.length === 0, external.join(', '));
    check('all', '整輪沒有 JavaScript 錯誤', browser.page.errors.length === 0, browser.page.errors.join(' | '));
  } catch (error) {
    check('all', '瀏覽器情境未中斷', false, error.stack ?? error.message);
    await shot(browser.page, 'error').catch(() => {});
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  meta.finishedAt = new Date().toISOString();
  const failed = results.filter((x) => !x.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ meta, total: results.length, failed: failed.length, screenshots: shots, results }, null, 2));
  console.log(`${LABEL}：${results.length} 項，失敗 ${failed.length}。`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
