import { case02CardLevel, case02PublicView, previewCase02Action } from './engine-v2.js';
import * as legacy from './render.js';
import { cardIllustration } from '../narrative-ui/art.js';
import { renderLocalCoachPanel } from '../postgame/coach-ui.js';
import { renderEndingStage } from '../presentation/ending-stage.js';
import { case02ActionArt, case02EndingArt, case02StatusArt, case02Tone } from './art.js';
import { CASE02_ACTIONS } from './rules.js';
import {
  case02BoardScene,
  case02EndingScene,
  case02SceneForAction,
  renderCase02Scene,
} from './scene.js';

export const renderCase02Error = legacy.renderCase02Error;

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const shell = (content) => `<div class="topbar"><span class="brand">AI 工程接案遊戲 · CASE 02</span><a class="button secondary" href="./index.html">回到接案大廳</a></div>${content}`;

export function renderCase02Intro(career) {
  return legacy.renderCase02Intro(career).replace('<section class="hero">', `<section class="hero case-hero">${case02ActionArt('B03', 'good')}`);
}

export function renderCase02Board(state, message = '') {
  let html = legacy.renderCase02Board(state, message);
  html = html.replace('<section class="panel">', `<section class="panel case-workspace">${case02StatusArt(state)}`);
  const story = state.story;
  const pending = Object.values(story?.commitments ?? {}).filter((value) => value === 'pending' || value === 'surfaced').length;
  const strip = `<div class="story-strip"><strong>剛才的選擇留下什麼</strong><span>${story?.openRecovery ? '失敗開出新救援' : story?.openOpportunity ? '成功後仍可選擇' : pending ? `${pending} 個延後承諾等著結算` : '目前沒有未處理的故事承諾'}</span></div>`;
  const stage = renderCase02Scene(case02BoardScene(state));
  html = html.replace('<div class="action-grid">', `${stage}${strip}<div class="action-grid">`);
  for (const actionId of Object.keys(CASE02_ACTIONS)) {
    const button = `data-case02-action="${actionId}"`;
    const buttonAt = html.indexOf(button);
    if (buttonAt < 0) continue;
    const articleAt = html.lastIndexOf('<article class="action-card ', buttonAt);
    const divAt = html.indexOf('<div>', articleAt);
    if (articleAt < 0 || divAt < 0 || divAt > buttonAt) continue;
    html = `${html.slice(0, articleAt)}${html.slice(articleAt, divAt + 5)}${case02ActionArt(actionId)}${html.slice(divAt + 5)}`;
    const classEnd = html.indexOf('"', articleAt + '<article class="'.length);
    html = `${html.slice(0, classEnd)} action-${actionId.toLowerCase()}${html.slice(classEnd)}`;
  }
  return html;
}

export function renderCase02Result(state, result) {
  const actionLog = state.log.at(-1);
  const actionId = actionLog?.actionId ?? 'B03';
  const actionOptions = actionLog?.options && typeof actionLog.options === 'object' ? actionLog.options : {};
  const tone = case02Tone(result);
  const stage = renderCase02Scene(case02SceneForAction(state, actionId, actionOptions, result));
  return legacy.renderCase02Result(state, result)
    .replace('<section class="panel result"', `<section class="panel result result-tone-${tone}"`)
    .replace('<div class="eyebrow">', `<div class="result-scene">${case02ActionArt(actionId, tone, { showCast: false })}</div><div class="eyebrow">`)
    .replace('<div class="eyebrow">工作結果', `${stage}<div class="eyebrow">工作結果`)
    .replace('<b>1</b>', '<b>你</b><span class="beat-role">玩家 prompt</span>')
    .replace('<b>2</b>', '<b>AI</b><span class="beat-role">agent / 資料回應</span>')
    .replace('<b>3</b>', '<b>?</b><span class="beat-role">追問與整合</span>')
    .replace('<b>4</b>', '<b>!</b><span class="beat-role">可見後果</span>');
}

export function renderCase02Reward(state) {
  let html = legacy.renderCase02Reward(state);
  for (const id of state.pendingReward?.choices ?? []) {
    if (!/^C\d+$/.test(id)) continue;
    html = html.replace(`<button class="reward-card" data-case02-reward="${id}">`, `<button class="reward-card" data-case02-reward="${id}">${cardIllustration(id, Math.min(2, (state.cards[id] ?? 0) + 1))}`);
  }
  return html;
}

export function renderCase02Ending(state, settlement, coachView = null) {
  const ending = state.ending;
  const labels = { 'C02-VERIFIED': '正式交付', 'C02-LIMITED': '有限試用', 'C02-FAILED': '風險交付', 'C02-STOP': '誠實止損' };
  const blockersNow = case02PublicView(state).blockers;
  const blockers = state.ending.baseId === 'C02-VERIFIED' ? '' : `<section class="ending-open-issues"><h2>結案時仍公開的限制</h2><ul>${blockersNow.map((item) => `<li>${esc(item)}</li>`).join('') || '<li>本局依選擇保留未完成風險。</li>'}</ul></section>`;
  return shell(renderEndingStage({
    caseLabel: '案件 02 結案', outcomeLabel: labels[ending.baseId] ?? '案件結案', title: ending.title, text: ending.text,
    art: case02EndingArt(ending.baseId, state.templateId), facets: ending.playFacets ?? [], coach: renderLocalCoachPanel(coachView),
    footer: `${renderCase02Scene(case02EndingScene(state))}${blockers}<p class="notice">職涯增加 ${settlement?.expGained ?? 0} EXP；跨案卡庫與獎勵 ledger 已保存，短期資源回到大廳時重置。</p>`,
  }));
}

function selectionComplete(actionId, options) {
  if (actionId === 'B01') return Boolean(options.idPolicy && options.datePolicy && options.duplicatePolicy);
  if (actionId === 'B02') return Boolean(options.strategy);
  if (actionId === 'B04') return Boolean(options.response);
  if (actionId === 'B05') return Boolean(options.mode);
  if (actionId === 'B06') return Boolean(options.scope);
  if (actionId === 'B09') return Boolean(options.intent);
  if (['B10', 'B11', 'B12'].includes(actionId)) return Boolean(options.route);
  return true;
}

export function renderCase02Preview(state, actionId, options) {
  let html = legacy.renderCase02Preview(state, actionId, options);
  let preview = null;
  try { preview = previewCase02Action(state, actionId, options); } catch { /* waiting for an explicit choice */ }
  const value = (key, formatter) => preview ? formatter(preview[key]) : '待選';
  html = html
    .replace(/(<strong data-preview-cost="token">)[^<]*/, `$1${value('token', legacy.formatPreviewCost)}`)
    .replace(/(<strong data-preview-cost="time">)[^<]*/, `$1${value('time', legacy.formatPreviewCost)}`)
    .replace(/(<strong data-preview-cost="stress">)[^<]*/, `$1${value('stress', legacy.formatPreviewDelta)}`);
  html = html.replace('<div class="receipt">', `${renderCase02Scene(case02SceneForAction(state, actionId, options))}<div class="receipt">`);

  if (actionId === 'B01') {
    for (const key of ['idPolicy', 'datePolicy', 'duplicatePolicy']) {
      html = html.replace(`<select data-case02-option="${key}">`, `<select data-case02-option="${key}"><option value="" ${options[key] ? '' : 'selected'} disabled>請先作決定</option>`);
    }
  }
  if (actionId === 'B03') {
    const signal = case02CardLevel(state, 'C10');
    const control = signal
      ? `<label class="radio"><input type="checkbox" data-case02-check="useFastMerge" ${options.useFastMerge ? 'checked' : ''}><span><strong>啟用合併號誌 Lv.${signal}</strong><br><small>省下時間${signal >= 2 ? '與 1 Token' : ''}，但固定增加 1 點公開協調債。</small></span></label>`
      : '<p class="notice">一般合併不預設加速；結果仍會受工程能力與目前整合債影響。</p>';
    html = html.replace('<details>', `${control}<details>`);
  }
  html = html.replace('<details>', '<p class="notice">結果由公開狀態、角色能力與裝備卡共同影響；不暗示隱藏正解，也不保證成功。</p><details>');
  if (preview?.attempt) {
    const retry = preview.attempt.retry ? `；本次重試理解 +${preview.attempt.retryLearningGain}` : '';
    html = html.replace('<details>', `<p class="notice good">目前公開成功機率 ${preview.attempt.chance}%；累積理解 ${preview.attempt.learning}${retry}。失敗後才會抽情境事件。</p><details>`);
  }
  const disabled = selectionComplete(actionId, options) ? '' : ' disabled';
  html = html.replace(/<button class="primary" data-case02-confirm\s*(?:disabled)?\s*>/, `<button class="primary" data-case02-confirm${disabled}>`);
  return html;
}
