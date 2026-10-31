import { loadCareer, reserveRun, saveActiveRun, saveCareer, settleCase } from '../career/state-v2.js';
import { buildCareerCaseRunRecord } from '../postgame/career-run-export.js';
import { createCoachSession } from '../postgame/coach-ui.js';
import { captureActiveControl, focusChangedScreen } from '../presentation/screen-transition.js';
import { chooseCase04Reward, createCase04Game, performCase04Action } from './engine.js';
import { renderCase04Board, renderCase04Ending, renderCase04Error, renderCase04Intro, renderCase04Preview, renderCase04Result, renderCase04Reward } from './render.js';

const root = document.querySelector('#app');
const load = new URL(location.href).searchParams.get('mode') === 'career' ? loadCareer() : { status:'invalid', reason:'案件 04 必須從接案大廳開始' };
let career = load.status === 'ready' ? load.career : null; let state = null; let screen = career ? 'intro' : 'error'; let actionId = null; let options = {}; let output = null; let message = ''; let sequence = 0; let settlement = null;
const coach = createCoachSession({ buildRecord: buildCareerCaseRunRecord, getState:() => state, onChange:() => render() });
if (career?.activeRun?.caseId === 'case-04') { state = { ...structuredClone(career.activeRun.state), runId:career.activeRun.runId }; sequence = Object.keys(state.operationResults ?? {}).length; screen = state.phase === 'ended' ? 'ending' : state.pendingReward ? 'reward' : 'board'; }
else if (career?.activeRun) { screen = 'error'; load.reason = `已有 ${career.activeRun.caseId} 進行中的案件；請先回到該案件。`; }
let renderedScreen = screen;
function persist() { if (state?.runId && state.phase !== 'ended') career = saveCareer(saveActiveRun(career, state.runId, state)); }
function render() {
  const screenChanged = screen !== renderedScreen;
  const restoreControl = captureActiveControl(root, screenChanged);
  if (screen === 'error') root.innerHTML = renderCase04Error(load.reason);
  else if (screen === 'intro') root.innerHTML = renderCase04Intro(career);
  else if (screen === 'preview') root.innerHTML = renderCase04Preview(state, actionId, options);
  else if (screen === 'result') root.innerHTML = renderCase04Result(state, output);
  else if (screen === 'reward') root.innerHTML = renderCase04Reward(state);
  else if (screen === 'ending') {
    if (!settlement) { settlement = settleCase(career, state); career = saveCareer(settlement.career); }
    root.innerHTML = renderCase04Ending(state, settlement, coach.view);
  } else root.innerHTML = renderCase04Board(state, message);
  focusChangedScreen(root, screenChanged);
  if (!screenChanged) restoreControl?.();
  renderedScreen = screen;
}
root.addEventListener('click', async (event) => {
  if (event.target.closest('[data-analyze-run]')) { await coach.analyze(false); return; } if (event.target.closest('[data-reanalyze-run]')) { await coach.analyze(true); return; } if (event.target.closest('[data-cancel-analysis]')) { await coach.cancel(); return; } if (event.target.closest('[data-save-run]')) { await coach.save(); return; }
  if (event.target.closest('[data-start-case]')) { const initialState = createCase04Game({ templateId:career.templateId, cards:career.cards, equipped:career.loadoutsByCase['case-04'], rewardLedger:career.rewardLedger }); const reserved = reserveRun(career,{ caseId:'case-04', rulesVersion:initialState.ruleVersion, initialState }); career = reserved.career; state = { ...initialState, runId:reserved.activeRun.runId }; career = saveCareer(saveActiveRun(career,state.runId,state)); screen='board'; render(); return; }
  const action = event.target.closest('[data-case04-action]'); if (action) { actionId=action.dataset.case04Action; options={}; screen='preview'; render(); return; }
  if (event.target.closest('[data-case04-cancel]')) { screen='board'; options={}; render(); return; }
  if (event.target.closest('[data-case04-confirm]')) { try { const result=performCase04Action(state,actionId,{...options,operationId:`case04-ui-${++sequence}`,stateVersion:state.stateVersion}); state=result.state; persist(); output=result.result; message=''; screen=state.phase==='ended'?'ending':'result'; } catch(error){message=error.message;screen='board';} render(); return; }
  if (event.target.closest('[data-case04-continue]')) { screen=state.pendingReward?'reward':'board';render();return; }
  const reward=event.target.closest('[data-case04-reward]'); if(reward){try{const result=chooseCase04Reward(state,reward.dataset.case04Reward);state=result.state;persist();message='成長獎勵已記入本局，結算後永久保留。';}catch(error){message=error.message;}screen='board';render();}
});
root.addEventListener('change',(event)=>{if(event.target.matches('input[type="radio"]'))options[event.target.name]=event.target.value;if(screen==='preview')render();});
document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&screen==='preview'){screen='board';options={};render();}}); window.addEventListener('beforeunload',(event)=>{if(state?.phase==='playing'){event.preventDefault();event.returnValue='';}});
window.__AIEG_CASE04_TEST__={get state(){return state?structuredClone(state):null;},setState(next){state=structuredClone(next);screen=state.phase==='ended'?'ending':state.pendingReward?'reward':'board';settlement=null;render();},get screen(){return screen;},exportRunRecord(){return state?buildCareerCaseRunRecord(state):null;}};
render(); coach.discover();
