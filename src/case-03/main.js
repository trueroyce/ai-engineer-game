import { loadCareer, saveCareer, settleCase } from '../career/state.js';
import { chooseCase03Reward, createCase03Game, performCase03Action } from './engine.js';
import { renderCase03Board, renderCase03Ending, renderCase03Error, renderCase03Intro, renderCase03Preview, renderCase03Result, renderCase03Reward } from './render.js';

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

function render() {
  if (screen === 'error') root.innerHTML = renderCase03Error(load.reason ?? '職涯存檔不可用');
  else if (screen === 'intro') root.innerHTML = renderCase03Intro(career);
  else if (screen === 'preview') root.innerHTML = renderCase03Preview(state, actionId, options);
  else if (screen === 'result') root.innerHTML = renderCase03Result(state, result);
  else if (screen === 'reward') root.innerHTML = renderCase03Reward(state);
  else if (screen === 'ending') {
    if (!settlement) { settlement = settleCase(career, state); career = saveCareer(settlement.career); }
    root.innerHTML = renderCase03Ending(state, settlement);
  } else root.innerHTML = renderCase03Board(state, message);
  root.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
}

root.addEventListener('click', (event) => {
  if (event.target.closest('[data-start-case]')) {
    state = createCase03Game({ templateId: career.templateId, cards: career.cards, equipped: career.equipped, rewardLedger: career.rewardLedger });
    screen = 'board'; render(); return;
  }
  const action = event.target.closest('[data-case03-action]');
  if (action) { actionId = action.dataset.case03Action; options = {}; screen = 'preview'; render(); return; }
  if (event.target.closest('[data-case03-cancel]')) { actionId = null; options = {}; screen = 'board'; render(); return; }
  if (event.target.closest('[data-case03-confirm]')) {
    try {
      const output = performCase03Action(state, actionId, { ...options, operationId: `case03-ui-${++sequence}`, stateVersion: state.stateVersion });
      state = output.state; result = output.result; message = ''; screen = state.phase === 'ended' ? 'ending' : 'result';
    } catch (error) { message = error.message; screen = 'board'; }
    render(); return;
  }
  if (event.target.closest('[data-case03-continue]')) { screen = state.pendingReward ? 'reward' : 'board'; render(); return; }
  const reward = event.target.closest('[data-case03-reward]');
  if (reward) {
    try { const output = chooseCase03Reward(state, reward.dataset.case03Reward); state = output.state; message = `${output.reward.cardId} 已${output.reward.disposition === 'fused' ? '融合' : '收藏'}；啟用上限仍為三張。`; }
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
window.__AIEG_CASE03_TEST__ = { get state() { return state ? structuredClone(state) : null; }, setState(next) { state = structuredClone(next); screen = state.phase === 'ended' ? 'ending' : state.pendingReward ? 'reward' : 'board'; settlement = null; render(); }, get screen() { return screen; } };
render();
