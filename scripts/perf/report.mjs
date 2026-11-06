import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined').digest('hex');
export function statistics(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = percentile => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)] : null;
  return { count: sorted.length, mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null, p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.at(-1) ?? null };
}
export function schedule(variants, repetitions, seed) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const result = [];
  for (let repeat = 1; repeat <= repetitions; repeat++) {
    const ids = [...variants];
    for (let index = ids.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [ids[index], ids[swap]] = [ids[swap], ids[index]]; }
    result.push(...ids.map(id => ({ id, repeat })));
  }
  return result;
}
export function summarize(observation) {
  return { timings: Object.fromEntries(Object.entries(observation.timings).map(([key, values]) => [key, statistics(values.map(value => value.ms))])), frames: statistics(observation.frames), longtasks: statistics(observation.longtasks.map(value => value.ms)), framesOver50ms: observation.frames.filter(ms => ms > 50).length, truncated: observation.truncated, hidden: observation.hidden };
}
export function compareIdentity(before, baseline) {
  const differences = [];
  for (const key of ['state', 'config', 'mods', 'scriptHashes']) if (hash(before[key]) !== hash(baseline[key])) differences.push(key);
  return { comparable: differences.length === 0, differences };
}
export function validateSample(before, after, summary) {
  const reasons = [];
  if (before.visibility !== 'visible') reasons.push('量測開始時頁面不在前景');
  if (after.visibility !== 'visible') reasons.push('量測結束時頁面不在前景');
  if (summary.hidden) reasons.push('量測期間頁面曾切到背景');
  if (!(summary.timings.updateUI?.count > 0)) reasons.push('沒有統計更新樣本');
  if (!(summary.frames.count > 0)) reasons.push('沒有畫格樣本');
  if (summary.truncated) reasons.push('原始樣本達上限而截斷');
  return { valid: reasons.length === 0, reasons };
}
export function markdown(report) {
  const lines = ['# 模組效能比較', '', `種子：${report.seed}；暖機：${report.warmupMs} ms；量測：${report.sampleMs} ms。`, '', '時間包含觀察器負擔；CPU 採樣僅在量測區間啟用。正式存檔未載入或回寫。', '', '| 方案 | 次數 | 量測有效 | 狀態可比較 | 更新 p95 ms | 更新最大 ms | 畫格 p99 ms | >50 ms 畫格 |', '|---|---:|---|---|---:|---:|---:|---:|'];
  for (const run of report.runs) lines.push(`| ${run.id} | ${run.repeat} | ${run.sampleValidity?.valid ? '是' : `無效：${run.sampleValidity?.reasons.join('、') || '未驗證樣本有效性'}`} | ${run.sampleValidity?.valid && run.identity.comparable ? '是' : `否：${run.sampleValidity?.valid ? run.identity.differences.join(', ') : '量測無效'}`} | ${run.summary.timings.updateUI?.p95 ?? '無資料'} | ${run.summary.timings.updateUI?.max ?? '無資料'} | ${run.summary.frames.p99 ?? '無資料'} | ${run.summary.framesOver50ms} |`);
  lines.push('', '量測無效或狀態不一致的組別只保存原始觀察，不宣稱量測成功或作因果比較。推薦差異保存在各次原始 JSON；本工具不將相同推薦誤稱為長期最優證明。');
  return lines.join('\n');
}
