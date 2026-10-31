const safeId = (value) => String(value ?? '').replace(/[^a-zA-Z0-9-]/g, '');

function svg(className, body, viewBox = '0 0 320 200') {
  return `<svg class="game-art ${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

const palette = Object.freeze({
  ultimate: ['#ff6b5f', '#ffd166'], analyst: ['#48a9ff', '#a8e6ff'], balanced: ['#46d6a0', '#ffd166'],
  builder: ['#ff914d', '#ffe29a'], verifier: ['#9d7cff', '#efb8ff'], beginner: ['#8ea0b8', '#d6deea'],
});

const portraitProps = Object.freeze({
  ultimate: '<path class="ink accent-fill" d="M206 48l24 13-17 13 12 18-27-5-12-34z"/><path class="ink paper-fill" d="M92 157l-27 26 52-8 16-32z"/><path class="ink" d="M102 68l20-25 20 25"/>',
  analyst: '<path class="ink paper-fill" d="M87 81h34v22H87zM127 81h34v22h-34z"/><path class="ink" d="M121 91h6M161 92l18-9"/><path class="ink accent-fill" d="M189 126h55v48h-55zM200 139h32M200 151h25"/>',
  balanced: '<path class="ink accent-fill" d="M201 133h42v31a20 20 0 01-42 0z"/><path class="ink" d="M243 142h13v16h-13"/><path class="ink paper-fill" d="M69 65l25-15 21 18-24 15z"/>',
  builder: '<path class="ink accent-fill" d="M78 70q23-42 66 0v12H78z"/><path class="ink" d="M71 83h81"/><path class="ink paper-fill" d="M201 133l18-18 11 11-18 18 13 13-12 12-13-13-18 18-11-11 18-18z"/>',
  verifier: '<circle class="ink paper-fill" cx="219" cy="137" r="31"/><path class="ink" d="M241 159l25 25M205 129l9 9 16-20"/><path class="ink accent-fill" d="M70 52l22-13 21 13v28H70z"/>',
  beginner: '<path class="ink paper-fill" d="M185 136c23-26 47 20 20 34-24 12-33-22-11-25 18-3 21 21 5 26"/><path class="ink accent-fill" d="M63 135h52v38H63zM72 146h33M72 157h24"/><path class="ink" d="M78 61q22-22 44 0"/>',
});

export function characterPortrait(templateId, expression = 'focused') {
  const id = safeId(templateId);
  const known = Object.hasOwn(palette, id) ? id : 'balanced';
  const mood = ['focused', 'worried', 'skeptical', 'relieved'].includes(expression) ? expression : 'focused';
  return `<span class="game-art template-art raster-template portrait-${known} expression-${mood}" style="--portrait-image:url('./assets/art/characters/player-${known}-${mood}.png')" aria-hidden="true"></span>`;
}

const caseFileScenes = Object.freeze({
  'case-01': `
    <path class="paper-fill ink" d="M18 24h284v142H18z"/>
    <path class="accent-soft ink" d="M34 39h143v82H34z"/><path class="thin" d="M49 57h91M49 75h68M49 93h99"/>
    <circle class="paper-fill ink" cx="248" cy="68" r="31"/><path class="ink" d="M248 50v20l14 8"/>
    <path class="accent-fill ink" d="M196 117h86v35h-86z"/><path class="thin" d="M210 132h57"/>`,
  'case-02': `
    <path class="paper-fill ink" d="M28 38h69v111H28zM126 25h69v124h-69zM224 45h69v104h-69z"/>
    <path class="thin" d="M40 58h44M40 76h34M138 48h44M138 66h34M236 64h44M236 82h34"/>
    <path class="accent-fill ink" d="M62 160h196M62 148v24M160 137v35M258 148v24"/>
    <path class="ink" d="M98 96h28M195 96h29"/>`,
  'case-03': `
    <path class="screen-fill ink" d="M21 31h278v126H21z"/>
    <path class="accent-fill ink" d="M43 50h48v31H43zM101 43h54v35h-54zM166 55h52v32h-52zM229 42h48v37h-48zM59 94h55v35H59zM129 91h59v39h-59zM201 98h61v34h-61z"/>
    <path class="ink" d="M67 81v13M128 78v13M192 87v11M86 129v15M158 130v15M231 132v14"/>`,
  'case-04': `
    <path class="screen-fill ink" d="M18 24h284v139H18z"/>
    <path class="paper-fill ink" d="M36 43h142v83H36z"/><path class="accent-line" d="M51 63h103M51 82h74M51 101h91"/>
    <path class="accent-fill ink" d="M219 41h47l18 48h-83z"/><path class="ink" d="M243 89v51M216 145h54"/>
    <path class="star-fill ink" d="M193 118h45v30h-45z"/><path class="thin" d="M198 127h35M198 137h24"/>`,
});

export function caseFileIllustration(caseId) {
  const id = safeId(caseId);
  const known = Object.hasOwn(caseFileScenes, caseId) ? id : 'case-01';
  const file = {
    'case-01': 'case01-meeting-room.png',
    'case-02': 'case02-data-room.png',
    'case-03': 'case03-client-room.png',
    'case-04': 'case04-server-warroom.png',
  }[known];
  return `<span class="game-art case-file-art raster-case-file file-${known}" style="--scene-image:url('./assets/art/backgrounds/${file}')" aria-hidden="true"></span>`;
}

const cardGlyphs = Object.freeze({
  C1: '<path class="ink paper-fill" d="M62 46h147v104H62z"/><path class="thin" d="M78 62h115M78 78h63M78 94h115M78 110h84"/><circle class="ink accent-fill" cx="221" cy="132" r="35"/><path class="ink" d="M206 132l11 11 22-27"/>',
  C2: '<path class="ink accent-fill" d="M145 35q48 31 39 86l-42 34-31-31 34-89z"/><circle class="ink paper-fill" cx="151" cy="82" r="14"/><path class="ink paper-fill" d="M112 114l-37 9 21 21zM148 151l-9 36 28-21z"/><path class="ink fire-fill" d="M113 151q-26 2-34 27 27 2 39-20z"/>',
  C3: '<circle class="ink paper-fill" cx="132" cy="101" r="59"/><path class="ink" d="M174 143l49 44"/><path class="ink accent-fill" d="M104 84h55v44h-55z"/><path class="thin" d="M114 96h35M114 108h23M120 74v10M144 74v10M120 128v12M144 128v12"/>',
  C4: '<path class="ink paper-fill" d="M71 49h78v111H71z"/><path class="thin" d="M85 69h50M85 88h38M85 107h50"/><path class="ink accent-fill" d="M184 60l22 22-71 72-29 7 7-29z"/><path class="ink" d="M174 70l22 22"/>',
  C5: '<path class="ink accent-fill" d="M67 89h116v48q0 42-58 42t-58-42z"/><path class="ink paper-fill" d="M183 102h29q25 0 25 23t-29 23h-26"/><path class="ink" d="M97 69q-12-17 2-31M127 69q-12-17 2-31M157 69q-12-17 2-31"/>',
  C6: '<path class="ink paper-fill" d="M64 43h143v125H64z"/><path class="ink accent-fill" d="M105 30h61v29h-61z"/><path class="ink" d="M85 83l10 10 18-22M85 116l10 10 18-22M124 83h59M124 116h59M124 145h42"/>',
  C7: '<path class="ink paper-fill" d="M55 55h68v88H55zM174 55h68v88h-68z"/><path class="ink accent-fill" d="M123 82h51v34h-51z"/><path class="ink" d="M70 75h38M70 92h30M189 75h38M189 92h30M137 99h23"/>',
  C8: '<path class="ink paper-fill" d="M72 37h132v132H72z"/><path class="ink accent-fill" d="M92 60h92v27H92z"/><path class="thin" d="M92 108h92M92 128h68M92 148h81"/><path class="ink" d="M210 75l19 19-45 45-25 5 5-25z"/>',
  C9: '<circle class="ink paper-fill" cx="105" cy="98" r="48"/><circle class="ink accent-fill" cx="178" cy="98" r="48"/><path class="ink" d="M92 98l12 12 23-28M165 98l12 12 23-28M129 151h26"/>',
  C10: '<path class="ink paper-fill" d="M57 82h178v55H57z"/><circle class="ink accent-fill" cx="94" cy="109" r="18"/><circle class="ink paper-fill" cx="146" cy="109" r="18"/><circle class="ink paper-fill" cx="198" cy="109" r="18"/><path class="ink" d="M78 45h136M146 45v37M126 45l20-18 20 18"/>',
  C11: '<path class="ink paper-fill" d="M50 52h103v72H91l-26 22 7-22H50z"/><path class="ink accent-fill" d="M151 76h96v67h-28l8 22-29-22h-47z"/><path class="thin" d="M70 73h61M70 91h42M171 96h55M171 114h38"/>',
  C12: '<path class="ink paper-fill" d="M64 39h139v129H64z"/><path class="ink accent-fill" d="M104 27h59v28h-59z"/><path class="ink" d="M85 78l9 9 16-19M85 108l9 9 16-19M85 138l9 9 16-19M122 79h61M122 109h61M122 139h61"/>',
  C13: '<path class="ink paper-fill" d="M52 52h98v102H52z"/><path class="ink accent-fill" d="M169 69q40-32 69 4t-7 66q-31 26-68-8"/><path class="ink" d="M72 74h58M72 94h42M72 114h50M187 91q15-17 31 0M199 109q9 8 18 0"/>',
  C14: '<path class="ink paper-fill" d="M63 61h171v91H63z"/><path class="ink accent-fill" d="M83 80h131v53H83z"/><path class="ink" d="M112 53v107M183 53v107M54 106h189M130 91l18-18 18 18-18 18z"/>',
  C15: '<path class="ink paper-fill" d="M51 62h75v91H51zM183 62h75v91h-75z"/><path class="ink accent-fill" d="M126 84h57v47h-57z"/><path class="ink" d="M72 91h33M72 109h33M204 91h33M204 109h33M141 107h27"/>',
  C16: '<ellipse class="ink accent-fill" cx="105" cy="143" rx="51" ry="16"/><path class="ink accent-fill" d="M54 78v65q0 16 51 16t51-16V78"/><ellipse class="ink paper-fill" cx="105" cy="78" rx="51" ry="16"/><path class="ink paper-fill" d="M186 49h54v92h-54z"/><path class="ink" d="M198 70h30M198 89h22M198 108h30M84 79l21 18 23-18"/>',
  C17: '<path class="ink paper-fill" d="M54 44h101v118H54zM169 61h91v101h-91z"/><path class="ink" d="M73 66h62M73 86h45M73 106h59M188 83h53M188 103h38M188 123h49"/><path class="ink accent-fill" d="M137 129l32-24v20h31v17h-31v20z"/>',
  C18: '<circle class="ink paper-fill" cx="147" cy="105" r="67"/><circle class="ink accent-fill" cx="147" cy="105" r="42"/><circle class="ink paper-fill" cx="147" cy="105" r="17"/><path class="ink" d="M147 25v31M147 154v31M67 105h31M196 105h31M147 105l48-42"/><path class="ink accent-fill" d="M190 54l27-7-7 27z"/>',
});

export function cardIllustration(cardId, level = 1) {
  const id = safeId(cardId);
  const number = Number(id.replace('C', '')) || 1;
  const category = number <= 3 || number === 13 ? 'understand' : [4, 7, 8, 9, 10, 15].includes(number) ? 'build' : [5, 11, 12, 17].includes(number) ? 'coordinate' : 'risk';
  return `<span class="game-art card-illustration raster-card card-${id.toLowerCase()} level-${level} category-${category}" style="--card-image:url('./assets/art/cards/${id}.png')" aria-hidden="true"><i class="category-shape"></i>${level > 1 ? '<b class="fusion-star">★</b>' : ''}</span>`;
}

const actionGlyphs = Object.freeze({
  A01: '<path d="M35 38h77v48H67l-18 16 4-16H35z"/><path d="M52 55h43M52 68h28"/>',
  A02: '<path d="M43 25h55l20 20v67H43zM98 25v21h20M57 65h45M57 80h35"/>',
  A03: '<path d="M31 92h96M42 50l18 42 20-42 20 42 18-42"/>',
  A04: '<path d="M38 26h79v88H38zM54 48l8 8 14-16M82 48h21M54 76l8 8 14-16M82 76h21"/>',
  A05: '<path d="M33 99l34-34 18 18 27-27M83 43l22 22M64 67l-13-13"/>',
  A06: '<path d="M24 72q53-64 106 0-53 64-106 0z"/><circle cx="77" cy="72" r="18"/>',
  A07: '<path d="M33 102l52-52M74 39l12-14 29 29-14 12M27 108l23-7-16-16z"/>',
  A08: '<path d="M42 24h70v96H42zM56 49l9 9 15-18M56 76l9 9 15-18M86 51h14M86 78h14"/>',
  A09: '<circle cx="67" cy="61" r="34"/><path d="M91 86l31 31M54 61h26M67 48v26"/>',
  A10: '<path d="M28 49l49-26 49 26-49 27zM28 72l49 27 49-27M28 95l49 27 49-27"/>',
  A11: '<path d="M37 108l48-48M75 44l14-16 31 31-16 14M40 51q-18 20-3 39M33 43l5 10 10-5"/>',
  A12: '<path d="M31 50l46-24 46 24v57l-46 24-46-24zM31 50l46 25 46-25M77 75v56"/>',
});

export function actionIllustration(actionId) {
  const id = safeId(actionId);
  return svg(`action-illustration action-${id.toLowerCase()}`, `<g class="ink paper-fill">${actionGlyphs[id] ?? actionGlyphs.A01}</g><path class="accent-line" d="M148 34h130M148 58h91M148 92h116M148 116h72"/>`, '0 0 300 145');
}

export function hudIcon(kind) {
  const icons = {
    token: '<path d="M13 9h19v22H13zM18 5h19v22"/>', stress: '<path d="M23 5l-7 14h9l-4 16 15-20h-9l5-10"/>',
    time: '<circle cx="23" cy="22" r="16"/><path d="M23 11v12l8 5"/>', overtime: '<path d="M9 28q7-18 14 0t14 0M13 12h20M18 6h10"/>',
  };
  return svg(`hud-icon hud-${safeId(kind)}`, `<g class="ink">${icons[kind] ?? icons.token}</g>`, '0 0 46 42');
}

export function caseScene(view) {
  const templateId = safeId(view?.templateId ?? 'balanced');
  return `<span class="game-art case-scene raster-case-scene" aria-hidden="true">${characterPortrait(templateId)}</span>`;
}

const EVENT_TONES = Object.freeze({
  'A01-A': 'good', 'A01-B': 'warn', 'A01-C': 'mixed', 'A01-D': 'warn',
  'A02-A': 'good', 'A02-B': 'warn', 'A02-C': 'mixed', 'A03-A': 'good', 'A03-B': 'mixed', 'A03-C': 'good',
  'A04-A': 'good', 'A04-B': 'warn', 'A04-C': 'mixed', 'A05-A': 'good', 'A05-B': 'warn', 'A05-C': 'warn',
  'A06-A': 'mixed', 'A06-B': 'good', 'A06-C': 'mixed', 'A07-A': 'good', 'A07-B': 'warn', 'A07-C': 'warn',
  'A08-A': 'good', 'A08-B': 'warn', 'A08-C': 'mixed', 'A09-A': 'mixed', 'A09-B': 'good', 'A09-C': 'good',
  'A10-A': 'good', 'A10-B': 'warn', 'A10-C': 'mixed', 'A11-A': 'good', 'A11-B': 'mixed', 'A11-C': 'good',
});

export function eventTone(eventId) {
  return EVENT_TONES[eventId] ?? 'mixed';
}

export function processIcon(kind, tone = 'mixed') {
  const glyphs = {
    player: '<path d="M29 29h70v47H58L39 92l4-16H29zM47 46h34M47 59h25"/>',
    response: '<path d="M32 30h64v62H32zM45 45h38M45 60h27M45 75h33M104 53l18 12-18 12z"/>',
    follow: '<circle cx="59" cy="57" r="29"/><path d="M80 79l25 25M50 57h18M59 48v18"/>',
    consequence: '<path d="M31 78l25-31 19 18 22-31 25 44zM34 95h87"/><path d="M51 103h54"/>',
  };
  return svg(`process-icon tone-${safeId(tone)}`, `<g class="ink paper-fill">${glyphs[kind] ?? glyphs.player}</g>`, '0 0 140 120');
}

export function endingIllustration(baseId, facets = [], templateId = 'balanced') {
  const id = safeId(baseId);
  const tier = ['E01', 'E02', 'E03', 'E06'].includes(id) ? 'formal' : id === 'E04' ? 'limited' : id === 'E05' ? 'showcase' : id === 'E07' ? 'handoff' : 'stop';
  const centers = {
    formal: '<path class="screen-fill ink" d="M76 45h168v91H76z"/><path class="ink" d="M60 154h200l-16-18H76z"/><path class="ink accent-fill" d="M128 84l22 22 45-48"/>',
    limited: '<path class="paper-fill ink" d="M102 41h116v112H102z"/><path class="ink" d="M127 41v38l-25 48q-13 26 18 26h80q31 0 18-26l-25-48V41"/><path class="accent-fill ink" d="M119 120h82"/>',
    showcase: '<path class="paper-fill ink" d="M61 42h198v111H61z"/><path class="accent-fill ink" d="M82 121l36-43 28 27 31-40 60 56z"/><circle class="star-fill ink" cx="218" cy="68" r="13"/>',
    handoff: '<path class="paper-fill ink" d="M60 65h91l17 19h92v72H60z"/><path class="ink accent-fill" d="M128 111h65M160 87v48"/>',
    stop: '<path class="screen-fill ink" d="M71 48h178v91H71z"/><path class="ink" d="M57 158h206l-14-19H71z"/><path class="ink accent-fill" d="M139 78h42v42h-42z"/>',
  };
  const extras = [
    facets.includes('token-rich') || facets.includes('token-gravekeeper') ? '<g class="coin-stack"><ellipse class="star-fill ink" cx="268" cy="151" rx="24" ry="8"/><path class="star-fill ink" d="M244 130v21q0 8 24 8t24-8v-21"/><ellipse class="star-fill ink" cx="268" cy="130" rx="24" ry="8"/></g>' : '',
    facets.includes('on-time') ? '<g class="deadline-clock"><circle class="paper-fill ink" cx="55" cy="142" r="27"/><path class="ink" d="M55 122v21l14 9M43 108h24"/></g>' : '',
    facets.includes('high-stress') ? '<path class="danger-line" d="M48 112q-24-18 0-36t0-36"/>' : '',
    facets.includes('recovered') ? '<path class="paper-fill ink" d="M33 39l39-11 9 31-39 11zM43 45l28-8M53 36l8 27"/>' : '',
  ].join('');
  const officeBackdrop = '<path class="accent-soft ink" d="M20 26h280v148H20z"/><path class="paper-fill ink" d="M35 41h92v68H35z"/><path class="thin" d="M48 57h62M48 73h46M48 89h57"/><circle class="paper-fill ink" cx="270" cy="55" r="20"/><path class="ink" d="M270 43v14l10 6"/><path class="desk-fill ink" d="M29 151h262v23H29z"/>';
  const expression = tier === 'formal' ? 'relieved' : tier === 'stop' ? 'worried' : 'skeptical';
  return `<span class="game-art ending-illustration raster-ending ending-${tier}" aria-hidden="true">${characterPortrait(templateId, expression)}<i class="ending-emblem">${tier === 'formal' ? '✓' : tier === 'limited' ? '△' : tier === 'showcase' ? '★' : tier === 'handoff' ? '→' : '■'}</i></span>`;
}

