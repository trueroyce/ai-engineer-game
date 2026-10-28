const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function badgeArt(id, title) {
  const key = `${id ?? ''} ${title ?? ''}`.toLowerCase();
  if (/token|守財|金庫/.test(key)) return '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M20 37h80v42H20zM30 37V20h60v17M40 50h40v18H40z"/><circle cx="60" cy="59" r="7"/><path d="M31 14h58"/></svg>';
  if (/on-time|deadline|期限|準時/.test(key)) return '<svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="59" cy="48" r="31"/><path d="M59 26v23l17 10M45 10h28M37 17l-8 10M81 17l8 10"/></svg>';
  if (/stress|高壓|爆/.test(key)) return '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M55 8L35 45h20L45 82l39-48H62L76 8z"/></svg>';
  if (/recover|修復|救/.test(key)) return '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M28 61a35 35 0 1 0 5-34M22 18v24h24"/><path d="M48 50l10 10 21-25"/></svg>';
  if (/test|驗收|證據|trace/.test(key)) return '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M30 12h60v68H30zM42 31l7 7 12-14M66 31h14M42 55l7 7 12-14M66 55h14"/></svg>';
  return '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M60 8l14 27 30 5-22 21 5 30-27-14-27 14 5-30-22-21 30-5z"/></svg>';
}

export function renderEndingFacets(facets = []) {
  if (!facets.length) return '';
  return `<section class="ending-facets" aria-label="本局特色稱號"><div class="eyebrow">本局特色稱號</div><div class="ending-badge-grid">${facets.map((facet) => `<article class="ending-badge">${badgeArt(facet.id, facet.title)}<div><h2>${esc(facet.title)}</h2><p>${esc(facet.text)}</p></div></article>`).join('')}</div></section>`;
}

export function renderEndingStage({ caseLabel, outcomeLabel, title, text, art, facets = [], coach = '', footer = '', href = './index.html' }) {
  return `<section class="ending-stage" aria-live="polite"><div class="ending-stage-art">${art}<div class="ending-outcome-stamp"><span>${esc(caseLabel)}</span><strong>${esc(outcomeLabel)}</strong></div></div><div class="ending-stage-copy"><div class="eyebrow">主要交付結果</div><h1>${esc(title)}</h1><p class="ending-lede">${esc(text)}</p>${renderEndingFacets(facets)}<details class="ending-rules"><summary>結局怎麼判定？</summary><p>主要交付結果只由實際成果、缺陷與公開證據決定；資源與過程稱號只描述玩法，不會把失敗或有限交付改寫成完美成功。</p></details>${footer}${coach}<div class="actions"><a class="button primary" data-return-lobby href="${href}">回到接案大廳</a></div></div></section>`;
}
