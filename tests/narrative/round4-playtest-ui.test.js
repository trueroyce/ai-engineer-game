import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableActions,
  createNarrativeGame,
  performAction,
  previewAction,
  readPreviousActionResult,
} from '../../src/narrative/engine.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { renderPlay, renderPreview, renderResult } from '../../src/narrative-ui/render.js';

function readyForFormal({ overtimeUsed = 0, repaired = true } = {}) {
  const state = createNarrativeGame({ seed: `round4-delivery-${overtimeUsed}` });
  state.timeLeft = 0;
  state.workCount = 12 + overtimeUsed;
  state.overtimeUsed = overtimeUsed;
  state.artifact.kind = 'implementation';
  state.artifact.revision = 4;
  state.requirement.clarity = 'clear';
  state.requirement.scope = 'bounded';
  state.requirement.pendingQuestions = [];
  state.documents.draft = true;
  state.documents.confirmed = true;
  state.repairHistory = repaired;
  for (const id of Object.keys(state.functionState)) {
    state.functionState[id] = 'correct';
    state.evidence[id] = { requirementId: id, artifactRevision: 4, result: 'pass' };
  }
  return state;
}

function resources(state) {
  return {
    token: state.token,
    stress: state.stress,
    timeLeft: state.timeLeft,
    workCount: state.workCount,
    overtimeUsed: state.overtimeUsed,
  };
}

test('A12 preview and execute are free at D0; only actual overtime selects E06', () => {
  for (const overtimeUsed of [0, 1]) {
    const state = readyForFormal({ overtimeUsed });
    const before = resources(state);
    const preview = previewAction(state, 'A12', { intent: 'formal' });
    const html = renderPreview(projectNarrativeView(state), 'A12', { intent: 'formal' }, preview);
    const out = performAction(state, 'A12', {
      operationId: `round4-delivery-${overtimeUsed}`,
      stateVersion: state.stateVersion,
      intent: 'formal',
    });

    assert.deepEqual(preview, { cached: false, cost: 0, overtime: false });
    assert.match(html, /免費檢查與結案/);
    assert.doesNotMatch(html, /一次工作時間|加班代價/);
    assert.deepEqual(resources(out.state), before);
    assert.equal(out.result.ending.id, overtimeUsed === 0 ? 'E03' : 'E06');
  }
});

test('hard cap exposes only saved history and A12, with no new work or rest', () => {
  let state = createNarrativeGame({ seed: 'round4-hard-cap' });
  state = performAction(state, 'A01', {
    operationId: 'round4-history',
    stateVersion: state.stateVersion,
    designate: 'A01-A',
  }).state;
  state.timeLeft = 0;
  state.workCount = 14;
  state.overtimeUsed = 2;

  const view = projectNarrativeView(state);
  const html = renderPlay(view, true);
  const history = view.actions.find((action) => action.id === 'A01');

  assert.deepEqual(availableActions(state), ['A12']);
  assert.equal(history.hasPrevious, true);
  assert.equal(history.canStart, false);
  assert.match(html, /data-view-result="A01"/);
  assert.doesNotMatch(html, /data-action="A01"|data-rest/);
});

test('A07 result text and visible scope match the selected core target', () => {
  let state = createNarrativeGame({ seed: 'round4-target-copy' });
  state = performAction(state, 'A05', {
    operationId: 'round4-prototype', stateVersion: state.stateVersion, designate: 'A05-A',
  }).state;
  const out = performAction(state, 'A07', {
    operationId: 'round4-core', stateVersion: state.stateVersion,
    designate: 'A07-A', target: 'core',
  });
  const html = renderResult(projectNarrativeView(out.state), out.result);

  assert.match(out.result.event.story, /新增、完成與取消完成/);
  assert.doesNotMatch(out.result.event.story, /把保存接好/);
  assert.match(html, /本次範圍：<\/strong>新增、完成與刪除/);
});

test('A07-C copy, affected evidence, and history align for every target and delete-check choice', () => {
  const cases = [
    ['core', ['R1', 'R2', 'R3'], /核心操作與刪除證據失效/, /你要補核心操作/],
    ['delete', ['R3'], /刪除證據失效/, /你要處理單筆刪除/],
    ['persistence', ['R3', 'R4', 'R5'], /(?:R3 與保存|刪除與保存)證據失效/, /你要保存/],
  ];
  for (const checkDelete of [false, true]) {
    for (const [target, affected, summary, story] of cases) {
      let state = createNarrativeGame({ seed: `round5-target-c-${target}-${checkDelete}` });
      state = performAction(state, 'A05', {
        operationId: `round5-target-c-prototype-${target}-${checkDelete}`,
        stateVersion: state.stateVersion,
        designate: 'A05-A',
      }).state;
      for (const id of Object.keys(state.functionState)) {
        state.evidence[id] = { requirementId: id, artifactRevision: state.artifact.revision, result: 'pass' };
      }
      const out = performAction(state, 'A07', {
        operationId: `round5-target-c-${target}-${checkDelete}`,
        stateVersion: state.stateVersion,
        designate: 'A07-C',
        target,
        checkDelete,
      });
      const invalidated = Object.entries(out.state.evidence)
        .filter(([, evidence]) => evidence.result === 'not_run')
        .map(([id]) => id);
      const saved = readPreviousActionResult(out.state, 'A07');
      const historyHtml = renderResult(projectNarrativeView(out.state), {
        ...saved,
        historical: true,
        currentlyValid: true,
      });
      assert.deepEqual(invalidated, affected);
      assert.match(out.result.event.summary, summary);
      assert.match(out.result.event.story, story);
      assert.equal(out.result.event.story, saved.event.story);
      assert.equal(out.result.event.summary, saved.event.summary);
      assert.match(historyHtml, story);
      assert.match(historyHtml, new RegExp(`當時範圍：</strong>${{ core: '新增、完成與刪除', delete: '單筆刪除', persistence: '保存與重新開啟' }[target]}`));
      if (checkDelete) {
        assert.match(out.result.event.story, /第二條.*第一條|兩筆同名/);
        assert.match(out.result.event.summary, /建立已知問題/);
        assert.match(out.result.process.response, /實際用兩筆同名.*確認刪除認錯/);
      } else {
        assert.match(out.result.event.story, /沒有真的跑/);
        assert.match(out.result.event.summary, /尚未檢查/);
        assert.match(out.result.process.response, /沒有操作兩筆同名.*不能知道刪除是否真的有缺陷/);
        assert.doesNotMatch(out.result.process.response, /留下真缺陷|確認刪除認錯|已知缺陷/);
      }
    }
  }
});

test('A07-A process copy describes only the selected target', () => {
  const cases = [
    ['core', /新增、完成與取消完成/, /保存被接到|單筆刪除路徑/],
    ['persistence', /保存被接到/, /新增、完成與取消完成|單筆刪除路徑/],
    ['delete', /單筆刪除路徑/, /新增、完成與取消完成|保存被接到/],
  ];
  for (const [target, expected, excluded] of cases) {
    let state = createNarrativeGame({ seed: `round6-a07-a-${target}` });
    state = performAction(state, 'A05', {
      operationId: `round6-a07-a05-${target}`,
      stateVersion: state.stateVersion,
      designate: 'A05-A',
    }).state;
    const out = performAction(state, 'A07', {
      operationId: `round6-a07-${target}`,
      stateVersion: state.stateVersion,
      designate: 'A07-A',
      target,
    });
    assert.match(out.result.process.response, expected);
    assert.doesNotMatch(out.result.process.response, excluded);
  }
});

test('A01-B reports ambiguity as an actual public state change', () => {
  const state = createNarrativeGame({ seed: 'round6-a01-b-copy' });
  const out = performAction(state, 'A01', {
    operationId: 'round6-a01-b',
    stateVersion: state.stateVersion,
    designate: 'A01-B',
  });
  assert.match(out.result.process.consequence, /需求由「仍待具體回答」變成「已有線索但仍有歧義」/);
  assert.doesNotMatch(out.result.process.consequence, /未改變/);
});

test('unchecked natural core failure does not reveal the latent defect', () => {
  let state = createNarrativeGame({ seed: 'deep-core-1' });
  state = performAction(state, 'A05', {
    operationId: 'deep-core-1-a05', stateVersion: state.stateVersion,
  }).state;
  const out = performAction(state, 'A07', {
    operationId: 'deep-core-1-a07', stateVersion: state.stateVersion,
    target: 'core', checkDelete: false,
  });
  assert.equal(out.result.event.id, 'A07-C');
  assert.equal(out.state.knownIssues.filter((issue) => issue.status !== 'fixed').length, 0);
  assert.match(out.result.event.summary, /尚未檢查/);
  assert.match(out.result.process.response, /不能知道刪除是否真的有缺陷/);
  assert.doesNotMatch(out.result.process.response, /留下真缺陷|確認刪除認錯|已知缺陷/);
});

test('reported natural seeds reach checked A07-C without designated events', () => {
  for (const [seed, target] of [['deep-core-1', 'core'], ['deep-delete-4', 'delete'], ['deep-persistence-4', 'persistence']]) {
    let state = createNarrativeGame({ seed });
    state = performAction(state, 'A05', {
      operationId: `${seed}-a05`, stateVersion: state.stateVersion,
    }).state;
    const out = performAction(state, 'A07', {
      operationId: `${seed}-a07`, stateVersion: state.stateVersion, target, checkDelete: true,
    });
    assert.equal(out.result.event.id, 'A07-C');
  }
});

test('verified functions do not erase an unresolved contradictory requirement draft', () => {
  const ready = readyForFormal({ repaired: false });
  ready.documents.draft = true;
  ready.documents.wrongCompletionRule = true;
  const readyText = projectNarrativeView(ready).progress.documentText;
  assert.equal(readyText, '需求草稿有一段需要訂正');
  assert.match(projectNarrativeView(ready).progress.delivery.formal, /已知誤解待訂正/);

  const unresolved = createNarrativeGame({ seed: 'round4-unresolved-draft' });
  unresolved.documents.draft = true;
  unresolved.documents.wrongCompletionRule = true;
  assert.equal(projectNarrativeView(unresolved).progress.documentText, '需求草稿有一段需要訂正');
});

test('range and redo controls use explicit player-facing emphasis', () => {
  let state = createNarrativeGame({ seed: 'round4-control-copy' });
  state = performAction(state, 'A05', {
    operationId: 'round4-controls', stateVersion: state.stateVersion, designate: 'A05-A',
  }).state;
  const view = projectNarrativeView(state);
  const play = renderPlay(view, true);
  const preview = renderPreview(view, 'A07', {}, previewAction(state, 'A07'));

  assert.match(play, /選定工作後再挑實作範圍/);
  assert.match(preview, /這會改變工作對象與這次工作結果/);
  assert.match(preview, /同時操作兩筆同名項目檢查刪除/);
});
