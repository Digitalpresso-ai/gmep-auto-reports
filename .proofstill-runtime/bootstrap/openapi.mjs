import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Parser from '@apidevtools/swagger-parser';
import YAML from 'yaml';

const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
function rejectExternalRefs(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string' && !value.$ref.startsWith('#/')) {
    throw new Error('External $ref is not supported; bundle the specification first');
  }
  for (const child of Object.values(value)) rejectExternalRefs(child);
}

export async function exportOpenapi(options = {}, cwd = process.cwd()) {
  if (options.file !== undefined && options.url !== undefined) throw new Error('Choose file or url, not both');
  let config = {};
  try { config = JSON.parse(await fs.readFile(path.resolve(cwd, options.config || 'proofstill.config.json'), 'utf8')).openapi || {}; }
  catch (error) { if (error.code !== 'ENOENT' || options.config) throw error; }
  const source = options.file !== undefined ? { file: options.file } : options.url !== undefined ? { url: options.url } : config;
  const selected = ['file', 'url', 'command'].filter(key => source[key] !== undefined);
  if (selected.length !== 1) throw new Error('Configure exactly one OpenAPI source: file, url, or command argv');
  const timeout = config.timeoutMs ?? 30000;
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 300000) throw new Error('timeoutMs must be an integer between 1 and 300000');
  const output = path.resolve(cwd, options.output || config.output || 'packages/api/openapi.generated.json');
  let raw;
  if (selected[0] === 'file') {
    if (typeof source.file !== 'string' || !source.file) throw new Error('file must be a nonempty path');
    raw = await fs.readFile(path.resolve(cwd, source.file), 'utf8');
  } else if (selected[0] === 'url') {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('url must use http or https');
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`OpenAPI HTTP ${response.status}`);
    raw = await response.text();
  } else {
    const argv = source.command;
    if (!Array.isArray(argv) || !argv.length || argv.some(value => typeof value !== 'string' || !value)) {
      throw new Error('command must be a nonempty argv array');
    }
    const result = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`OpenAPI exporter exited ${result.status}: ${result.stderr.trim()}`);
    raw = result.stdout;
  }
  if (Buffer.byteLength(raw) > 16 * 1024 * 1024) throw new Error('OpenAPI document exceeds 16 MiB');
  const document = YAML.parse(raw, { maxAliasCount: 0 });
  if (!document || typeof document !== 'object' || !/^3\.(0|1)\.\d+$/.test(document.openapi || '')) {
    throw new Error('Expected an OpenAPI 3.0 or 3.1 document');
  }
  rejectExternalRefs(document);
  // The validator may dereference/mutate its input; retain the portable original document.
  const validated = await Parser.validate(structuredClone(document), { resolve: { external: false } });
  const ids = new Set();
  for (const [route, item] of Object.entries(validated.paths || {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      const id = operation.operationId;
      if (typeof id !== 'string' || !id.trim()) throw new Error(`Missing operationId: ${method} ${route}`);
      if (ids.has(id)) throw new Error(`Duplicate operationId: ${id}`);
      ids.add(id);
    }
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporary = path.join(path.dirname(output), `.${path.basename(output)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
    await fs.rename(temporary, output);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return output;
}
