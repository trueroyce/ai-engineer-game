// 黃金重播：rush_revised（T3）。資料逐字抄自 design.md D12，
// 來源 docs/canonical/text-playtest.md §3「T3完整18回合示例」表，不由引擎產生。
// 欄位：turn 回合、age 本動作是該案第幾個行動、s 成功骰、h 秘密骰、P/H/K、B/N、T/S、xp/lv/score、tools 動作（含升級）後持有。
export default {
  name: 'rush_revised',
  source: 'docs/canonical/text-playtest.md §3 rush_revised（T3）',
  attributes: { A: 2, E: 2, V: 2 },
  successDice: [76, 23, 93, 10, 40, 84, 3, 25, 68, 99, 8, 96],
  defectDice: [55, 49, 100, 29, 26, 87, 93, 74, 57],
  opening: { candidates: ['C1', 'C2', 'C5', 'C4'], pick: ['C5', 'C2'] },
  levelDrafts: [
    { turn: 3, candidates: [['C4', 'new'], ['C5', 'upgrade'], ['C1', 'new']], choice: { type: 'take', cardId: 'C4' } },
    { turn: 5, candidates: [['C1', 'new'], ['C4', 'upgrade'], ['C3', 'new']], choice: { type: 'take', cardId: 'C4' } },
    { turn: 16, candidates: [['C3', 'new'], ['C6', 'new'], ['C1', 'new']], choice: { type: 'forfeit' } },
  ],
  turns: [
    { turn: 1, age: 1, project: 'J1', accept: 'J1', action: 'rush', toggles: { C2: true }, cost: 3, s: [1, 76, 60, false], h: [1, 55, 40, false], P: 1, H: 0, K: 0, B: 0, N: 0, T: 15, S: 2, xp: 0, lv: 1, score: 0, tools: [['C5', 1], ['C2', 1]], tags: [] },
    { turn: 2, age: 2, project: 'J1', action: 'rush', toggles: { C2: true }, cost: 3, s: [2, 23, 60, true], h: [2, 49, 40, false], P: 4, H: 0, K: 0, B: 0, N: 0, T: 12, S: 4, xp: 2, lv: 1, score: 0, tools: [['C5', 1], ['C2', 1]], tags: ['half', 'full'] },
    { turn: 3, age: 3, project: 'J1', action: 'deliver', toggles: {}, cost: 0, P: 4, H: 0, K: 0, B: 0, N: 0, T: 18, S: 4, xp: 5, lv: 2, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 1]], tags: ['quality', 'delivery', 'delivered'] },
    { turn: 4, age: 1, project: 'J2', accept: 'J2', action: 'rush', toggles: { C2: true }, cost: 3, s: [3, 93, 45, false], h: [3, 100, 40, false], P: 1, H: 0, K: 0, B: 0, N: 0, T: 15, S: 6, xp: 5, lv: 2, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 1]], tags: [] },
    { turn: 5, age: 2, project: 'J2', action: 'rush', toggles: { C2: true }, cost: 3, s: [4, 10, 40, true], h: [4, 29, 40, true], P: 4, H: 1, K: 0, B: 0, N: 0, T: 12, S: 8, xp: 6, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: ['half'] },
    { turn: 6, age: 3, project: 'J2', action: 'implement', toggles: { C2: true }, cost: 2, s: [5, 40, 50, true], h: [5, 26, 20, false], P: 6, H: 1, K: 0, B: 0, N: 0, T: 10, S: 9, xp: 7, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: ['full'] },
    { turn: 7, age: 4, project: 'J2', action: 'rest', toggles: {}, cost: 0, P: 6, H: 1, K: 0, B: 0, N: 0, T: 15, S: 6, xp: 7, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: [] },
    { turn: 8, age: 5, project: 'J2', action: 'deliver', toggles: {}, cost: 0, P: 6, H: 1, K: 0, B: 0, N: 0, T: 15, S: 7, xp: 7, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: ['rejected'] },
    { turn: 9, age: 6, project: 'J2', action: 'verify', toggles: {}, cost: 2, s: [6, 84, 50, false], P: 6, H: 1, K: 0, B: 0, N: 0, T: 13, S: 7, xp: 7, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: [] },
    { turn: 10, age: 7, project: 'J2', action: 'verify', toggles: {}, cost: 2, s: [7, 3, 50, true], P: 6, H: 0, K: 1, B: 0, N: 0, T: 11, S: 7, xp: 8, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: ['quality', 'revealed:1'] },
    { turn: 11, age: 8, project: 'J2', action: 'repair', toggles: {}, cost: 2, s: [8, 25, 70, true], P: 6, H: 0, K: 0, B: 0, N: 0, T: 9, S: 9, xp: 8, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: ['expired'] },
    { turn: 12, age: 1, project: 'J3', accept: 'J3', action: 'rest', toggles: {}, cost: 0, P: 0, H: 0, K: 0, B: 0, N: 0, T: 14, S: 6, xp: 8, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: [] },
    { turn: 13, age: 2, project: 'J3', action: 'rush', toggles: { C2: true }, cost: 3, s: [9, 68, 30, false], h: [6, 87, 40, false], P: 1, H: 0, K: 0, B: 0, N: 0, T: 11, S: 8, xp: 8, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: [] },
    { turn: 14, age: 3, project: 'J3', action: 'rest', toggles: {}, cost: 0, P: 1, H: 0, K: 0, B: 0, N: 0, T: 16, S: 5, xp: 8, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: [] },
    { turn: 15, age: 4, project: 'J3', action: 'rush', toggles: { C2: true }, cost: 3, s: [10, 99, 35, false], h: [7, 93, 40, false], P: 2, H: 0, K: 0, B: 0, N: 0, T: 13, S: 7, xp: 8, lv: 3, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: [] },
    { turn: 16, age: 5, project: 'J3', action: 'rush', toggles: { C2: true }, cost: 3, s: [11, 8, 30, true], h: [8, 74, 40, false], P: 5, H: 0, K: 0, B: 0, N: 0, T: 10, S: 9, xp: 9, lv: 4, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: ['half'] },
    { turn: 17, age: 6, project: 'J3', action: 'rest', toggles: {}, cost: 0, P: 5, H: 0, K: 0, B: 0, N: 0, T: 15, S: 6, xp: 9, lv: 4, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: [] },
    { turn: 18, age: 7, project: 'J3', action: 'rush', toggles: { C2: true }, cost: 3, s: [12, 96, 30, false], h: [9, 57, 40, false], P: 6, H: 0, K: 0, B: 0, N: 0, T: 12, S: 8, xp: 9, lv: 4, score: 2, tools: [['C5', 1], ['C2', 1], ['C4', 2]], tags: ['deadline'] },
  ],
  final: {
    score: 2, xp: 9, level: 4, token: 12, stress: 8, ending: '初階接案', endReason: 'deadline',
    equipped: [['C5', 1], ['C2', 1], ['C4', 2]],
    statuses: { J1: 'delivered', J2: 'expired', J3: 'active' },
  },
};
