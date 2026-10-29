import { loadCareer, reserveRun, saveActiveRun, saveCareer, settleCase } from '../career/state-v2.js';
import { buildCareerCaseRunRecord } from '../postgame/career-run-export.js';
import { createCoachSession } from '../postgame/coach-ui.js';
import { chooseCase02Reward, createCase02Game, performCase02Action } from './engine-v2.js';
import {
  renderCase02Board,
  renderCase02Ending,
  renderCase02Error,
  renderCase02Intro,
  renderCase02Preview,
  renderCase02Result,
  renderCase02Reward,
} from './render-v2.js';

const root = document.querySelector('#app');
const params = new URL(location.href).searchParams;
const careerLoad = params.get('mode') === 'career' ? loadCareer() : { status: 'invalid', reason: '案件 02 需要從接案大廳開始' };
let career = careerLoad.status === 'ready' ? careerLoad.career : null;
let state = null;
let screen = career ? 'intro' : 'error';
let selectedAction = null;
let options = {};
let lastResult = null;
let message = '';
let operation = 0;
let settlement = null;
const coach = createCoachSession({
  buildRecord: buildCareerCaseRunRecord,
  getState: () => state,
  onChange: () => render(),
});

if (career?.activeRun?.caseId === 'case-02') {
  state = { ...structuredClone(career.activeRun.state), runId: career.activeRun.runId };
  operation = Object.keys(state.operationResults ?? {}).length;
  screen = state.phase === 'ended' ? 'ending' : state.pendingReward ? 'reward' : 'board';
} else if (career?.activeRun) {
  screen = 'error';
  careerLoad.reason = `已有 ${career.activeRun.caseId} 進行中的案件；請先回到該案件。`;
}

function persistActive() {
  if (!state?.runId || state.phase === 'ended') return;
  career = saveCareer(saveActiveRun(career, state.runId, state));
}

function defaults(actionId) {
  if (actionId === 'B01') return { idPolicy: '', datePolicy: '', duplicatePolicy: '' };
  if (actionId === 'B02') return { strategy: '', useRapid: false };
  if (actionId === 'B03') return { useFastMerge: false };
  if (actionId === 'B04') return { response: '' };
  if (actionId === 'B05') return { mode: '' };
  if (actionId === 'B06') return { scope: '' };
  if (actionId === 'B09') return { intent: '' };
  if (['B10', 'B11', 'B12'].includes(actionId)) return { route: '' };
  return {};
}

function render() {
  if (screen === 'error') root.innerHTML = renderCase02Error(careerLoad.reason ?? '職涯存檔不可用');
  else if (screen === 'intro') root.innerHTML = renderCase02Intro(career);
  else if (screen === 'preview') root.innerHTML = renderCase02Preview(state, selectedAction, options);
  else if (screen === 'result') root.innerHTML = renderCase02Result(state, lastResult);
  else if (screen === 'reward') root.innerHTML = renderCase02Reward(state);
  else if (screen === 'ending') {
    if (!settlement) {
      settlement = settleCase(career, state);
      career = saveCareer(settlement.career);
    }
    root.innerHTML = renderCase02Ending(state, settlement, coach.view);
  } else root.innerHTML = renderCase02Board(state, message);
  root.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
}

function nextOperation() {
  operation += 1;
  return `case02-ui-${operation}`;
}

root.addEventListener('click', async (event) => {
  if (event.target.closest('[data-analyze-run]')) { await coach.analyze(false); return; }
  if (event.target.closest('[data-reanalyze-run]')) { await coach.analyze(true); return; }
  if (event.target.closest('[data-cancel-analysis]')) { await coach.cancel(); return; }
  if (event.target.closest('[data-save-run]')) { await coach.save(); return; }
  if (event.target.closest('[data-start-case]')) {
    const initialState = createCase02Game({
      templateId: career.templateId,
      cards: career.cards,
      equipped: career.loadoutsByCase['case-02'],
      rewardLedger: career.rewardLedger,
      progressionV2: true,
    });
    const reserved = reserveRun(career, { caseId: 'case-02', rulesVersion: initialState.ruleVersion, initialState });
    career = reserved.career;
    state = { ...initialState, runId: reserved.activeRun.runId };
    career = saveCareer(saveActiveRun(career, state.runId, state));
    screen = 'board';
    render();
    return;
  }
  const action = event.target.closest('[data-case02-action]');
  if (action) {
    selectedAction = action.dataset.case02Action;
    options = defaults(selectedAction);
    screen = 'preview';
    render();
    return;
  }
  if (event.target.closest('[data-case02-cancel]')) {
    screen = 'board';
    selectedAction = null;
    options = {};
    render();
    return;
  }
  if (event.target.closest('[data-case02-confirm]')) {
    try {
      const output = performCase02Action(state, selectedAction, {
        ...options,
        operationId: nextOperation(),
        stateVersion: state.stateVersion,
      });
      state = output.state;
      persistActive();
      lastResult = output.result;
      message = '';
      screen = state.phase === 'ended' ? 'ending' : 'result';
    } catch (error) {
      message = error.message;
      screen = 'board';
    }
    render();
    return;
  }
  if (event.target.closest('[data-case02-continue]')) {
    screen = state.pendingReward ? 'reward' : 'board';
    render();
    return;
  }
  const reward = event.target.closest('[data-case02-reward]');
  if (reward) {
    try {
      const output = chooseCase02Reward(state, reward.dataset.case02Reward);
      state = output.state;
      persistActive();
      message = output.reward.kind !== 'card'
        ? `${output.reward.title} 已存入職涯，結算時才會永久套用。`
        : output.reward.disposition === 'collected'
          ? `${output.reward.cardId} 已收藏；三張裝備保持不變。`
        : output.reward.disposition === 'fused'
          ? `${output.reward.cardId} 已融合為 Lv.${output.reward.level}。`
          : `${output.reward.cardId} 已收藏並裝備。`;
      screen = 'board';
    } catch (error) {
      message = error.message;
      screen = 'board';
    }
    render();
  }
});

root.addEventListener('change', (event) => {
  const select = event.target.closest('[data-case02-option]');
  if (select) options[select.dataset.case02Option] = select.value;
  const check = event.target.closest('[data-case02-check]');
  if (check) options[check.dataset.case02Check] = check.checked;
  if (event.target.matches('input[type="radio"]')) options[event.target.name] = event.target.value;
  if (screen === 'preview') render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && screen === 'preview') {
    screen = 'board';
    selectedAction = null;
    options = {};
    render();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (state?.phase === 'playing') {
    event.preventDefault();
    event.returnValue = '';
  }
});

window.__AIEG_CASE02_TEST__ = {
  get state() { return state ? structuredClone(state) : null; },
  setState(next) { state = structuredClone(next); screen = state.phase === 'ended' ? 'ending' : state.pendingReward ? 'reward' : 'board'; settlement = null; render(); },
  get screen() { return screen; },
  exportRunRecord() { return state ? buildCareerCaseRunRecord(state) : null; },
};

render();
coach.discover();
