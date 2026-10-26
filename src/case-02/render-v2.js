import { case02CardLevel, previewCase02Action } from './engine-v2.js';
import * as legacy from './render.js';

export const renderCase02Board = legacy.renderCase02Board;
export const renderCase02Ending = legacy.renderCase02Ending;
export const renderCase02Error = legacy.renderCase02Error;
export const renderCase02Intro = legacy.renderCase02Intro;
export const renderCase02Result = legacy.renderCase02Result;
export const renderCase02Reward = legacy.renderCase02Reward;

function selectionComplete(actionId, options) {
  if (actionId === 'B01') return Boolean(options.idPolicy && options.datePolicy && options.duplicatePolicy);
  if (actionId === 'B02') return Boolean(options.strategy);
  if (actionId === 'B04') return Boolean(options.response);
  if (actionId === 'B05') return Boolean(options.mode);
  if (actionId === 'B06') return Boolean(options.scope);
  if (actionId === 'B09') return Boolean(options.intent);
  return true;
}

export function renderCase02Preview(state, actionId, options) {
  let html = legacy.renderCase02Preview(state, actionId, options);
  let preview = null;
  try { preview = previewCase02Action(state, actionId, options); } catch { /* waiting for an explicit choice */ }
  const value = (key, prefix) => preview ? `${prefix}${preview[key]}` : '待選';
  html = html
    .replace(/(<span>Token<\/span><strong>)[^<]*/, `$1${value('token', '-')}`)
    .replace(/(<span>時間<\/span><strong>)[^<]*/, `$1${value('time', '-')}`)
    .replace(/(<span>壓力<\/span><strong>)[^<]*/, `$1${value('stress', '+')}`);

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
  const disabled = selectionComplete(actionId, options) ? '' : ' disabled';
  html = html.replace(/<button class="primary" data-case02-confirm\s*(?:disabled)?\s*>/, `<button class="primary" data-case02-confirm${disabled}>`);
  return html;
}
