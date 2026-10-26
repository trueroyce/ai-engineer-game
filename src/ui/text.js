// 玩家事件 → 結果文字。只接受玩家視圖的事件（不含 H 與秘密骰）。
import { RULES } from '../core/rules.js';

const MILESTONE_TEXT = { half: '半程 XP +1', full: '滿值 XP +1', quality: '品質 XP +1', delivery: '交付 XP +2' };
const STATUS_TEXT = { unaccepted: '未接', active: '進行中', delivered: '已交付', expired: '逾期', abandoned: '已放棄' };

export function cardLabel(id, level) {
  return `${id} ${RULES.cards[id].name} L${level}`;
}

export function projectLabel(id) {
  return `${id} ${RULES.projects[id].name}`;
}

export function statusText(status) {
  return STATUS_TEXT[status] ?? status;
}

function changes(ev) {
  const b = ev.before;
  const a = ev.after;
  const parts = [`Token ${b.token}→${a.token}`, `壓力 ${b.stress}→${a.stress}`];
  const pid = b.activeProject;
  if (pid) {
    const pb = b.projects[pid];
    const pa = a.projects[pid];
    if (pb.progress !== pa.progress) parts.push(`進度 ${pb.progress}→${pa.progress}`);
    if (pb.knownDefects !== pa.knownDefects) parts.push(`已知缺陷 ${pb.knownDefects}→${pa.knownDefects}`);
    if (pb.preparationBonus !== pa.preparationBonus || pb.preparationUses !== pa.preparationUses) {
      parts.push(`準備 B${pb.preparationBonus}/N${pb.preparationUses}→B${pa.preparationBonus}/N${pa.preparationUses}`);
    }
  }
  return parts.join('、');
}

function noteText(n) {
  switch (n.kind) {
    case 'levelUp': return `升到 Lv${n.to}，請選擇升級獎勵`;
    case 'expired': return `${projectLabel(n.projectId)} 逾期（壓力 +${n.stressDelta}）`;
    case 'crash': return `壓力達 ${n.stress}，崩潰`;
    case 'deadline': return `第 ${n.turn} 回合結束，期限結算`;
    default: return '';
  }
}

function actionHead(ev) {
  const o = ev.outcome;
  const name = RULES.actions[ev.action].name;
  const die = ev.dice.find((d) => d.stream === 'success');
  const roll = die ? `：骰 ${die.value} ${die.value <= ev.p ? '≤' : '>'} ${ev.p} ${o.success ? '成功' : '失敗'}` : '';
  switch (ev.action) {
    case 'analyze': return `${name}${roll}，準備 B${o.B}／N${o.N}`;
    case 'implement':
    case 'rush': return `${name}${roll}，進度 +${o.progressGained}`;
    case 'verify': return o.success ? `${name}${roll}，定位 ${o.revealed} 個問題` : `${name}${roll}。${o.message}`;
    case 'repair': return `${name}${roll}，${o.success ? '已知缺陷 −1' : '已知缺陷不變'}`;
    case 'rest': return `${name}：Token +${o.tokenGained}、壓力 ${o.stressChange}`;
    case 'deliver': return `${name}：${o.message}`;
    default: return name;
  }
}

export function formatEvent(ev) {
  const lines = [];
  switch (ev.type) {
    case 'setAttributes': {
      const a = ev.outcome.attributes;
      lines.push(`能力設定 A${a.A}／E${a.E}／V${a.V}`);
      break;
    }
    case 'chooseOpening':
      lines.push(`開局工具：${ev.outcome.equipped.map((c) => cardLabel(c.id, c.level)).join('、')}`);
      break;
    case 'accept':
      lines.push(`接案：${projectLabel(ev.outcome.projectId)}`);
      break;
    case 'abandon':
      lines.push(`放棄 ${projectLabel(ev.outcome.projectId)}（壓力 +${ev.outcome.stressDelta}）`);
      break;
    case 'earlySettle':
      lines.push(`提前結算：分數 ${ev.outcome.score}`);
      break;
    case 'chooseDraft': {
      const o = ev.outcome;
      if (o.choice === 'forfeit') lines.push('升級選擇：放棄本次獎勵');
      else if (o.kind === 'upgrade') lines.push(`升級選擇：${o.cardId} 升為 L2`);
      else lines.push(`升級選擇：取得 ${cardLabel(o.cardId, 1)}${o.replaced ? `，替換 ${o.replaced}` : ''}`);
      break;
    }
    case 'action':
      lines.push(actionHead(ev));
      lines.push(changes(ev));
      if (ev.outcome.milestones.length) lines.push(ev.outcome.milestones.map((m) => MILESTONE_TEXT[m]).join('、'));
      break;
    default:
      lines.push(ev.type);
  }
  for (const n of ev.notes) {
    const t = noteText(n);
    if (t) lines.push(t);
  }
  return `${lines.map((l) => l.replace(/。+$/, '')).join('。')}。`;
}
