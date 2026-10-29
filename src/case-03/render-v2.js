import * as legacy from './render.js';
import { cardIllustration } from '../narrative-ui/art.js';
import { renderLocalCoachPanel } from '../postgame/coach-ui.js';
import { renderEndingStage } from '../presentation/ending-stage.js';
import { case03ActionArt, case03EndingArt, case03StatusArt, case03Tone } from './art.js';
import { CASE03_ACTIONS } from './rules.js';

export const renderCase03Error = legacy.renderCase03Error;
const shell = (content) => `<div class="topbar"><span class="brand">AI 工程接案遊戲 · CASE 03</span><a class="button secondary" href="./index.html">回到接案大廳</a></div>${content}`;

export function renderCase03Intro(career) {
  return legacy.renderCase03Intro(career).replace('<section class="hero">', `<section class="hero case-hero">${case03ActionArt('C01', 'good')}`);
}

export function renderCase03Board(state, message = '') {
  let html = legacy.renderCase03Board(state, message);
  html = html.replace('<section class="panel">', `<section class="panel case-workspace">${case03StatusArt(state)}`);
  const story = state.story;
  const pending = Object.values(story?.commitments ?? {}).filter((value) => value === 'pending' || value === 'surfaced').length;
  const strip = `<div class="story-strip"><strong>剛才的選擇留下什麼</strong><span>${story?.openRecovery ? '失敗開出新路' : story?.openOpportunity ? '成功後可穩住或加碼' : pending ? `${pending} 個承諾會在後續回來` : '目前沒有未處理的故事承諾'}</span></div>`;
  html = html.replace('<div class="action-grid">', `${strip}<div class="action-grid">`);
  for (const actionId of Object.keys(CASE03_ACTIONS)) {
    const buttonAt = html.indexOf(`data-case03-action="${actionId}"`);
    if (buttonAt < 0) continue;
    const articleAt = html.lastIndexOf('<article class="action-card ', buttonAt);
    const divAt = html.indexOf('<div>', articleAt);
    if (articleAt < 0 || divAt < 0 || divAt > buttonAt) continue;
    html = `${html.slice(0, articleAt)}${html.slice(articleAt, divAt + 5)}${case03ActionArt(actionId)}${html.slice(divAt + 5)}`;
    const classEnd = html.indexOf('"', articleAt + '<article class="'.length);
    html = `${html.slice(0, classEnd)} action-${actionId.toLowerCase()}${html.slice(classEnd)}`;
  }
  return html;
}

export function renderCase03Preview(state, actionId, options) {
  return legacy.renderCase03Preview(state, actionId, options)
    .replace('<div class="eyebrow">', `<div class="preview-scene">${case03ActionArt(actionId, 'mixed')}</div><div class="eyebrow">`);
}

export function renderCase03Result(state, result) {
  const actionId = state.log.at(-1)?.actionId ?? 'C01';
  const tone = case03Tone(result);
  return legacy.renderCase03Result(state, result)
    .replace('<section class="panel result"', `<section class="panel result result-tone-${tone}"`)
    .replace('<div class="eyebrow">', `<div class="result-scene">${case03ActionArt(actionId, tone)}</div><div class="eyebrow">`)
    .replace('<b>1</b>', '<b>你</b><span class="beat-role">玩家 prompt</span>')
    .replace('<b>2</b>', '<b>客</b><span class="beat-role">客戶 / NPC 回應</span>')
    .replace('<b>3</b>', '<b>合</b><span class="beat-role">協作與追問</span>')
    .replace('<b>4</b>', '<b>!</b><span class="beat-role">可見後果</span>');
}

export function renderCase03Reward(state) {
  let html = legacy.renderCase03Reward(state);
  for (const id of state.pendingReward?.choices ?? []) {
    if (!/^C\d+$/.test(id)) continue;
    html = html.replace(`<button class="reward-card" data-case03-reward="${id}">`, `<button class="reward-card" data-case03-reward="${id}">${cardIllustration(id, Math.min(2, (state.cards[id] ?? 0) + 1))}`);
  }
  return html;
}

export function renderCase03Ending(state, settlement, coachView = null) {
  const ending = state.ending;
  const labels = { 'C03-VERIFIED': '正式交付', 'C03-LIMITED': '有限試用', 'C03-FAILED': '風險交付', 'C03-STOP': '誠實止損' };
  return shell(renderEndingStage({
    caseLabel: '案件 03 結案', outcomeLabel: labels[ending.baseId] ?? '案件結案', title: ending.title, text: ending.text,
    art: case03EndingArt(ending.baseId), facets: ending.playFacets ?? [], coach: renderLocalCoachPanel(coachView),
    footer: `<p class="notice">職涯增加 ${settlement?.expGained ?? 0} EXP；客戶決策、NPC 協作與目前 revision 證據已依本局真實狀態結算。</p>`,
  }));
}

export const renderCase03RewardLegacy = legacy.renderCase03Reward;
