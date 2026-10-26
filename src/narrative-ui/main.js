import { createNarrativeGame, chooseUpgrade, isActionResultCurrent, openingChoices, performAction, previewAction, readPreviousActionResult, rest } from '../narrative/engine.js';
import { actionOptionsForNewWork, projectNarrativeView } from '../narrative/view.js';
import { buildRunRecord, downloadRunRecord } from '../postgame/run-export.js';
import { renderCards, renderEnding, renderIntro, renderPlay, renderPreview, renderResult, renderUpgrade } from './render.js';

const root = document.querySelector('#app');
let seed = new URL(location.href).searchParams.get('seed') ?? crypto.randomUUID();
let setup = { templateId: 'balanced', draw: openingChoices(seed), selected: [] };
let state = null;
let screen = 'intro';
let selectedAction = null;
let actionOptions = {};
let lastResult = null;
let operation = 0;

function view() { return state ? projectNarrativeView(state) : null; }

function render() {
  const v = view();
  if (screen === 'intro') root.innerHTML = renderIntro(setup);
  else if (screen === 'cards') root.innerHTML = renderCards(setup);
  else if (v?.ending) root.innerHTML = renderEnding(v);
  else if (screen === 'upgrade' && v.pendingUpgrade) root.innerHTML = renderUpgrade(v);
  else if (screen === 'preview') root.innerHTML = renderPreview(v, selectedAction, actionOptions, previewAction(state, selectedAction, actionOptions));
  else if (screen === 'result') root.innerHTML = renderResult(v, lastResult);
  else root.innerHTML = renderPlay(v);
  if (screen === 'preview') {
    root.querySelectorAll('[data-option]').forEach((el) => { if (actionOptions[el.dataset.option] !== undefined) el.value = actionOptions[el.dataset.option]; });
    root.querySelectorAll('[data-option-check]').forEach((el) => { el.checked = Boolean(actionOptions[el.dataset.optionCheck]); });
  }
  const result = root.querySelector('.result');
  if (result) {
    result.scrollIntoView({ block: 'start' });
    result.focus({ preventScroll: true });
  }
}

function nextOperation() { operation += 1; return `ui-${operation}`; }

function start() {
  state = createNarrativeGame({ seed, templateId: setup.templateId, selectedCards: setup.selected });
  screen = 'play'; render();
}

root.addEventListener('click', (e) => {
  const template = e.target.closest('[data-template]');
  if (template) {
    setup.templateId = template.dataset.template; render(); return;
  }
  if (e.target.closest('[data-next="cards"]')) { screen = 'cards'; render(); return; }
  if (e.target.closest('[data-back="intro"]')) { screen = 'intro'; render(); return; }
  const cardInput = e.target.closest('[data-card]');
  if (cardInput) {
    const id = cardInput.dataset.card;
    setup.selected = [id];
    render(); return;
  }
  if (e.target.closest('[data-start]')) { start(); return; }
  const previousResult = e.target.closest('[data-view-result]');
  if (previousResult) {
    const actionId = previousResult.dataset.viewResult;
    const saved = readPreviousActionResult(state, actionId);
    if (saved) {
      lastResult = { ...saved, historical: true, currentlyValid: isActionResultCurrent(state, actionId) };
      screen = 'result';
      render();
    }
    return;
  }
  const action = e.target.closest('[data-action]');
  if (action) {
    selectedAction = action.dataset.action;
    actionOptions = actionOptionsForNewWork(state, selectedAction);
    if (selectedAction === 'A04' && state.documents.wrongCompletionRule) actionOptions.repairDraft = true;
    screen = 'preview'; render(); return;
  }
  if (e.target.closest('[data-cancel]')) { screen = 'play'; render(); return; }
  const confirm = e.target.closest('[data-confirm]');
  if (confirm) {
    if (selectedAction === 'A12') {
      const picked = root.querySelector('input[name="intent"]:checked');
      if (!picked) return;
      actionOptions.intent = picked.value;
    }
    root.querySelectorAll('[data-option]').forEach((el) => { actionOptions[el.dataset.option] = el.value; });
    root.querySelectorAll('[data-option-check]').forEach((el) => { actionOptions[el.dataset.optionCheck] = el.checked; });
    try {
      const out = performAction(state, selectedAction, { ...actionOptions, operationId: nextOperation(), stateVersion: state.stateVersion });
      state = out.state; lastResult = { ...out.result, cached: out.cached }; screen = state.ending ? 'ending' : 'result';
    } catch (err) { lastResult = { type: 'gap', message: err.message }; screen = 'result'; }
    render(); return;
  }
  if (e.target.closest('[data-rest]')) {
    try { const out = rest(state, { operationId: nextOperation(), stateVersion: state.stateVersion }); state = out.state; lastResult = out.result; }
    catch (err) { lastResult = { type: 'gap', message: err.message }; }
    screen = 'result'; render(); return;
  }
  if (e.target.closest('[data-continue]')) { screen = view().pendingUpgrade ? 'upgrade' : 'play'; render(); return; }
  const upgrade = e.target.closest('[data-upgrade]');
  if (upgrade) { state = chooseUpgrade(state, upgrade.dataset.upgrade); screen = view().pendingUpgrade ? 'upgrade' : 'play'; render(); return; }
  if (e.target.closest('[data-export-run]')) {
    try {
      const record = buildRunRecord(state);
      const download = downloadRunRecord(record);
      const status = root.querySelector('[data-export-status]');
      if (status) status.textContent = `已下載 ${download.fileName}（${download.bytes} bytes）。請把檔案放進專案 runs 資料夾，MCP 教練才看得到。`;
    } catch (error) {
      const status = root.querySelector('[data-export-status]');
      if (status) status.textContent = `匯出失敗：${error.message}`;
    }
    return;
  }
  if (e.target.closest('[data-new]')) {
    seed = crypto.randomUUID(); setup = { templateId: 'balanced', draw: openingChoices(seed), selected: [] };
    state = null; screen = 'intro'; selectedAction = null; actionOptions = {}; operation = 0; render();
  }
});

root.addEventListener('change', (e) => {
  if (e.target.matches('input[name="intent"]')) { actionOptions.intent = e.target.value; render(); }
  else if (e.target.matches('[data-option]')) { actionOptions[e.target.dataset.option] = e.target.value; render(); }
  else if (e.target.matches('[data-option-check]')) { actionOptions[e.target.dataset.optionCheck] = e.target.checked; render(); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && screen === 'preview') { screen = 'play'; render(); }
});

window.addEventListener('beforeunload', (e) => {
  if (state?.phase === 'playing') { e.preventDefault(); e.returnValue = ''; }
});

window.__AIEG_NARRATIVE_TEST__ = {
  get state() { return structuredClone(state); },
  get view() { return state ? projectNarrativeView(state) : null; },
  exportRunRecord() { return state ? buildRunRecord(state) : null; },
  setState(next) { state = structuredClone(next); screen = 'play'; render(); },
};

render();
