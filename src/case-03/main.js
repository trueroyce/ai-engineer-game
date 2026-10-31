import { loadCareer, reserveRun, saveActiveRun, saveCareer, settleCase } from '../career/state-v2.js';
import { buildCareerCaseRunRecord } from '../postgame/career-run-export.js';
import { createCoachSession } from '../postgame/coach-ui.js';
import { captureActiveControl, focusChangedScreen } from '../presentation/screen-transition.js';
import { chooseCase03Reward, createCase03Game, performCase03Action } from './engine.js';
import { renderCase03Board, renderCase03Ending, renderCase03Error, renderCase03Intro, renderCase03Preview, renderCase03Result, renderCase03Reward } from './render-v2.js';

const root = document.querySelector('#app');
const load = new URL(location.href).searchParams.get('mode') === 'career' ? loadCareer() : { status: 'invalid', reason: '案件 03 必須從接案大廳開始' };
let career = load.status === 'ready' ? load.career : null;
let state = null;
let screen = career ? 'intro' : 'error';
let actionId = null;
let options = {};
let result = null;
let message = '';
let sequence = 0;
let settlement = null;
const coach = createCoachSession({
  buildRecord: buildCareerCaseRunRecord,
  getState: () => state,
  onChange: () => render(),
});

if (career?.activeRun?.caseId === 'case-03') {
  state = { ...structuredClone(career.activeRun.state), runId: career.activeRun.runId };
  sequence = Object.keys(state.operationResults ?? {}).length;
  screen = state.phase === 'ended' ? 'ending' : state.pendingReward ? 'reward' : 'board';
} else if (career?.activeRun) {
  screen = 'error';
  load.reason = `已有 ${career.activeRun.caseId} 進行中的案件；請先回到該案件。`;
}
let renderedScreen = screen;

function persistActive() {
  if (!state?.runId || state.phase === 'ended') return;
  career = saveCareer(saveActiveRun(career, state.runId, state));
}

function render() {
  const screenChanged = screen !== renderedScreen;
  const restoreControl = captureActiveControl(root, screenChanged);
  if (screen === 'error') root.innerHTML = renderCase03Error(load.reason ?? '職涯存檔不可用');
  else if (screen === 'intro') root.innerHTML = renderCase03Intro(career);
  else if (screen === 'preview') root.innerHTML = renderCase03Preview(state, actionId, options);
  else if (screen === 'result') root.innerHTML = renderCase03Result(state, result);
  else if (screen === 'reward') root.innerHTML = renderCase03Reward(state);
  else if (screen === 'ending') {
    if (!settlement) { settlement = settleCase(career, state); career = saveCareer(settlement.career); }
    root.innerHTML = renderCase03Ending(state, settlement, coach.view);
  } else root.innerHTML = renderCase03Board(state, message);
  focusChangedScreen(root, screenChanged);
  if (!screenChanged) restoreControl?.();
  renderedScreen = screen;
}

root.addEventListener('click', async (event) => {
  if (event.target.closest('[data-analyze-run]')) { await coach.analyze(false); return; }
  if (event.target.closest('[data-reanalyze-run]')) { await coach.analyze(true); return; }
  if (event.target.closest('[data-cancel-analysis]')) { await coach.cancel(); return; }
  if (event.target.closest('[data-save-run]')) { await coach.save(); return; }
  if (event.target.closest('[data-start-case]')) {
    const initialState = createCase03Game({ templateId: career.templateId, cards: career.cards, equipped: career.loadoutsByCase['case-03'], rewardLedger: career.rewardLedger, progressionV2: true });
    const reserved = reserveRun(career, { caseId: 'case-03', rulesVersion: initialState.ruleVersion, initialState });
    career = reserved.career;
    state = { ...initialState, runId: reserved.activeRun.runId };
    career = saveCareer(saveActiveRun(career, state.runId, state));
    screen = 'board'; render(); return;
  }
  const action = event.target.closest('[data-case03-action]');
  if (action) { actionId = action.dataset.case03Action; options = {}; screen = 'preview'; render(); return; }
  if (event.target.closest('[data-case03-cancel]')) { actionId = null; options = {}; screen = 'board'; render(); return; }
  if (event.target.closest('[data-case03-confirm]')) {
    try {
      const output = performCase03Action(state, actionId, { ...options, operationId: `case03-ui-${++sequence}`, stateVersion: state.stateVersion });
      state = output.state; persistActive(); result = output.result; message = ''; screen = state.phase === 'ended' ? 'ending' : 'result';
    } catch (error) { message = error.message; screen = 'board'; }
    render(); return;
  }
  if (event.target.closest('[data-case03-continue]')) { screen = state.pendingReward ? 'reward' : 'board'; render(); return; }
  const reward = event.target.closest('[data-case03-reward]');
  if (reward) {
    try { const output = chooseCase03Reward(state, reward.dataset.case03Reward); state = output.state; persistActive(); message = output.reward.kind === 'card' ? `${output.reward.cardId} 已${output.reward.disposition === 'fused' ? '融合' : '收藏'}；啟用上限仍為三張。` : `${output.reward.title} 已存入職涯，結算時才會永久套用。`; }
    catch (error) { message = error.message; }
    screen = 'board'; render();
  }
});

root.addEventListener('change', (event) => {
  if (event.target.matches('input[type="radio"]')) options[event.target.name] = event.target.value;
  if (screen === 'preview') render();
});

document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && screen === 'preview') { screen = 'board'; actionId = null; options = {}; render(); } });
window.addEventListener('beforeunload', (event) => { if (state?.phase === 'playing') { event.preventDefault(); event.returnValue = ''; } });
window.__AIEG_CASE03_TEST__ = { get state() { return state ? structuredClone(state) : null; }, setState(next) { state = structuredClone(next); screen = state.phase === 'ended' ? 'ending' : state.pendingReward ? 'reward' : 'board'; settlement = null; render(); }, get screen() { return screen; }, exportRunRecord() { return state ? buildCareerCaseRunRecord(state) : null; } };
render();
coach.discover();
