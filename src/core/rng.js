// 三條獨立亂數序列（公開成功骰、秘密缺陷骰、卡候選抽序）。
// 序列狀態是可 structuredClone 的純資料；每次抽取回傳新狀態，不就地修改。
// 正式遊玩：sfc32 + 拒絕取樣（均勻）；測試：注入固定序列，用盡即拋錯，不循環。

const TWO_POW_32 = 2 ** 32;

function splitmix32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

function sfc32Step(state) {
  let [a, b, c, d] = state;
  const t0 = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  const t = (t0 + d) | 0;
  c = (c + t) | 0;
  state[0] = a >>> 0;
  state[1] = b >>> 0;
  state[2] = c >>> 0;
  state[3] = d >>> 0;
  return t >>> 0;
}

function seededState(seed) {
  const sm = splitmix32(seed);
  const state = [sm(), sm(), sm(), sm()];
  for (let i = 0; i < 12; i++) sfc32Step(state);
  return state;
}

// 以拒絕取樣取 [0, n) 的均勻整數；next() 需回傳 32 位元無號整數。
export function uniformBelow(next, n) {
  if (!Number.isInteger(n) || n <= 0 || n > TWO_POW_32) throw new Error(`uniformBelow: n 不合法 ${n}`);
  const limit = Math.floor(TWO_POW_32 / n) * n;
  for (;;) {
    const x = next();
    if (x < limit) return x % n;
  }
}

function isDie(v) {
  return Number.isInteger(v) && v >= 1 && v <= 100;
}

export function createStream(config) {
  if (config && Array.isArray(config.values)) {
    for (const v of config.values) {
      if (!Array.isArray(v) && !isDie(v)) throw new Error(`注入骰值必須是 1..100 的整數，得到 ${v}`);
    }
    return { kind: 'injected', values: structuredClone(config.values), cursor: 0 };
  }
  if (config && Number.isInteger(config.seed)) {
    const seed = config.seed >>> 0;
    return { kind: 'seeded', seed, state: seededState(seed), cursor: 0 };
  }
  throw new Error('序列設定須為 { seed } 或 { values }');
}

export function createStreams(config) {
  return {
    success: createStream(config.success),
    defect: createStream(config.defect),
    card: createStream(config.card),
  };
}

function nextInjected(stream) {
  if (stream.cursor >= stream.values.length) {
    throw new Error(`注入序列已用盡（已用 ${stream.cursor} 個），不循環、不自動補值`);
  }
  return stream.values[stream.cursor];
}

export function drawD100(stream) {
  if (stream.kind === 'injected') {
    const v = nextInjected(stream);
    if (!isDie(v)) throw new Error(`注入序列第 ${stream.cursor + 1} 個值不是 d100 骰值`);
    const next = { ...stream, cursor: stream.cursor + 1 };
    return { value: v, index: next.cursor, designated: true, stream: next };
  }
  const state = [...stream.state];
  const value = uniformBelow(() => sfc32Step(state), 100) + 1;
  const next = { ...stream, state, cursor: stream.cursor + 1 };
  return { value, index: next.cursor, designated: false, stream: next };
}

// 從 pool 無放回取 min(k, pool.length) 個。注入模式的每個值是一組「指定候選」。
export function drawSample(stream, pool, k) {
  const size = Math.min(k, pool.length);
  if (stream.kind === 'injected') {
    const v = nextInjected(stream);
    const ok = Array.isArray(v)
      && v.length === size
      && new Set(v).size === v.length
      && v.every((x) => pool.includes(x));
    if (!ok) {
      throw new Error(`指定候選不合法：${JSON.stringify(v)}；須為池 ${JSON.stringify(pool)} 中 ${size} 個不重複項`);
    }
    const next = { ...stream, cursor: stream.cursor + 1 };
    return { value: [...v], index: next.cursor, designated: true, stream: next };
  }
  const state = [...stream.state];
  const arr = [...pool];
  for (let i = 0; i < size; i++) {
    const j = i + uniformBelow(() => sfc32Step(state), arr.length - i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const next = { ...stream, state, cursor: stream.cursor + 1 };
  return { value: arr.slice(0, size), index: next.cursor, designated: false, stream: next };
}

export function randomSeed() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}
