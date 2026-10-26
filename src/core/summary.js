// 整局結算摘要：只讀玩家視圖（不含 H 與秘密骰）。
// 「兩個關鍵選擇」依 design.md D7 的固定優先序從事件紀錄挑出，每筆附事件序號；只描述事件，不評價優劣。
import { RULES } from './rules.js';

const label = (id) => `${id} ${RULES.projects[id].name}`;
const cardText = (id, lv) => `${id} ${RULES.cards[id].name} L${lv}`;

function noteOf(e, kind) {
  return e.notes.find((n) => n.kind === kind);
}

function describe(e, kind) {
  const head = `#${e.seq} 第 ${e.turn} 回合`;
  switch (kind) {
    case 'delivered':
      return `${head}交付 ${label(e.before.activeProject)}，分數 +${e.outcome.scoreGained}`;
    case 'rejected':
      return `${head}交付 ${label(e.before.activeProject)}被退件（仍有未定位問題）`;
    case 'expired':
      return `${head} ${label(noteOf(e, 'expired').projectId)}逾期（壓力 +${noteOf(e, 'expired').stressDelta}）`;
    case 'draft': {
      const o = e.outcome;
      if (o.choice === 'forfeit') return `${head}升級：放棄本次獎勵`;
      if (o.kind === 'upgrade') return `${head}升級：${o.cardId} 升為 L2`;
      return `${head}升級：取得 ${cardText(o.cardId, 1)}${o.replaced ? `，替換 ${o.replaced}` : ''}`;
    }
    case 'crash':
      return `${head}${e.type === 'abandon' ? '放棄專案' : RULES.actions[e.action]?.name ?? e.type}後壓力達 ${noteOf(e, 'crash').stress}，崩潰`;
    case 'rest':
      return `${head}在壓力 ${e.before.stress} 時休息`;
    default:
      return head;
  }
}

function pickFirst(events, reservedSeq) {
  const deliveries = events.filter((e) => e.action === 'deliver' && e.outcome.delivered);
  if (deliveries.length) {
    const best = deliveries.reduce((a, b) => (b.outcome.scoreGained > a.outcome.scoreGained ? b : a));
    return { seq: best.seq, text: describe(best, 'delivered') };
  }
  const fails = events.filter((e) => e.seq !== reservedSeq && ((e.action === 'deliver' && !e.outcome.delivered) || noteOf(e, 'expired')));
  if (!fails.length) return null;
  const last = fails.at(-1);
  return { seq: last.seq, text: describe(last, noteOf(last, 'expired') ? 'expired' : 'rejected') };
}

function pickSecond(events, excludeSeq) {
  const pool = events.filter((e) => e.seq !== excludeSeq);
  const drafts = pool.filter((e) => e.type === 'chooseDraft');
  if (drafts.length) return { seq: drafts.at(-1).seq, text: describe(drafts.at(-1), 'draft') };
  const crash = pool.find((e) => noteOf(e, 'crash'));
  if (crash) return { seq: crash.seq, text: describe(crash, 'crash') };
  const rests = pool.filter((e) => e.action === 'rest');
  if (!rests.length) return null;
  const top = rests.reduce((a, b) => (b.before.stress > a.before.stress ? b : a));
  return { seq: top.seq, text: describe(top, 'rest') };
}

export function settlementSummary(view) {
  const events = view.events;
  const delivered = events
    .filter((e) => e.action === 'deliver' && e.outcome.delivered)
    .map((e) => ({ projectId: e.before.activeProject, score: e.outcome.scoreGained, turn: e.turn, seq: e.seq }));
  const notDelivered = Object.values(view.projects)
    .filter((p) => p.status !== 'delivered' && p.status !== 'unaccepted')
    .map((p) => ({ projectId: p.projectId, status: p.status, progress: p.progress, target: RULES.projects[p.projectId].target }));
  const unaccepted = Object.values(view.projects).filter((p) => p.status === 'unaccepted').map((p) => p.projectId);
  // 第二項若要退回「導致崩潰的行動」，該事件保留給第二項，第一項改取其他退件／逾期，避免兩項指向同一事件。
  const crashSeq = events.some((e) => e.type === 'chooseDraft') ? null : events.find((e) => noteOf(e, 'crash'))?.seq;
  const first = pickFirst(events, crashSeq);
  const second = pickSecond(events, first?.seq);
  return {
    ending: view.ending,
    endReason: view.endReason,
    score: view.score,
    delivered,
    notDelivered,
    unaccepted,
    final: {
      attributes: view.attributes,
      equipped: view.equipped,
      token: view.token,
      stress: view.stress,
      xp: view.xp,
      level: view.level,
      turn: view.turn,
    },
    keyChoices: [first, second].filter(Boolean),
  };
}
