import fs from 'node:fs/promises';
import path from 'node:path';

import { createRunStore } from '../mcp/run-store.js';
import { RUN_LIMITS, validateRunRecord } from '../postgame/run-schema.js';

export class RunWriteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunWriteError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RunWriteError(code, message);
}

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value).replaceAll('\\', '/');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sameRecord(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function serialize(record) {
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > RUN_LIMITS.maxFileBytes) {
    fail('file_too_large', `局紀錄不得超過 ${RUN_LIMITS.maxFileBytes} bytes`);
  }
  return text;
}

async function canonicalRoot(requestedRoot) {
  let link;
  try {
    link = await fs.lstat(requestedRoot);
  } catch (error) {
    if (error.code === 'ENOENT') fail('runs_unavailable', 'runs 目錄不存在');
    fail('runs_unavailable', 'runs 目錄無法使用');
  }
  if (link.isSymbolicLink() || !link.isDirectory()) fail('unsafe_root', 'runs 根目錄不得是連結或非目錄');
  const real = await fs.realpath(requestedRoot);
  if (!samePath(real, requestedRoot)) fail('unsafe_root', 'runs 根目錄解析到非預期位置');
  return real;
}

async function existingRecord(runsDir, runId) {
  let records;
  try {
    records = await createRunStore(runsDir).list(Number.MAX_SAFE_INTEGER);
  } catch (error) {
    fail(error.code ?? 'runs_unavailable', error.message ?? 'runs 目錄無法使用');
  }
  return records.find((record) => record.runId === runId) ?? null;
}

async function idempotentResult(runsDir, record) {
  const existing = await existingRecord(runsDir, record.runId);
  if (!existing) return null;
  if (!sameRecord(existing, record)) fail('run_conflict', '相同 runId 已有不同內容，未覆蓋既有局紀錄');
  return Object.freeze({ runId: record.runId, fileName: `${record.runId}.json`, created: false, idempotent: true });
}

export function createRunWriter(runsDir) {
  const requestedRoot = path.resolve(runsDir);

  return Object.freeze({
    root: requestedRoot,
    async save(record) {
      try {
        validateRunRecord(record);
      } catch (error) {
        fail(error.code ?? 'invalid_schema', error.message ?? '局紀錄格式不合法');
      }

      const root = await canonicalRoot(requestedRoot);
      const already = await idempotentResult(root, record);
      if (already) return already;

      const fileName = `${record.runId}.json`;
      const target = path.join(root, fileName);
      if (!samePath(path.dirname(target), root)) fail('path_escape', '局紀錄路徑超出 runs 目錄');
      const text = serialize(record);
      let handle;
      let created = false;
      let writeError = null;
      try {
        handle = await fs.open(target, 'wx', 0o600);
        created = true;
        await handle.writeFile(text, 'utf8');
        await handle.sync();
      } catch (error) {
        writeError = error;
      } finally {
        if (handle) await handle.close().catch(() => {});
      }
      if (writeError) {
        if (writeError.code === 'EEXIST') {
          const raced = await idempotentResult(root, record);
          if (raced) return raced;
          fail('run_conflict', '相同 runId 已存在，未覆蓋既有檔案');
        }
        if (created) await fs.unlink(target).catch(() => {});
        fail('write_failed', '局紀錄無法安全寫入');
      }

      try {
        const readBack = await createRunStore(root).get(record.runId);
        if (!sameRecord(readBack, record)) fail('readback_failed', '寫入後讀回內容不一致');
      } catch (error) {
        if (created) await fs.unlink(target).catch(() => {});
        if (error instanceof RunWriteError) throw error;
        fail(error.code ?? 'readback_failed', '寫入後無法驗證局紀錄');
      }

      return Object.freeze({ runId: record.runId, fileName, created: true, idempotent: false });
    },
  });
}
