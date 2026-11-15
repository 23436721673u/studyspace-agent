import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
export const safeName = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.startsWith('\\') && !value.includes('\\') && !value.includes(':') && !value.split('/').some(part => !part || part === '.' || part === '..');
const secretPattern = /(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|(?:api[_-]?key|access[_-]?token|bearer|secret)\s*[:=]\s*["'][^"']{12,}["'])/i;
const textExt = /\.(?:js|mjs|cjs|json|md|txt|html|css|ps1|cmd|yaml|yml|lock)$/i;
const zipSig = Buffer.from([0x50,0x4b,0x03,0x04]);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function u16(buffer, offset) { return buffer.readUInt16LE(offset); }
function u32(buffer, offset) { return buffer.readUInt32LE(offset); }
function findEocd(buffer) { for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) if (u32(buffer, i) === 0x06054b50) return i; return -1; }
export function readZipEntries(buffer) {
  const eocd = findEocd(buffer); if (eocd < 0) fail('ZIP_EOCD_MISSING');
  const count = u16(buffer, eocd + 10); const centralBytes = u32(buffer, eocd + 12); const centralOffset = u32(buffer, eocd + 16);
  const entries = []; let cursor = centralOffset;
  for (let i = 0; i < count; i++) {
    if (u32(buffer, cursor) !== 0x02014b50) fail('ZIP_CENTRAL_DIRECTORY_INVALID');
    const method = u16(buffer, cursor + 10); const compressed = u32(buffer, cursor + 20); const nameBytes = u16(buffer, cursor + 28); const extraBytes = u16(buffer, cursor + 30); const commentBytes = u16(buffer, cursor + 32); const localOffset = u32(buffer, cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameBytes).toString('utf8');
    if (!safeName(name) || name.endsWith('/')) fail('ZIP_ENTRY_PATH_INVALID');
    if (method !== 0 && method !== 8) fail('ZIP_METHOD_UNSUPPORTED');
    if (u32(buffer, localOffset) !== 0x04034b50) fail('ZIP_LOCAL_HEADER_INVALID');
    const localNameBytes = u16(buffer, localOffset + 26); const localExtraBytes = u16(buffer, localOffset + 28); const start = localOffset + 30 + localNameBytes + localExtraBytes;
    const packed = buffer.subarray(start, start + compressed);
    if (packed.length !== compressed) fail('ZIP_ENTRY_TRUNCATED');
    const data = method === 0 ? packed : zlib.inflateRawSync(packed);
    entries.push({ path: name, bytes: data.length, sha256: sha256(data), data });
    cursor += 46 + nameBytes + extraBytes + commentBytes;
  }
  if (cursor !== centralOffset + centralBytes) fail('ZIP_CENTRAL_SIZE_MISMATCH');
  return entries;
}
export async function scanSecrets(filePath, maxBytes = 8 * 1024 * 1024) {
  const stat = await fs.stat(filePath); if (stat.size > maxBytes) return { scanned: false, suspect: false, reason: 'larger-than-text-scan-limit' };
  const data = await fs.readFile(filePath); if (!textExt.test(filePath)) return { scanned: false, suspect: false, reason: 'binary-extension' };
  return { scanned: true, suspect: secretPattern.test(data.toString('utf8')) };
}
export async function scanZipSecrets(data) {
  const entries = readZipEntries(data); const results = [];
  for (const entry of entries) {
    if (entry.bytes > 8 * 1024 * 1024 || !textExt.test(entry.path)) continue;
    results.push({ path: entry.path, suspect: secretPattern.test(entry.data.toString('utf8')) });
  }
  return { entries: results, suspect: results.some(item => item.suspect) };
}
export async function verifyCopy(stage, record) {
  const file = path.join(stage, record.path); const data = await fs.readFile(file);
  if (data.length !== record.bytes || sha256(data) !== record.sha256) fail('STAGE_HASH_MISMATCH');
}
export async function verifyZip(zipPath, expected) {
  const data = await fs.readFile(zipPath); const entries = readZipEntries(data); const seen = new Set(); const expectedMap = new Map(expected.map(item => [item.path, item]));
  for (const item of entries) { if (seen.has(item.path)) fail('ZIP_DUPLICATE_ENTRY'); seen.add(item.path); if (!safeName(item.path)) fail('ZIP_ENTRY_PATH_INVALID'); const source = expectedMap.get(item.path); if (!source || item.bytes !== source.bytes || item.sha256 !== source.sha256) fail('ZIP_ENTRY_HASH_MISMATCH'); }
  if (seen.size !== expected.length) fail('ZIP_ENTRY_COUNT_MISMATCH');
  return { entries, bytes: data.length, sha256: sha256(data), under200MB: data.length < 200000000 };
}
export async function auditImports(root, expectedRuntime) {
  const required = new Set(expectedRuntime); const sources = [];
  async function walk(dir) { for (const item of await fs.readdir(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) await walk(file); else if (/\.(?:mjs|js)$/.test(item.name)) sources.push(file); } }
  await walk(path.join(root, 'src')); await walk(path.join(root, 'bin')); await walk(path.join(root, 'vendor'));
  const missing = []; for (const file of required) { try { await fs.access(path.join(root, file)); } catch { missing.push(file); } }
  const relativeImports = [];
  for (const file of sources) {
    const text = await fs.readFile(file, 'utf8');
    const pattern = /(?:from\s*|import\s*\x28?\s*)['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(pattern)) {
      if (!match[1].startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), match[1]);
      let pass = false;
      try {
        const real = await fs.realpath(target);
        const rel = path.relative(await fs.realpath(root), real);
        pass = !rel.startsWith('..') && !path.isAbsolute(rel) && (await fs.stat(real)).isFile();
      } catch {}
      relativeImports.push({ from: path.relative(root, file), specifier: match[1], pass });
    }
  }
  const runnerLoad = { entry: 'src/agh-runner.mjs', attempted: false, pass: false, modelTaskInvoked: false };
  if (!missing.length && relativeImports.every(item => item.pass)) {
    runnerLoad.attempted = true;
    try { const module = await import(pathToFileURL(path.join(root, runnerLoad.entry)).href); runnerLoad.pass = typeof module.runJob === 'function'; }
    catch (error) { runnerLoad.errorCode = error.code || error.name; }
  }
  return { scope: 'staged static and literal dynamic relative imports in src/bin/vendor; computed imports not resolved; only agh-runner entry loaded; no runJob call', sourceCount: sources.length, requiredRuntime: [...required], missingRuntime: missing, relativeImports, runnerLoad, pass: !missing.length && relativeImports.every(item => item.pass) && runnerLoad.pass };
}
export function selfTest() {
  const payload = Buffer.from('audit-test'); const fake = Buffer.concat([zipSig, payload]);
  return { status: 'pass', sha256: sha256(payload), safeUnicodeName: safeName('证据/按钮.png'), zipHeaderRecognized: fake.readUInt32LE(0) === 0x04034b50 };
}
