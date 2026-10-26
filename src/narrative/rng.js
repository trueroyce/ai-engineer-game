export function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function unitFor(seed, key) {
  return hash32(`${seed}:${key}`) / 0x100000000;
}

export function weightedPick(items, weights, unit) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error('沒有合法事件');
  let cursor = unit * total;
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i];
    if (cursor < 0) return items[i];
  }
  return items.at(-1);
}
