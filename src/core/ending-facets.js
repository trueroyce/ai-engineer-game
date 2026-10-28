const clone = (value) => structuredClone(value);

export function composeEndingFacets(state) {
  const candidates = [];
  const add = (id, title, text, score) => candidates.push({ id, title, text, score });
  if ((state.token ?? 0) >= 10) add('token-miser', 'Token 守財奴', `結案時還抱著 ${state.token} Token；客戶沒看見效能，財務看見了愛。`, 90 + state.token);
  if ((state.token ?? 0) <= 2) add('last-token', '最後一枚 Token 騎士', '你把資源用到杯底，仍然留下能解釋的交接。', 82);
  if ((state.stress ?? 0) >= 8) add('burnout-comet', '壓力彗星', `壓力 ${state.stress}/10 滑過辦公室上空；下一案最好先喝水。`, 88 + state.stress);
  if ((state.stress ?? 0) <= 2) add('calm-operator', '冷靜操作員', '流程很亂，你的壓力表卻拒絕陪它一起演。', 70);
  const logs = state.log ?? [];
  const failures = logs.filter((item) => /fail|collision|drift|ambiguous|unresolved/i.test(String(item.outcome ?? ''))).length;
  if (failures >= 2) add('failure-archaeologist', '失敗考古學家', `你挖過 ${failures} 層失敗事件，最後帶著可追溯的化石離場。`, 86 + failures);
  if (logs.some((item) => ['B05', 'C08', 'A11'].includes(item.actionId))) add('repair-veteran', '補救路線老司機', '第一次不順沒有鎖死；你真的付成本把路修回來。', 85);
  const strategies = [state.normalization?.strategy, state.implementation?.strategy].filter(Boolean);
  if (strategies.includes('two') || strategies.includes('agent')) add('agent-conductor', '模擬 Agent 指揮家', '代理做了草稿，你負責 brief、整合與最後決策，沒有把責任丟給魔法。', 84);
  if (strategies.includes('solo')) add('solo-full-stack', '一人公司尾牙代表', '需求、實作、review 都自己來；尾牙抽獎仍然只有一張椅子。', 80);
  if ((state.integrationDebt ?? state.integration?.unresolvedDebt ?? 0) > 0) add('debt-collector', '整合債收藏家', '功能能走，債務也跟著走；至少你沒有把它改名叫「特色」。', 92);
  const cardTriggers = Number(state.cardUsage?.C14 ?? 0) + Number(state.cardUsage?.C15 ?? 0) + Number(state.cardUsage?.C16 ?? 0) + Number(state.attempts?.cardUsage?.C14 ?? 0);
  if (cardTriggers >= 2) add('overclock-chef', '卡片超頻料理長', `本局觸發 ${cardTriggers} 次強卡效果；數值浮誇，但每一口都有帳。`, 83 + cardTriggers);
  return clone(candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3).map(({ score: _score, ...facet }) => facet));
}
