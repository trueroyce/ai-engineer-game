import { characterPortrait } from '../narrative-ui/art.js';

const svg = (className, body, viewBox = '0 0 320 190') => `<svg class="${className}" viewBox="${viewBox}" role="img" aria-label="案件 02 資料整合情境插畫">${body}</svg>`;

const scenes = Object.freeze({
  B01: '<path class="paper" d="M20 28h78v116H20zM121 38h78v106h-78zM222 20h78v124h-78z"/><path d="M34 50h48M34 68h39M34 86h52M136 59h48M136 77h35M136 95h48M237 45h48M237 63h38M237 81h49"/><path class="accent" d="M61 153h197M92 143v20M160 143v20M228 143v20"/>',
  B02: '<path class="paper" d="M18 29h68v105H18zM126 29h68v105h-68zM234 29h68v105h-68z"/><path class="accent" d="M52 146l108 29 108-29M52 134v19M160 134v41M268 134v19"/><path d="M31 49h42M31 66h33M139 49h42M139 66h33M247 49h42M247 66h33"/>',
  B03: '<path class="paper" d="M26 27h84v112H26zM210 27h84v112h-84z"/><path class="screen" d="M122 61h76v66h-76z"/><path class="accent" d="M109 75h13M198 75h13M109 111h13M198 111h13"/><path d="M43 53h49M43 72h37M43 91h49M227 53h49M227 72h37M227 91h49M139 79h43M139 98h31"/>',
  B04: '<path class="paper" d="M63 27h194v128H63z"/><path d="M85 52h113M85 72h149M85 92h122M85 112h98"/><path class="danger" d="M217 45l25 25M242 45l-25 25"/><path class="accent" d="M215 116l12 12 24-30"/>',
  B05: '<path class="paper" d="M45 33h230v119H45z"/><path d="M69 57h83M69 77h60M69 97h83"/><path class="accent" d="M183 55h67v69h-67zM196 69l39 39M235 69l-39 39"/>',
  B06: '<path class="paper" d="M41 26h238v135H41z"/><path d="M68 53l11 11 20-25M68 84l11 11 20-25M68 115l11 11 20-25M113 53h135M113 84h103M113 115h123"/><path class="accent" d="M232 131l17 17 28-38"/>',
  B07: '<circle class="paper" cx="133" cy="90" r="58"/><circle class="screen" cx="133" cy="90" r="30"/><path class="accent" d="M175 132l52 39M221 34v85M221 34l-18 18M221 34l18 18"/><path d="M70 158h181"/>',
  B08: '<path class="paper" d="M54 43h212v100H54z"/><path d="M76 67h79M76 87h60M76 107h79"/><path class="accent" d="M199 66q37 21 0 42M199 108l9-16-18 1"/><path d="M162 36v114"/>',
  B09: '<path class="screen" d="M50 34h220v112H50z"/><path class="paper" d="M78 57h164v66H78z"/><path class="accent" d="M119 88l25 25 56-60"/><path d="M35 164h250"/>',
  B10: '<path class="paper" d="M35 39h74v105H35zM124 39h74v105h-74zM213 39h74v105h-74z"/><path class="accent" d="M72 83h52M198 83h15M72 144l39-29M161 144v-29M250 144l-39-29"/><path d="M50 61h44M139 61h44M228 61h44"/>',
  B11: '<path class="screen" d="M40 35h240v112H40z"/><path class="paper" d="M58 57h62v65H58zM129 57h62v65h-62zM200 57h62v65h-62z"/><path class="accent" d="M74 91l12 12 23-30M145 91h30M216 79l30 30M246 79l-30 30"/>',
  B12: '<path class="paper" d="M43 35h234v117H43z"/><path d="M64 58h91M64 80h70M64 102h91"/><path class="accent" d="M194 58h51v51h-51zM203 83l11 11 23-29"/><path class="danger" d="M181 132h78"/>',
});

const cast = Object.freeze({
  B01: ['小陳｜資料窗口', '先定義哪份才是 final'], B02: ['串串｜模擬 agent', 'agent 不會讀心'], B03: ['串串｜模擬 agent', '三份真相在 join 口碰面'],
  B04: ['米娜｜客服代表', '17:58 的退款插單'], B05: ['小陳｜資料窗口', '被刪的列不會自己回來'], B06: ['串串｜模擬 agent', '測試只負責照出缺口'],
  B07: ['小陳｜資料窗口', '這個數字從哪裡來'], B08: ['串串｜模擬 agent', '先喘一口再合併'], B09: ['米娜｜客服代表', '限制要寫在交付上'],
  B10: ['小陳｜資料窗口', '把失敗縮成可救範圍'], B11: ['米娜｜客服代表', '臨時表也順手帶進去？'],
  B12: ['串串｜模擬 agent', '早先的決定回來敲門'],
});

function castFocus(actionId) {
  const [name, line] = cast[actionId] ?? cast.B03;
  return `<g class="cast-focus"><circle class="agent-face" cx="31" cy="29" r="17"/><path class="speech" d="M52 10h149v38H52zM52 35l-14 13 23-5"/><text class="actor-name" x="61" y="26">${name}</text><text class="actor-line" x="61" y="41">${line}</text></g>`;
}

function toneMark(tone) {
  if (tone === 'good') return '<g class="tone-mark tone-mark-good"><circle cx="283" cy="30" r="22"/><path d="M270 30l9 9 17-21"/></g>';
  if (tone === 'warn') return '<g class="tone-mark tone-mark-warn"><path d="M283 8l25 44h-50z"/><path d="M283 21v15M283 43v1"/></g>';
  if (tone === 'bad') return '<g class="tone-mark tone-mark-bad"><circle cx="283" cy="30" r="22"/><path d="M271 18l24 24M295 18l-24 24"/></g>';
  return '';
}

export function case02ActionArt(actionId, tone = 'mixed', { showCast = true } = {}) {
  return svg(`case-art case02-art tone-${tone}`, `<rect class="backdrop" x="7" y="7" width="306" height="176" rx="18"/>${scenes[actionId] ?? scenes.B03}${showCast ? castFocus(actionId) : ''}${toneMark(tone)}`);
}

export function case02StatusArt(view) {
  const debt = Math.min(5, (view.preIntegrationDebt ?? 0) + (view.integration?.unresolvedDebt ?? 0));
  const debtBars = Array.from({ length: 5 }, (_, index) => `<rect class="${index < debt ? 'danger' : 'muted'}" x="${200 + index * 17}" y="${145 - index * 12}" width="11" height="${22 + index * 12}"/>`).join('');
  return svg('case-art case02-status', `<rect class="backdrop" x="7" y="7" width="306" height="176" rx="18"/><path class="paper" d="M25 35h73v104H25zM123 35h73v104h-73zM221 35h73v104h-73z"/><path d="M38 58h47M38 76h35M136 58h47M136 76h35M234 58h47M234 76h35"/><path class="accent" d="M61 151h198M61 139v23M160 139v23"/>${debtBars}<text x="24" y="26">THREE SOURCES / ONE TRUTH</text>`);
}

export function case02EndingArt(baseId, templateId = 'balanced') {
  const good = baseId === 'C02-VERIFIED';
  const limited = baseId === 'C02-LIMITED';
  const tone = good ? 'good' : limited ? 'warn' : 'bad';
  const symbol = good ? '✓' : limited ? '!' : '×';
  const label = good ? '多智慧體資料已驗證' : limited ? '限制條件下完成整合' : '整合結果未通過';
  const expression = good ? 'relieved' : limited ? 'skeptical' : 'worried';
  return `<span class="case-art case02-art ending-case-art raster-case-ending ${tone}" style="--ending-image:url('./assets/art/backgrounds/case02-data-room.png')" role="img" aria-label="${label}">${characterPortrait(templateId, expression)}<i class="ending-emblem" aria-hidden="true">${symbol}</i></span>`;
}

export function case02Tone(result) {
  if (result?.attempt?.outcome === 'failure' || /failed|collision|unresolved/.test(result?.outcome ?? '')) return 'bad';
  if (result?.attempt?.outcome === 'partial' || /limited|findings/.test(result?.outcome ?? '')) return 'warn';
  return 'good';
}
