import { characterPortrait } from '../narrative-ui/art.js';

const svg = (className, body, viewBox = '0 0 320 190') => `<svg class="${className}" viewBox="${viewBox}" role="img" aria-label="案件 03 客戶與 NPC 協作情境插畫">${body}</svg>`;

const scenes = Object.freeze({
  C01: '<circle class="client" cx="69" cy="66" r="24"/><circle class="designer" cx="160" cy="66" r="24"/><circle class="engineer" cx="251" cy="66" r="24"/><path class="paper" d="M37 104h246v50H37z"/><path d="M55 122h75M55 139h49M146 122h57M219 122h46"/><path class="accent" d="M93 67h42M185 67h42"/>',
  C02: '<path class="paper" d="M42 29h236v129H42z"/><path d="M66 53h106M66 73h168M66 93h134M66 113h151"/><path class="accent" d="M205 43h53v53h-53zM215 68l10 10 22-27"/><path d="M93 145v21M227 145v21"/>',
  C03: '<path class="screen" d="M31 35h113v104H31zM176 35h113v104H176z"/><path d="M49 58h78M49 78h56M194 58h78M194 78h56"/><path class="accent" d="M143 71h34M143 104h34M160 55v65"/><circle class="client" cx="160" cy="147" r="18"/>',
  C04: '<path class="paper" d="M33 33h105v105H33zM182 33h105v105H182z"/><path class="accent" d="M138 61h44M138 108h44"/><path d="M53 55h65M53 75h48M202 55h65M202 75h48"/><path class="danger" d="M139 84l42 0"/>',
  C05: '<circle class="client" cx="80" cy="73" r="29"/><path class="paper" d="M132 35h154v109H132z"/><path d="M151 58h111M151 78h84M151 98h104"/><path class="accent" d="M61 117h183M232 104l16 13-16 13"/>',
  C06: '<path class="paper" d="M42 27h236v137H42z"/><path d="M69 53l10 10 18-22M69 84l10 10 18-22M69 115l10 10 18-22M112 53h130M112 84h103M112 115h118"/><path class="accent" d="M225 129l17 17 29-39"/>',
  C07: '<path class="screen" d="M51 36h218v112H51z"/><path class="paper" d="M76 58h168v68H76z"/><circle class="client" cx="104" cy="92" r="17"/><circle class="designer" cx="160" cy="92" r="17"/><circle class="engineer" cx="216" cy="92" r="17"/><path class="accent" d="M102 154h116"/>',
  C08: '<path class="paper" d="M55 40h210v105H55z"/><path d="M78 62h68M78 82h52M78 102h68"/><path class="accent" d="M203 58q42 27 0 56M203 114l10-18-20 2"/><path class="danger" d="M168 47v89"/>',
  C09: '<path class="paper" d="M45 38h230v110H45z"/><circle class="client" cx="88" cy="89" r="25"/><path class="screen" d="M132 58h115v66H132z"/><path class="accent" d="M102 89h30M158 77h62M158 99h45"/>',
  C10: '<path class="screen" d="M35 36h250v111H35z"/><path class="paper" d="M53 55h68v69H53zM126 55h68v69h-68zM199 55h68v69h-68z"/><path class="accent" d="M69 88l12 12 24-29M143 88h34M215 76l36 36M251 76l-36 36"/>',
  C11: '<path class="paper" d="M43 35h234v117H43z"/><circle class="client" cx="83" cy="86" r="23"/><path class="screen" d="M126 55h126v67H126z"/><path class="accent" d="M150 75h78M150 98h52"/><path class="danger" d="M107 86h19"/>',
});

const cast = Object.freeze({
  C01: ['客戶阿改', '「只改一點」共三點'], C02: ['設計師小美', '先把介面契約簽了'], C03: ['工程師老周', '分工不是分散責任'],
  C04: ['Reviewer 小莫', '合併前先對證據'], C05: ['客戶阿改', '下午四點又想到'], C06: ['QA 阿驗', 'revision 變了就重驗'],
  C07: ['三方會議', '交付責任要有名字'], C08: ['救火隊長', '修債不修飾太平'],
  C09: ['原型桌', '先讓客戶按了再吵'], C10: ['成功誘惑', '只多一個功能，真的'],
  C11: ['責任會議', '決策債與工程債分開算'],
});

function castFocus(actionId) {
  const [name, line] = cast[actionId] ?? cast.C01;
  return `<g class="cast-focus"><circle class="speaker-face" cx="31" cy="29" r="17"/><path class="speech" d="M52 10h170v38H52zM52 35l-14 13 23-5"/><text class="actor-name" x="61" y="26">${name}</text><text class="actor-line" x="61" y="41">${line}</text></g>`;
}

function toneMark(tone) {
  if (tone === 'good') return '<g class="tone-mark tone-mark-good"><circle cx="283" cy="30" r="22"/><path d="M270 30l9 9 17-21"/></g>';
  if (tone === 'warn') return '<g class="tone-mark tone-mark-warn"><path d="M283 8l25 44h-50z"/><path d="M283 21v15M283 43v1"/></g>';
  if (tone === 'bad') return '<g class="tone-mark tone-mark-bad"><circle cx="283" cy="30" r="22"/><path d="M271 18l24 24M295 18l-24 24"/></g>';
  return '';
}

export function case03ActionArt(actionId, tone = 'mixed', { showCast = true } = {}) {
  return svg(`case-art case03-art tone-${tone}`, `<rect class="backdrop" x="7" y="7" width="306" height="176" rx="18"/>${scenes[actionId] ?? scenes.C01}${showCast ? castFocus(actionId) : ''}${toneMark(tone)}`);
}

export function case03StatusArt(view) {
  const contract = view.contract?.approved;
  const merge = view.merge?.complete;
  const evidence = view.evidence?.revision === view.artifactRevision;
  return svg('case-art case03-status', `<rect class="backdrop" x="7" y="7" width="306" height="176" rx="18"/><circle class="client" cx="62" cy="58" r="24"/><circle class="designer" cx="160" cy="58" r="24"/><circle class="engineer" cx="258" cy="58" r="24"/><path d="M86 58h50M184 58h50"/><path class="paper" d="M35 101h250v55H35z"/><path class="${contract ? 'accent' : 'muted'}" d="M57 127l10 10 19-24"/><path class="${merge ? 'accent' : 'muted'}" d="M130 127l10 10 19-24"/><path class="${evidence ? 'accent' : 'muted'}" d="M203 127l10 10 19-24"/><text x="37" y="92">CLIENT → DESIGN → ENGINEERING</text>`);
}

export function case03EndingArt(baseId, templateId = 'balanced') {
  const good = baseId === 'C03-VERIFIED';
  const limited = baseId === 'C03-LIMITED';
  const tone = good ? 'good' : limited ? 'warn' : 'bad';
  const symbol = good ? '✓' : limited ? '!' : '×';
  const label = good ? '驗收範圍與證據已完整對齊' : limited ? '限制範圍下交付' : '驗收範圍尚未對齊';
  const expression = good ? 'relieved' : limited ? 'skeptical' : 'worried';
  return `<span class="case-art case03-art ending-case-art raster-case-ending ${tone}" style="--ending-image:url('./assets/art/backgrounds/case03-client-room.png')" role="img" aria-label="${label}">${characterPortrait(templateId, expression)}<i class="ending-emblem" aria-hidden="true">${symbol}</i></span>`;
}

export function case03Tone(result) {
  if (result?.attempt?.outcome === 'failure' || /failed|unresolved|conflict/.test(result?.outcome ?? '')) return 'bad';
  if (result?.attempt?.outcome === 'partial' || /limited/.test(result?.outcome ?? '')) return 'warn';
  return 'good';
}
