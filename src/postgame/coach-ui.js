import { analyzeRun, cancelRunAnalysis, saveRunRecord } from './run-export.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

export function validLocalCoachCapability(capability) {
  return capability
    && capability.schema === 'ai-engineer-game.local-coach.v1'
    && capability.endpoint === '/api/local-coach/runs'
    && capability.analysisEndpoint === '/api/local-coach/analyze'
    && capability.cancelEndpoint === '/api/local-coach/cancel'
    && typeof capability.csrfToken === 'string'
    && /^[A-Za-z0-9_-]{32,128}$/.test(capability.csrfToken);
}

export async function discoverLocalCoach(environment = globalThis) {
  const host = environment.location?.hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return null;
  try {
    const response = await environment.fetch('/api/local-coach/capability', {
      headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok || !String(response.headers.get('content-type')).toLowerCase().startsWith('application/json')) return null;
    const capability = await response.json();
    return validLocalCoachCapability(capability) ? capability : null;
  } catch {
    return null;
  }
}

export function createCoachSession({ buildRecord, getState, onChange, environment = globalThis }) {
  let capability = null;
  let analysis = null;
  let saveStatus = '';
  let request = 0;
  const notify = () => onChange?.();

  return Object.freeze({
    get view() { return { available: Boolean(capability), analysis, saveStatus }; },
    async discover() { capability = await discoverLocalCoach(environment); notify(); return Boolean(capability); },
    async save() {
      if (!capability) return null;
      saveStatus = '正在安全寫入本機 runs…'; notify();
      try {
        const result = await saveRunRecord(buildRecord(getState()), capability, environment);
        saveStatus = result.idempotent ? `這局已在本機 runs：${result.runId}` : `已存入本機 runs：${result.runId}`;
        notify(); return result;
      } catch (error) {
        saveStatus = `儲存失敗：${error.message}`; notify(); return null;
      }
    },
    async analyze(reanalyze = false) {
      if (!capability) return;
      const current = ++request;
      analysis = { status: 'saving' }; notify();
      try {
        const saved = await saveRunRecord(buildRecord(getState()), capability, environment);
        if (current !== request) return;
        saveStatus = saved.idempotent ? `這局已在本機 runs：${saved.runId}` : `已存入本機 runs：${saved.runId}`;
        analysis = { status: 'running', runId: saved.runId }; notify();
        const result = await analyzeRun(saved.runId, capability, { reanalyze }, environment);
        if (current !== request) return;
        analysis = { status: 'done', runId: saved.runId, result };
      } catch (error) {
        if (current !== request) return;
        analysis = { status: 'error', message: error.message };
      }
      notify();
    },
    async cancel() {
      const runId = analysis?.runId;
      if (!capability || !runId) return;
      request += 1;
      try {
        await cancelRunAnalysis(runId, capability, environment);
        analysis = { status: 'error', message: '已取消這次分析，沒有產生成功結果。' };
      } catch (error) {
        analysis = { status: 'error', message: error.message };
      }
      notify();
    },
  });
}

function list(values) {
  return values?.length ? `<ul>${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>` : '<p>沒有足夠公開資料可下判斷。</p>';
}

function analysisHtml(analysis) {
  if (!analysis) return '';
  if (analysis.status === 'saving') return '<div class="coach-analysis pending" data-analysis-result><strong>先安全保存本局…</strong><p>保存成功後才會啟動 Claude。</p></div>';
  if (analysis.status === 'running') return '<div class="coach-analysis pending" data-analysis-result><strong>Claude 正在讀取本局公開紀錄…</strong><p>一次只分析一局，不會自動重送。</p><button class="button secondary" data-cancel-analysis>取消分析</button></div>';
  if (analysis.status === 'error') return `<div class="coach-analysis error" data-analysis-result><strong>本次沒有完成分析</strong><p>${esc(analysis.message)}</p></div>`;
  if (analysis.status !== 'done' || !analysis.result?.critique) return '';
  const item = analysis.result.critique;
  const usage = analysis.result.usage?.turns ? `使用 ${analysis.result.usage.turns} 個 agent turn` : '分析已完成';
  return `<div class="coach-analysis done" data-analysis-result><div class="eyebrow">Claude 賽後回顧</div><h2>${esc(item.headline)}</h2><p>${esc(item.summary)}</p><div class="coach-columns"><section><h3>做得不錯</h3>${list(item.strengths)}</section><section><h3>風險與盲點</h3>${list(item.risks)}</section></div><section><h3>下局可以試試</h3>${list(item.nextActions)}</section><p class="muted"><strong>運氣與限制：</strong>${esc(item.luckAndLimits)}</p><p class="muted">${esc(usage)}${analysis.result.reused ? '；沿用同局快取，沒有再次使用模型。' : '。'}</p><button class="button secondary" data-reanalyze-run>重新分析（會再次使用額度）</button></div>`;
}

export function renderLocalCoachPanel(view) {
  if (!view?.available) return '';
  const busy = ['saving', 'running'].includes(view.analysis?.status);
  return `<section class="coach-export local-coach-panel"><div class="eyebrow">本機限定</div><h2>Claude 賽後教練</h2><p>只會把這一局已公開的決策、過程、資源與結局寫入固定 <code>runs/</code>，再由三個唯讀 MCP 工具讀取。不包含 seed、事件權重、帳號、金鑰或隱藏真相。</p><p><strong>按下分析會使用你的 Claude 帳戶額度；本次開發測試不會自動按它。</strong></p><p class="muted" data-save-status aria-live="polite">${esc(view.saveStatus)}</p>${analysisHtml(view.analysis)}<div class="actions"><button class="button" data-analyze-run ${busy ? 'disabled' : ''}>分析這局</button><button class="button secondary" data-save-run ${busy ? 'disabled' : ''}>只存到本機</button></div></section>`;
}
