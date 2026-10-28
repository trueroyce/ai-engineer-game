const mode = process.argv[2] ?? 'success';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const prompt = Buffer.concat(chunks).toString('utf8');

if (mode === 'hang') {
  setInterval(() => {}, 1_000);
} else if (mode === 'auth') {
  process.stdout.write(JSON.stringify({ is_error: true, result: 'Not logged in. Please login.' }));
  process.exitCode = 1;
} else if (mode === 'huge') {
  process.stdout.write('x'.repeat(200_000));
} else if (!/^請分析 run_id=case0[123]-[a-f0-9]{16}。/m.test(prompt)) {
  process.stdout.write(JSON.stringify({ is_error: true, result: 'invalid prompt' }));
  process.exitCode = 2;
} else {
  process.stdout.write(JSON.stringify({
    is_error: false,
    num_turns: 3,
    duration_ms: 1234,
    total_cost_usd: 0.0123,
    structured_output: {
      headline: '合成局講評',
      summary: '只依公開紀錄整理。',
      strengths: ['有留下可觀察證據。'],
      risks: ['單局結果不能代表穩定能力。'],
      nextActions: ['先確認需求。', '再跑公開檢查。'],
      luckAndLimits: '事件結果含骰運；沒有使用隱藏狀態。',
    },
  }));
}
