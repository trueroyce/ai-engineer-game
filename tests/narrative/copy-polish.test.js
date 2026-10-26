import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTION_SCENES, EVENT_COPY } from '../../src/narrative/narrative-copy.js';
import { composeEnding, createNarrativeGame, performAction, readPreviousActionResult } from '../../src/narrative/engine.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { renderEnding, renderPlay, renderPreview, renderResult } from '../../src/narrative-ui/render.js';

let serial = 0;
function act(state, actionId, options = {}) {
  return performAction(state, actionId, {
    ...options,
    operationId: `copy-${++serial}`,
    stateVersion: state.stateVersion,
  });
}

test('generated A06/A10 copy contains player prose, not author conditional scaffolding', () => {
  assert.doesNotMatch(EVENT_COPY['A06-A'].story, /保存尚未完成時|保存已可正常|顯示時只選/);
  assert.doesNotMatch(EVENT_COPY['A10-A'].story, /若曾出現|否則|顯示時只選/);
  assert.match(ACTION_SCENES.A12.transcript, /正式交付/);
  assert.match(ACTION_SCENES.A12.transcript, /有限試用/);
  assert.match(ACTION_SCENES.A12.transcript, /展示原型/);
  assert.match(ACTION_SCENES.A12.transcript, /交接目前進度/);
  assert.match(ACTION_SCENES.A12.transcript, /主動停止/);
});

test('A06-A describes only the persistence behavior actually observed', () => {
  let missing = createNarrativeGame({ seed: 'copy-a06-missing' });
  missing.artifact.kind = 'prototype';
  const missingResult = act(missing, 'A06', { designate: 'A06-A' }).result;
  assert.match(missingResult.process.response, /重新開啟後清單是空的/);
  assert.doesNotMatch(missingResult.process.response, /資料還在/);

  let ready = createNarrativeGame({ seed: 'copy-a06-ready' });
  ready.artifact.kind = 'implementation';
  ready.functionState.R4 = 'correct'; ready.functionState.R5 = 'correct';
  const readyResult = act(ready, 'A06', { designate: 'A06-A' }).result;
  assert.match(readyResult.process.response, /重新開啟後資料還在/);
  assert.doesNotMatch(readyResult.process.response, /清單是空的/);
});

test('A11 process names the public issue actually attempted and marks a repeated paid failure as new', () => {
  let state = createNarrativeGame({ seed: 'repeat-0', templateId: 'beginner' });
  state = act(state, 'A05', { designate: 'A05-B' }).state;
  const knownText = state.knownIssues.find((issue) => issue.status !== 'fixed').text;
  const first = act(state, 'A11', { mode: 'fix' });
  assert.equal(first.result.event.id, 'A11-B');
  assert.match(first.result.process.player, new RegExp(knownText));
  assert.match(first.result.process.response, /仍未解決|新增了另一個已確認問題/);

  const second = act(first.state, 'A11', { mode: 'fix', repairDraft: true });
  assert.equal(second.result.event.id, 'A11-B');
  assert.match(second.result.process.followUp, /新的付費嘗試/);
  assert.match(second.result.process.followUp, /仍然失敗/);
  assert.deepEqual(readPreviousActionResult(second.state, 'A11').process, second.result.process);
});

test('progress panel distinguishes observed verification failure from diagnosed open issue', () => {
  let state = createNarrativeGame({ seed: 'copy-observed-failure' });
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  state = act(state, 'A07', { designate: 'A07-C', target: 'delete', checkDelete: false }).state;
  state = act(state, 'A08', { designate: 'A08-A' }).state;
  const view = projectNarrativeView(state);
  assert.equal(view.knownIssues.length, 0);
  assert.match(view.progress.issueSummary, /驗證已觀察到 3 項失敗/);
  assert.match(renderPlay(view), /已確認問題與驗證異常/);
  assert.doesNotMatch(renderPlay(view), /目前沒有已知問題/);
});

test('sidebar distinguishes viewable work from E05 showcase-ending eligibility', () => {
  const ordinary = createNarrativeGame({ seed: 'copy-showcase-status' });
  ordinary.artifact.kind = 'prototype';
  assert.match(projectNarrativeView(ordinary).progress.delivery.showcase, /可查看目前成果/);
  assert.match(projectNarrativeView(ordinary).progress.delivery.showcase, /不能選「展示原型」結案/);

  ordinary.artifact.visualDetour = true;
  assert.match(projectNarrativeView(ordinary).progress.delivery.showcase, /可選「展示原型」結案/);
});

test('A07 preview names the selected scope and does not hard-code persistence', () => {
  const state = createNarrativeGame({ seed: 'copy-a07-preview' });
  const view = projectNarrativeView(state);
  const core = renderPreview(view, 'A07', { target: 'core' });
  const deletion = renderPreview(view, 'A07', { target: 'delete' });
  assert.match(core, /這次選的是「新增、完成與刪除」/);
  assert.match(deletion, /這次選的是「單筆刪除」/);
  assert.doesNotMatch(core, /只把保存做好/);
  assert.doesNotMatch(deletion, /只把保存做好/);
});

test('result renders one concise summary instead of repeating it inside the consequence', () => {
  const state = createNarrativeGame({ seed: 'copy-summary-once' });
  const out = act(state, 'A01', { designate: 'A01-A' });
  assert.equal(out.result.process.consequence.includes(out.result.event.summary), false);
  const html = renderResult(projectNarrativeView(out.state), out.result);
  assert.equal(html.split(out.result.event.summary).length - 1, 1);
});

test('ending always names the primary outcome tier and maps actual facet IDs', () => {
  const cases = [
    ['E01', '正式交付'], ['E04', '有限試用'], ['E05', '展示原型'],
    ['E07', '進度交接'], ['E08', '主動停止'],
  ];
  for (const [baseId, label] of cases) {
    const state = createNarrativeGame({ seed: `copy-ending-${baseId}` });
    state.token = 12; state.stress = 9; state.repairHistory = true;
    state.ending = composeEnding(state, baseId); state.phase = 'ended';
    const html = renderEnding(projectNarrativeView(state));
    assert.match(html, new RegExp(`主要結果：${label}`));
    assert.doesNotMatch(html, /本案留下特別記號/);
  }
  const rich = createNarrativeGame({ seed: 'copy-ending-rich' });
  rich.token = 12; rich.ending = composeEnding(rich, 'E01'); rich.phase = 'ended';
  assert.match(renderEnding(projectNarrativeView(rich)), /Token 守財奴/);
});

test('A11-A reports every public issue actually closed by the batch repair', () => {
  const state = createNarrativeGame({ seed: 'copy-a11-batch' });
  state.artifact.kind = 'implementation';
  state.artifact.revision = 2;
  state.functionState.R1 = 'defective';
  state.functionState.R3 = 'defective';
  state.knownIssues = [
    { code: 'ui-not-updating', text: '畫面沒有顯示新增項目', requirements: ['R1'], status: 'known', introducedAt: 2 },
    { code: 'duplicate-delete', text: '刪除一條可能誤刪另一條', requirements: ['R3'], status: 'known', introducedAt: 2 },
  ];
  const beforeView = projectNarrativeView(state);
  const preview = renderPreview(beforeView, 'A11', { mode: 'fix' });
  assert.match(preview, /優先處理/);
  assert.match(preview, /2 個公開問題/);

  const out = act(state, 'A11', { mode: 'fix', designate: 'A11-A' });
  assert.equal(out.state.knownIssues.filter((issue) => issue.status !== 'fixed').length, 0);
  assert.match(out.result.process.response, /畫面沒有顯示新增項目/);
  assert.match(out.result.process.response, /刪除一條可能誤刪另一條/);
  assert.match(out.result.process.response, /2 個/);
  assert.doesNotMatch(out.result.process.response, /沒有憑空宣布其他範圍也通過/);
});

test('A11-A separates public issue closure from new evidence for a latent repaired defect', () => {
  const state = createNarrativeGame({ seed: 'copy-a11-latent' });
  state.artifact.kind = 'implementation';
  state.artifact.revision = 3;
  state.functionState.R1 = 'defective';
  state.functionState.R3 = 'defective';
  state.knownIssues = [
    { code: 'ui-not-updating', text: '畫面沒有顯示新增項目', requirements: ['R1'], status: 'known', introducedAt: 3 },
  ];

  const out = act(state, 'A11', { mode: 'fix', designate: 'A11-A' });
  assert.match(out.result.process.response, /實際關閉 1 個公開問題/);
  assert.match(out.result.process.response, /畫面沒有顯示新增項目/);
  assert.equal(out.state.evidence.R1.result, 'pass');
  assert.equal(out.state.evidence.R3.result, 'pass');
  assert.match(out.result.process.followUp, /保留這次新產生的現行通過證據/);
  assert.match(out.result.process.followUp, /不會被倒推成先前已知缺陷/);
  assert.doesNotMatch(out.result.process.followUp, /未列入清單的功能不會被順手宣稱通過/);
});

test('A06-A says the observed answer invalidates prior acceptance evidence', () => {
  const state = createNarrativeGame({ seed: 'copy-a06-invalidation' });
  state.artifact.kind = 'implementation';
  state.artifact.revision = 4;
  for (const id of Object.keys(state.functionState)) {
    state.functionState[id] = 'correct';
    state.evidence[id] = { requirementId: id, artifactRevision: 4, result: 'pass' };
  }
  const out = act(state, 'A06', { designate: 'A06-A' });
  assert.ok(Object.values(out.state.evidence).every((item) => item.result === 'not_run'));
  assert.match(out.result.process.followUp, /驗收證據仍標待重驗/);
  assert.doesNotMatch(out.result.process.followUp, /寫回需求與證據/);
});

test('a repeated paid A10-B revision identifies the new failed attempt', () => {
  const state = createNarrativeGame({ seed: 'copy-a10-retry' });
  state.context.jobsSinceSummary = 3;
  const first = act(state, 'A10', { designate: 'A10-B' });
  const second = act(first.state, 'A10', { designate: 'A10-B', repairDraft: true });
  assert.notEqual(second.result.cached, true);
  assert.equal(second.result.event.id, 'A10-B');
  assert.match(second.result.process.followUp, /新的付費嘗試/);
  assert.match(second.result.process.followUp, /仍然沒有解決/);
  assert.deepEqual(readPreviousActionResult(second.state, 'A10').process, second.result.process);
});
