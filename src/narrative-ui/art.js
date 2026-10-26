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

export function characterPortrait(templateId) {
  const id = safeId(templateId);
  const [primary, secondary] = palette[id] ?? palette.balanced;
  return svg(`portrait portrait-${id}`, `
    <rect class="paper-fill ink" x="13" y="13" width="294" height="174" rx="24"/>
    <path class="desk-fill ink" d="M23 151h274v36H23z"/>
    <circle class="accent-soft" cx="112" cy="86" r="62" style="--art-soft:${secondary}"/>
    <path class="ink hair-fill" d="M78 88q0-51 39-51 43 0 44 51l-15-6-8-24-22 14-25-6z"/>
    <path class="ink skin-fill" d="M84 78q0 60 33 60t35-60q-21-3-35-21-12 17-33 21z"/>
    <circle class="solid-ink" cx="104" cy="91" r="4"/><circle class="solid-ink" cx="134" cy="91" r="4"/>
    <path class="ink" d="M107 112q12 10 24 0"/>
    <path class="ink accent-fill" d="M68 169q4-42 49-42 47 0 52 42z" style="--art-accent:${primary}"/>
    <path class="ink paper-fill" d="M143 132h51l12 37h-59z"/><path class="ink" d="M153 143h34M157 153h29"/>
    ${portraitProps[id] ?? portraitProps.balanced}
  `);
}

const cardGlyphs = Object.freeze({
  C1: '<path class="ink paper-fill" d="M62 46h147v104H62z"/><path class="thin" d="M78 62h115M78 78h63M78 94h115M78 110h84"/><circle class="ink accent-fill" cx="221" cy="132" r="35"/><path class="ink" d="M206 132l11 11 22-27"/>',
  C2: '<path class="ink accent-fill" d="M145 35q48 31 39 86l-42 34-31-31 34-89z"/><circle class="ink paper-fill" cx="151" cy="82" r="14"/><path class="ink paper-fill" d="M112 114l-37 9 21 21zM148 151l-9 36 28-21z"/><path class="ink fire-fill" d="M113 151q-26 2-34 27 27 2 39-20z"/>',
  C3: '<circle class="ink paper-fill" cx="132" cy="101" r="59"/><path class="ink" d="M174 143l49 44"/><path class="ink accent-fill" d="M104 84h55v44h-55z"/><path class="thin" d="M114 96h35M114 108h23M120 74v10M144 74v10M120 128v12M144 128v12"/>',
  C4: '<path class="ink paper-fill" d="M71 49h78v111H71z"/><path class="thin" d="M85 69h50M85 88h38M85 107h50"/><path class="ink accent-fill" d="M184 60l22 22-71 72-29 7 7-29z"/><path class="ink" d="M174 70l22 22"/>',
  C5: '<path class="ink accent-fill" d="M67 89h116v48q0 42-58 42t-58-42z"/><path class="ink paper-fill" d="M183 102h29q25 0 25 23t-29 23h-26"/><path class="ink" d="M97 69q-12-17 2-31M127 69q-12-17 2-31M157 69q-12-17 2-31"/>',
  C6: '<path class="ink paper-fill" d="M64 43h143v125H64z"/><path class="ink accent-fill" d="M105 30h61v29h-61z"/><path class="ink" d="M85 83l10 10 18-22M85 116l10 10 18-22M124 83h59M124 116h59M124 145h42"/>',
});

export function cardIllustration(cardId, level = 1) {
  const id = safeId(cardId);
  const stars = level > 1
    ? '<path class="star-fill ink" d="M251 41l7 14 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z"/>'
    : '<circle class="accent-soft ink" cx="251" cy="61" r="15"/>';
  return svg(`card-illustration card-${id.toLowerCase()} level-${level}`, `
    <rect class="card-art-bg ink" x="12" y="12" width="296" height="176" rx="21"/>
    <path class="halftone" d="M222 30h67v138h-67z"/>
    ${cardGlyphs[id] ?? cardGlyphs.C1}${stars}
  `);
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
  const completed = view.progress.checks.filter((check) => /通過|完成|有效/.test(check.status)).length;
  const lamps = Array.from({ length: 6 }, (_, index) => `<circle class="ink ${index < completed ? 'lamp-on' : 'lamp-off'}" cx="${75 + index * 24}" cy="145" r="7"/>`).join('');
  return svg('case-scene', `
    <path class="shadow-fill" d="M28 164h264v20H28z"/>
    <path class="paper-fill ink" d="M42 33h104v110H42z"/><path class="thin" d="M58 55h69M58 73h53M58 91h69M58 109h42"/>
    <path class="tape-fill" d="M76 24h38v18H76z"/>
    <path class="screen-fill ink" d="M156 48h127v82H156z"/><path class="ink" d="M142 145h155l-14-15H156z"/>
    <path class="accent-line" d="M177 72h77M177 91h45M177 110h62"/>
    ${lamps}<path class="ink accent-fill" d="M247 22l20 7-5 20-20-7z"/><path class="thin" d="M250 31l10 4"/>
  `);
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

export function endingIllustration(baseId, facets = []) {
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
    facets.includes('high-stress') ? '<path class="danger-line" d="M48 112q-24-18 0-36t0-36"/>' : '',
    facets.includes('recovered') ? '<path class="paper-fill ink" d="M33 39l39-11 9 31-39 11zM43 45l28-8M53 36l8 27"/>' : '',
  ].join('');
  return svg(`ending-illustration ending-${tier}`, `<path class="accent-soft" d="M21 28h278v145H21z"/>${centers[tier]}${extras}`);
}

