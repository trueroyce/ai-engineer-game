import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chooseUpgrade, composeEnding, createNarrativeGame, performAction, upgradeChoices } from '../../src/narrative/engine.js';
import { startServer } from '../../scripts/serve.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const BROWSER = arg('--browser') ?? 'chrome';
const HEADED = argv.includes('--headed');
const EXECUTABLES = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
};
const LABEL = `${BROWSER}-${HEADED ? 'headed' : 'headless'}`;
const OUT = path.resolve(ROOT, arg('--out') ?? path.join('docs/testing/artifacts/phase-13', LABEL));
const results = [];
const screenshots = [];

function check(group, name, pass, detail = '') {
  const item = { group, name, pass: Boolean(pass), detail: String(detail), at: new Date().toISOString() };
  results.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} [${group}] ${name}${item.pass || !detail ? '' : ` — ${detail}`}`);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot(file);
  screenshots.push(path.relative(ROOT, file).replaceAll('\\', '/'));
}

async function visibleSafety(page, group) {
  const text = await page.text();
  check(group, '玩家文字不出現 OpenSpec、opsx、骰值、權重或隱藏旗標', !/(OpenSpec|opsx|eventKey|functionState|hiddenFlags?|骰值|權重|成功率)/i.test(text));
}

async function startGame(page, base, { seed, templateId, preferredCard = 'C6', testBack = false }) {
  await page.goto(`${base}case-01.html?seed=${encodeURIComponent(seed)}`);
  await page.waitFor('document.querySelectorAll("[data-template]").length === 6');
  const intro = await page.eval(`({
    templates: document.querySelectorAll('[data-template]').length,
    hasAllocation: Boolean(document.querySelector('[data-attr], .attr-total')),
    text: document.querySelector('#app').textContent
  })`);
  check('setup', '六種模板可選且開場沒有數字能力或手動配點', intro.templates === 6 && !intro.hasAllocation && !/能力配點|需求\s*10|實作\s*10|驗證\s*10/.test(intro.text), JSON.stringify(intro));
  await page.click(`[data-template="${templateId}"]`);
  await page.click('[data-next="cards"]');
  await page.waitFor('document.querySelectorAll("[data-card]").length === 3');
  if (testBack) {
    await page.click('[data-back="intro"]');
    await page.waitFor('document.querySelectorAll("[data-template]").length === 6');
    await page.click(`[data-template="${templateId}"]`);
    await page.click('[data-next="cards"]');
    await page.waitFor('document.querySelectorAll("[data-card]").length === 3');
  }
  const cards = await page.eval('[...document.querySelectorAll("[data-card]")].map((card) => card.dataset.card)');
  check('setup', '開場固定三張不重複且只能選一張', cards.length === 3 && new Set(cards).size === 3, cards.join(','));
  const card = cards.includes(preferredCard) ? preferredCard : cards[0];
  await page.click(`[data-card="${card}"]`);
  check('setup', '選一張後即可開始', !(await page.eval('document.querySelector("[data-start]").disabled')));
  await page.click('[data-start]');
  await page.waitFor('document.querySelector("[data-action]")');
  return card;
}

async function setSelect(page, name, value) {
  await page.eval(`(() => { const el = document.querySelector('[data-option="${name}"]'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

async function openAction(page, actionId) {
  await page.click(`[data-action="${actionId}"]`);
  await page.waitFor('document.querySelector("[data-confirm]")');
}

async function executeAction(page, actionId, options = {}) {
  await openAction(page, actionId);
  if (options.target) await setSelect(page, 'target', options.target);
  if (options.mode) await setSelect(page, 'mode', options.mode);
  for (const option of ['useC2', 'useC3', 'checkDelete', 'newRevision', 'repairDraft']) {
    if (options[option] && !(await page.eval(`document.querySelector('[data-option-check="${option}"]')?.checked`))) {
      await page.click(`[data-option-check="${option}"]`);
    }
  }
  const preview = await page.eval(`({
    text: document.querySelector('.result')?.textContent,
    disabled: document.querySelector('[data-confirm]')?.disabled
  })`);
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const result = await page.eval(`({
    processCount: document.querySelectorAll('.process-story section').length,
    processText: document.querySelector('.process-story')?.textContent
      ?? Object.values(window.__AIEG_NARRATIVE_TEST__.view.lastEvent?.process ?? {}).join(' '),
    title: document.querySelector('.result h1')?.textContent ?? '',
    summary: document.querySelector('.summary')?.textContent ?? '',
    resources: window.__AIEG_NARRATIVE_TEST__.view.resources
  })`);
  await page.click('[data-continue]');
  await page.waitFor('document.querySelector("[data-upgrade]") || document.querySelector("[data-action]") || document.querySelector("[data-new]")');
  return { preview, result };
}

async function claimReward(page, preferred) {
  const choices = await page.eval('[...document.querySelectorAll("[data-upgrade]")].map((card) => card.dataset.upgrade)');
  const before = await page.eval('({ cards: window.__AIEG_NARRATIVE_TEST__.state.cards, text: document.querySelector("#app").textContent })');
  const noMaxed = choices.every((id) => (before.cards[id] ?? 0) < 2);
  check('cards', '中途獎勵三個身份不重複，滿級卡不佔選項', choices.length === 3 && new Set(choices).size === 3 && noMaxed, JSON.stringify({ choices, cards: before.cards }));
  check('cards', '獎勵畫面清楚區分取得新卡與融合升級', before.text.includes('取得新卡') || before.text.includes('融合升級'), before.text);
  const picked = choices.includes(preferred) ? preferred : choices[0];
  const oldLevel = before.cards[picked] ?? 0;
  await page.click(`[data-upgrade="${picked}"]`);
  await page.waitFor('document.querySelector("[data-action]")');
  const after = await page.eval('window.__AIEG_NARRATIVE_TEST__.state.cards');
  check('cards', '選卡只新增一級；同卡融合不增加卡槽', after[picked] === oldLevel + 1, JSON.stringify({ picked, oldLevel, after }));
  return picked;
}

async function normalUltimateRoute(page, base) {
  await startGame(page, base, { seed: 'balance-011', templateId: 'ultimate', testBack: true });
  const actionCount = await page.eval('document.querySelectorAll(".work-list [data-action]").length');
  check('actions', '主畫面只顯示當下有意義行動，且沒有固定三項的展開閘門', actionCount >= 2 && !(await page.eval('Boolean(document.querySelector("[data-more]"))')), String(actionCount));
  await visibleSafety(page, 'setup');
  await shot(page, '01-ultimate-start');

  const beforeCancel = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  await page.tabTo('[data-action="A01"]');
  await page.press('Enter');
  await page.waitFor('document.querySelector("[data-cancel]")');
  const tutorialBefore = await page.eval('({ open: document.querySelector(".tutorial")?.open, cli: document.querySelector(".tutorial .terminal")?.textContent })');
  check('tutorial', '完整 CLI 教學預設折疊且保留真實指令內容', tutorialBefore.open === false && tutorialBefore.cli.includes('/plan'));
  await page.click('.tutorial summary');
  check('tutorial', '「這招怎麼用？」可展開閱讀，不影響工作', await page.eval('document.querySelector(".tutorial").open'));
  await page.press('Escape');
  await page.waitFor('document.querySelector("[data-action=A01]")');
  const afterCancel = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.resources');
  check('cancel', '鍵盤取消預覽不扣資源也不取代主畫面', JSON.stringify(beforeCancel) === JSON.stringify(afterCancel));

  const requirement = await executeAction(page, 'A01');
  check('process', '成功分支先決定，再顯示玩家、AI、追問與後果四段過程', requirement.result.processCount === 4 && requirement.result.processText.includes('完成是保留') && requirement.result.processText.includes('Claude'), requirement.result.processText);
  check('requirements', '需求理解成功後離開主行動，只留唯讀歷史', !(await page.eval('Boolean(document.querySelector("[data-action=A01]"))')) && await page.eval('Boolean(document.querySelector("[data-view-result=A01]"))'));
  const beforeHistory = await page.eval('({ r: window.__AIEG_NARRATIVE_TEST__.view.resources, v: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  await page.click('.history-actions summary');
  await page.click('[data-view-result="A01"]');
  await page.waitFor('document.querySelector("[data-continue]")');
  check('history', '查看上次結果明示唯讀且沒有確認執行按鈕', (await page.text()).includes('這是先前結果，只供查看') && !(await page.eval('Boolean(document.querySelector("[data-confirm]"))')));
  await page.click('[data-continue]');
  const afterHistory = await page.eval('({ r: window.__AIEG_NARRATIVE_TEST__.view.resources, v: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  check('history', '唯讀歷史不扣費、不取骰、不改版本', JSON.stringify(beforeHistory) === JSON.stringify(afterHistory));

  await executeAction(page, 'A04');
  check('cards', '第一個 earned reward 在交付前出現', await page.eval('Boolean(document.querySelector("[data-upgrade]"))'));
  await claimReward(page, 'C1');
  await executeAction(page, 'A05');
  const expandedActionCount = await page.eval('document.querySelectorAll(".work-list [data-action]").length');
  check('actions', '狀態需要時可同時顯示超過三個主要工作', expandedActionCount > 3, String(expandedActionCount));
  const core = await executeAction(page, 'A07', { target: 'core', checkDelete: true });
  check('actions', '選定工作後才揭露範圍與交叉檢查，結果保留本次範圍', core.preview.text.includes('這次處理哪個範圍') && core.result.processText.includes('核心操作'));
  check('cards', '第二個 earned reward 約在流程三分之二、且仍有必要實作與驗證工作', await page.eval('Boolean(document.querySelector("[data-upgrade]"))'));
  await claimReward(page, 'C6');
  await executeAction(page, 'A07', { target: 'persistence', checkDelete: true });
  await executeAction(page, 'A09');
  const verification = await executeAction(page, 'A08');
  check('cards', '第二次獎勵選到的驗收清單確實降低後續必要驗證成本', verification.preview.text.includes('1 Token、一次工作時間'), verification.preview.text);
  const progression = await page.eval('({ equipped: window.__AIEG_NARRATIVE_TEST__.state.equipped, cards: window.__AIEG_NARRATIVE_TEST__.state.cards, claimed: window.__AIEG_NARRATIVE_TEST__.state.claimedThresholds, phase: window.__AIEG_NARRATIVE_TEST__.state.phase, canDeliver: Boolean(document.querySelector("[data-action=A12]")) })');
  check('cards', '開場加兩次中途選擇共三次；融合後持有一至三種卡', progression.equipped.length >= 1 && progression.equipped.length <= 3 && Object.values(progression.cards).reduce((sum, level) => sum + level, 0) === 3 && JSON.stringify(progression.claimed) === '[2,5]' && progression.phase === 'playing' && progression.canDeliver, JSON.stringify(progression));

  await openAction(page, 'A12');
  await page.click('input[value="formal"]');
  await page.waitFor('!document.querySelector("[data-confirm]").disabled');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-new]")');
  const ending = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.ending');
  check('ending', '正常全能戰士路線以自然 seed 達成完整交付', ending.baseId === 'E01', JSON.stringify(ending));
  await shot(page, '02-ultimate-ending');
}

async function beginnerContrast(page, base) {
  await startGame(page, base, { seed: 'balance-011', templateId: 'beginner' });
  const requirement = await executeAction(page, 'A01');
  const view = await page.eval('window.__AIEG_NARRATIVE_TEST__.view');
  check('contrast', '同一 seed 的真初心者自然走到需求失敗狀態，而不是模板預寫結論', view.primaryActions.some((action) => action.id === 'A01' && action.title === '重新理解需求') && requirement.result.title.length > 0, JSON.stringify({ title: requirement.result.title, actions: view.primaryActions.map((action) => action.title) }));
  check('contrast', '需求失敗顯示可選的重新理解需求，也允許直接做其他工作', view.primaryActions.some((action) => action.id === 'A01' && action.title === '重新理解需求') && view.primaryActions.some((action) => action.id !== 'A01' && action.id !== 'A12'), JSON.stringify(view.primaryActions.map((action) => action.id)));
  await page.setViewport(360, 760, true);
  const mobile = await page.eval('({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, progress: document.querySelector(".progress")?.tagName, buttons: [...document.querySelectorAll("button")].every((button) => button.getBoundingClientRect().height >= 35) })');
  check('mobile', '360px 不橫向溢出，案件進度可折疊且按鈕可操作', mobile.scroll <= mobile.client + 1 && mobile.progress === 'DETAILS' && mobile.buttons, JSON.stringify(mobile));
  await shot(page, '03-beginner-mobile');
  await page.setViewport(1280, 900, false);
}

async function reviewToggleRegression(page) {
  let state = createNarrativeGame({ seed: 'browser-review-toggle-3', templateId: 'balanced' });
  state.cards = { C3: 1 };
  state.equipped = ['C3'];
  state = performAction(state, 'A05', { operationId: 'fixture-a05', stateVersion: state.stateVersion, designate: 'A05-A' }).state;
  state = performAction(state, 'A09', { operationId: 'fixture-a09', stateVersion: state.stateVersion, designate: 'A09-B' }).state;
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-view-result=A09]")');
  const controls = await page.eval('({ reviewWork: Boolean(document.querySelector("[data-action=A09]")), history: Boolean(document.querySelector("[data-view-result=A09]")), otherScope: Boolean(document.querySelector("[data-action=A07]")) })');
  check('targeted-fixture', '已完成審查只有免費歷史；C3/交叉檢查 toggle 無法把同內容變成新工作', !controls.reviewWork && controls.history && controls.otherScope, JSON.stringify(controls));
  const before = await page.eval('({ r: window.__AIEG_NARRATIVE_TEST__.view.resources, v: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  await page.click('.history-actions summary');
  await page.click('[data-view-result="A09"]');
  await page.waitFor('document.querySelector("[data-continue]")');
  await page.click('[data-continue]');
  const after = await page.eval('({ r: window.__AIEG_NARRATIVE_TEST__.view.resources, v: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  check('targeted-fixture', '回看審查結果不改資源或版本，其他真正範圍仍可工作', JSON.stringify(before) === JSON.stringify(after));
}

async function documentRecoveryRegression(page) {
  let state = createNarrativeGame({ seed: 'recovery-ui-73', templateId: 'balanced' });
  state = performAction(state, 'A01', { operationId: 'recovery-a01', stateVersion: state.stateVersion, designate: 'A01-A' }).state;
  const first = performAction(state, 'A04', { operationId: 'recovery-a04-1', stateVersion: state.stateVersion });
  state = first.state;
  const second = performAction(state, 'A04', { operationId: 'recovery-a04-2', stateVersion: state.stateVersion, repairDraft: true });
  state = second.state;
  check('document-recovery', '固定 seed 自然形成連續兩次文件恢復失敗', first.result.event.id === 'A04-B' && second.result.event.id === 'A04-C', `${first.result.event.id},${second.result.event.id}`);

  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-action=A04]")');
  const panelText = await page.text();
  check('document-recovery', '文件誤解與已知功能問題分區一致，不把空程式問題清單說成整案無問題', panelText.includes('需求文件仍有已知誤解待訂正') && panelText.includes('已確認問題與驗證異常') && panelText.includes('目前沒有已確認的功能或程式問題；文件誤解與待答事項另列在交付缺口'), panelText);
  const before = await page.eval('({ resources: window.__AIEG_NARRATIVE_TEST__.view.resources, version: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  await openAction(page, 'A04');
  const preview = await page.eval('({ checked: document.querySelector("[data-option-check=repairDraft]")?.checked, text: document.querySelector(".result")?.textContent })');
  check('document-recovery', '第二次失敗後仍提供醒目的付費新修訂入口', preview.checked && preview.text.includes('2 Token、一次工作時間'), JSON.stringify(preview));
  await page.click('[data-cancel]');
  await page.waitFor('document.querySelector("[data-action=A04]")');
  const afterCancel = await page.eval('({ resources: window.__AIEG_NARRATIVE_TEST__.view.resources, version: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  check('document-recovery', '取消第三次恢復不扣資源、不改版本', JSON.stringify(before) === JSON.stringify(afterCancel));

  await page.click('[data-view-result="A04"]');
  await page.waitFor('document.querySelector("[data-continue]")');
  check('document-recovery', '失敗結果可唯讀回看且不冒稱仍有客戶未回答問題', (await page.text()).includes('這是先前結果，只供查看') && !(await page.text()).includes('未回答的問題仍然存在'));
  await page.click('[data-continue]');
  const afterHistory = await page.eval('({ resources: window.__AIEG_NARRATIVE_TEST__.view.resources, version: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  check('document-recovery', '回看失敗文件結果不扣資源、不改版本', JSON.stringify(before) === JSON.stringify(afterHistory));

  await executeAction(page, 'A04');
  const recovered = await page.eval('({ confirmed: window.__AIEG_NARRATIVE_TEST__.state.documents.confirmed, wrong: window.__AIEG_NARRATIVE_TEST__.state.documents.wrongCompletionRule, hasWork: Boolean(document.querySelector("[data-action=A04]")) })');
  check('document-recovery', '第三次自然恢復成功後文件確認、錯誤標記清除且工作離開主清單', recovered.confirmed && !recovered.wrong && !recovered.hasWork, JSON.stringify(recovered));
}

async function checkpointRepairRegression(page) {
  let state = createNarrativeGame({ seed: 'checkpoint-repair-browser', templateId: 'beginner', selectedCards: ['C6'] });
  const apply = (actionId, options = {}) => {
    state = performAction(state, actionId, {
      ...options,
      operationId: `checkpoint-browser-${state.stateVersion}-${actionId}`,
      stateVersion: state.stateVersion,
    }).state;
  };
  apply('A05', { designate: 'A05-B' });
  apply('A11', { designate: 'A11-B', mode: 'fix' });
  apply('A11', { designate: 'A11-C', mode: 'rollback' });
  apply('A06', { designate: 'A06-A' });
  if (state.pendingUpgrades.length) state = chooseUpgrade(state, upgradeChoices(state)[0]);

  await page.setViewport(390, 844, true);
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-action=A11]")');
  const restored = await page.eval(`({
    issues: window.__AIEG_NARRATIVE_TEST__.view.knownIssues,
    canStart: window.__AIEG_NARRATIVE_TEST__.view.primaryActions.some((action) => action.id === 'A11' && action.canStart),
    checkpoint: window.__AIEG_NARRATIVE_TEST__.state.checkpoint,
    rollbackAvailable: window.__AIEG_NARRATIVE_TEST__.state.rollbackAvailable
  })`);
  check('checkpoint-repair', '指定事件重現：rollback 後已知問題仍存在且修復入口可用', restored.issues.length === 1 && restored.canStart && restored.checkpoint === null && restored.rollbackAvailable === false, JSON.stringify(restored));

  await openAction(page, 'A11');
  const preview = await page.eval(`({
    mode: document.querySelector('[data-option="mode"]')?.value,
    rollbackDisabled: document.querySelector('[data-option="mode"] option[value="rollback"]')?.disabled,
    confirmDisabled: document.querySelector('[data-confirm]')?.disabled,
    resources: window.__AIEG_NARRATIVE_TEST__.view.resources,
    workCount: window.__AIEG_NARRATIVE_TEST__.state.workCount
  })`);
  check('checkpoint-repair', '新修復工作不沿用已消耗的 rollback，預覽改用合法 fix', preview.mode === 'fix' && preview.rollbackDisabled && !preview.confirmDisabled, JSON.stringify(preview));
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const after = await page.eval(`({
    hasProcess: Boolean(document.querySelector('.process-story')),
    message: document.querySelector('.result')?.textContent ?? '',
    actionId: window.__AIEG_NARRATIVE_TEST__.state.lastEvent?.actionId,
    options: window.__AIEG_NARRATIVE_TEST__.state.lastEvent?.semanticOptions,
    resources: window.__AIEG_NARRATIVE_TEST__.view.resources,
    workCount: window.__AIEG_NARRATIVE_TEST__.state.workCount
  })`);
  check('checkpoint-repair', '確認修復會執行新的 A11 工作而非回報無適用內容', after.hasProcess && after.actionId === 'A11' && after.options?.mode === 'fix' && !after.message.includes('問題已解決或目前沒有適用內容'), JSON.stringify(after));
  check('checkpoint-repair', '新的修復照常扣 2 Token 與一個工作時間', preview.resources.token - after.resources.token === 2 && preview.resources.time - after.resources.time === 1 && after.workCount === preview.workCount + 1, JSON.stringify({ preview, after }));
  await new Promise((resolve) => setTimeout(resolve, 350));
  await shot(page, '06-checkpoint-repair-390');
  await page.click('[data-continue]');
  await page.waitFor('document.querySelector("[data-action=A11]")');
  await openAction(page, 'A11');
  const freshRetry = await page.eval(`({
    mode: document.querySelector('[data-option="mode"]')?.value,
    hasFreshRetry: Boolean(document.querySelector('[data-option-check="repairDraft"]')),
    freshRetryChecked: document.querySelector('[data-option-check="repairDraft"]')?.checked,
    before: window.__AIEG_NARRATIVE_TEST__.view.resources,
    workCount: window.__AIEG_NARRATIVE_TEST__.state.workCount
  })`);
  check('checkpoint-repair', '取樣失敗後仍提供未預選的付費新修復入口', freshRetry.mode === 'fix' && freshRetry.hasFreshRetry && freshRetry.freshRetryChecked === false, JSON.stringify(freshRetry));
  if (!(await page.eval('document.querySelector(".work-options")?.open'))) await page.click('.work-options summary');
  if (!freshRetry.freshRetryChecked) await page.click('[data-option-check="repairDraft"]');
  await page.waitFor('document.querySelector(\'[data-option-check="repairDraft"]\')?.checked && !document.querySelector("[data-confirm]").disabled');
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const retried = await page.eval(`({
    hasProcess: Boolean(document.querySelector('.process-story')),
    actionId: window.__AIEG_NARRATIVE_TEST__.state.lastEvent?.actionId,
    resources: window.__AIEG_NARRATIVE_TEST__.view.resources,
    workCount: window.__AIEG_NARRATIVE_TEST__.state.workCount
  })`);
  check('checkpoint-repair', '付費新修復建立另一筆 A11 工作，不被舊 cache 吞掉', retried.hasProcess && retried.actionId === 'A11' && freshRetry.before.token - retried.resources.token === 2 && retried.workCount === freshRetry.workCount + 1, JSON.stringify({ freshRetry, retried }));
  await page.click('[data-continue]');
}

async function deliveryParityRegression(page) {
  const formal = createNarrativeGame({ seed: 'browser-delivery-formal', templateId: 'balanced' });
  formal.requirement.clarity = 'clear'; formal.requirement.scope = 'bounded'; formal.requirement.pendingQuestions = [];
  formal.documents.draft = true; formal.documents.confirmed = true; formal.documents.wrongCompletionRule = false;
  formal.artifact = { ...formal.artifact, kind: 'implementation', revision: 7 };
  for (const id of Object.keys(formal.functionState)) {
    formal.functionState[id] = 'correct';
    formal.evidence[id] = { requirementId: id, artifactRevision: 7, result: 'pass' };
  }
  formal.knownIssues = [];

  const limited = structuredClone(formal);
  limited.evidence.R4.result = 'fail'; limited.evidence.R5.result = 'not_run';
  const showcase = createNarrativeGame({ seed: 'browser-delivery-showcase', templateId: 'balanced' });
  showcase.artifact.kind = 'prototype'; showcase.artifact.visualDetour = true;
  const progress = createNarrativeGame({ seed: 'browser-delivery-progress', templateId: 'balanced' });
  progress.timeLeft = 0;
  const stop = createNarrativeGame({ seed: 'browser-delivery-stop', templateId: 'balanced' });

  const cases = [
    [formal, 'formal', 'E01', '正式交付'],
    [limited, 'limited', 'E04', '有限試用'],
    [showcase, 'showcase', 'E05', '展示原型'],
    [progress, 'progress', 'E07', '進度交接'],
    [stop, 'stop', 'E08', '主動停止'],
  ];
  for (const [state, intent, expected, tier] of cases) {
    await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
    await page.waitFor('document.querySelector("[data-action=A12]")');
    await openAction(page, 'A12');
    const preview = await page.eval(`(() => { const option = document.querySelector('input[value="${intent}"]'); return { disabled: option.disabled, detail: option.closest('label').textContent }; })()`);
    check('delivery-parity', `${intent} 預覽允許時才可選，且說明對應該交付方式`, !preview.disabled, JSON.stringify(preview));
    await page.click(`input[value="${intent}"]`);
    await page.waitFor('!document.querySelector("[data-confirm]").disabled');
    await page.click('[data-confirm]');
    await page.waitFor('document.querySelector("[data-new]")');
    const ending = await page.eval('window.__AIEG_NARRATIVE_TEST__.view.ending.baseId');
    const endingText = await page.eval('document.querySelector("#app").textContent');
    check('delivery-parity', `${intent} 提交結果與預覽相同`, ending === expected, `${ending} != ${expected}`);
    check('ending-copy', `${intent} 結局明示主要交付層級`, endingText.includes(`主要結果：${tier}`), endingText);
  }

  const ordinaryPrototype = createNarrativeGame({ seed: 'browser-delivery-blocked-showcase', templateId: 'balanced' });
  ordinaryPrototype.artifact.kind = 'prototype';
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(ordinaryPrototype)})`);
  await page.waitFor('document.querySelector("[data-action=A12]")');
  await openAction(page, 'A12');
  const blocked = await page.eval(`(() => { const option = document.querySelector('input[value="showcase"]'); return { disabled: option.disabled, text: option.closest('label').textContent, confirmDisabled: document.querySelector('[data-confirm]').disabled }; })()`);
  check('delivery-parity', '一般未完成原型不再假裝可展示，也不誤寫正式交付 gate', blocked.disabled && blocked.confirmDisabled && blocked.text.includes('不是外觀偏題的展示原型') && !blocked.text.includes('正式交付'), JSON.stringify(blocked));
  await shot(page, '04-delivery-intent-parity');
  await page.click('[data-cancel]');
}

async function copyPolishBrowserRegression(page) {
  let state = createNarrativeGame({ seed: 'copy-polish-browser', templateId: 'balanced' });
  state = performAction(state, 'A05', { operationId: 'copy-preview-a05', stateVersion: state.stateVersion, designate: 'A05-A' }).state;
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-action=A07]")');
  await openAction(page, 'A07');
  await setSelect(page, 'target', 'core');
  let preview = await page.eval('document.querySelector(".result")?.textContent ?? ""');
  check('copy-polish', '實作預覽說出目前選取的核心範圍', preview.includes('新增、完成與刪除') && !preview.includes('只把保存做好'), preview);
  await setSelect(page, 'target', 'delete');
  preview = await page.eval('document.querySelector(".result")?.textContent ?? ""');
  check('copy-polish', '切換範圍後預覽同步更新成單筆刪除', preview.includes('這次選的是「單筆刪除」') && !preview.includes('這次選的是「新增、完成與刪除」'), preview);
  await page.click('[data-cancel]');

  state = createNarrativeGame({ seed: 'copy-polish-evidence', templateId: 'balanced' });
  state = performAction(state, 'A05', { operationId: 'copy-a05', stateVersion: state.stateVersion, designate: 'A05-A' }).state;
  state = performAction(state, 'A07', { operationId: 'copy-a07', stateVersion: state.stateVersion, designate: 'A07-C', target: 'delete', checkDelete: false }).state;
  state = performAction(state, 'A08', { operationId: 'copy-a08', stateVersion: state.stateVersion, designate: 'A08-A' }).state;
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector(".progress")');
  let text = await page.text();
  check('copy-polish', '側欄區分驗證異常與已診斷問題', text.includes('已確認問題與驗證異常') && text.includes('驗證已觀察到 3 項失敗') && !text.includes('目前沒有已知問題'), text);

  state = createNarrativeGame({ seed: 'recovery-ui-73', templateId: 'balanced' });
  state = performAction(state, 'A01', { operationId: 'copy-repeat-a01', stateVersion: state.stateVersion, designate: 'A01-A' }).state;
  state = performAction(state, 'A04', { operationId: 'copy-repeat-a04-1', stateVersion: state.stateVersion }).state;
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-action=A04]")');
  const beforeRetry = await page.eval('({ resources: window.__AIEG_NARRATIVE_TEST__.view.resources, workCount: window.__AIEG_NARRATIVE_TEST__.state.workCount, version: window.__AIEG_NARRATIVE_TEST__.state.stateVersion })');
  await openAction(page, 'A04');
  preview = await page.eval('document.querySelector(".result")?.textContent ?? ""');
  check('copy-polish', '付費重試預覽明示這是新的修正嘗試', preview.includes('新的付費嘗試') || preview.includes('新增一筆結果'), preview);
  await page.click('[data-confirm]');
  await page.waitFor('document.querySelector("[data-continue]")');
  const retry = await page.eval('({ text: document.querySelector(".process-story")?.textContent ?? "", summary: document.querySelector(".summary")?.textContent ?? "", state: window.__AIEG_NARRATIVE_TEST__.state, resources: window.__AIEG_NARRATIVE_TEST__.view.resources })');
  check('copy-polish', '再次失敗會說明是新嘗試而非舊結果重播', retry.text.includes('新的付費嘗試') && retry.text.includes('仍然沒有解決'), retry.text);
  check('copy-polish', '付費重試正常扣費並建立新狀態版本', retry.resources.token === beforeRetry.resources.token - 2 && retry.state.workCount === beforeRetry.workCount + 1 && retry.state.stateVersion === beforeRetry.version + 1, JSON.stringify({ beforeRetry, after: retry.resources, workCount: retry.state.workCount, version: retry.state.stateVersion }));
  check('copy-polish', '結果摘要不會在過程段落重複', retry.summary && !retry.text.includes(retry.summary), JSON.stringify({ text: retry.text, summary: retry.summary }));
  await page.click('[data-continue]');

  state = createNarrativeGame({ seed: 'copy-polish-tutorial', templateId: 'balanced' });
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-action=A12]")');
  await openAction(page, 'A12');
  await page.click('.tutorial summary');
  text = await page.eval('document.querySelector(".tutorial")?.textContent ?? ""');
  check('copy-polish', '交付教學完整列出五種實際選項', ['正式交付', '有限試用', '展示原型', '交接目前進度', '主動停止'].every((label) => text.includes(label)), text);
  await page.click('[data-cancel]');

  state = createNarrativeGame({ seed: 'copy-polish-ending', templateId: 'balanced' });
  state.token = 12;
  state.phase = 'ended';
  state.ending = composeEnding(state, 'E01');
  await page.eval(`window.__AIEG_NARRATIVE_TEST__.setState(${JSON.stringify(state)})`);
  await page.waitFor('document.querySelector("[data-new]")');
  text = await page.text();
  check('ending-copy', '資源後記不會遮住正式交付主結果', text.includes('主要結果：正式交付') && text.includes('Token 守財奴') && !text.includes('案件留下特別後記'), text);
  await shot(page, '05-copy-polish');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let server;
  let base = arg('--url');
  if (!base) {
    server = await startServer({ port: 0, quiet: true });
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  const browser = await launch({ executable: process.env.CHROME_PATH ?? EXECUTABLES[BROWSER], headed: HEADED });
  const meta = { browser: browser.version.Browser, executable: browser.executable, mode: HEADED ? 'headed' : 'headless', base, startedAt: new Date().toISOString() };
  console.log(`${LABEL}: ${meta.browser}; ${base}`);
  try {
    await normalUltimateRoute(browser.page, base);
    await beginnerContrast(browser.page, base);
    await reviewToggleRegression(browser.page);
    await documentRecoveryRegression(browser.page);
    await checkpointRepairRegression(browser.page);
    await deliveryParityRegression(browser.page);
    await copyPolishBrowserRegression(browser.page);
    const external = browser.page.requests.filter((url) => !url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && url !== 'about:blank');
    check('all', '所有瀏覽器請求維持本機', external.length === 0, external.join(', '));
    check('all', '沒有瀏覽器 JavaScript 錯誤', browser.page.errors.length === 0, browser.page.errors.join(' | '));
  } catch (error) {
    check('all', '瀏覽器流程完成', false, error.stack ?? error.message);
    await shot(browser.page, 'error').catch(() => {});
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  meta.finishedAt = new Date().toISOString();
  const failed = results.filter((result) => !result.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ meta, total: results.length, failed: failed.length, screenshots, results }, null, 2));
  console.log(`${LABEL}: ${results.length} checks, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
