import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import YAML from 'yaml';
import Parser from '@apidevtools/swagger-parser';

const help = 'flow {run|step <id>|show|validate|reset|retry}';
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const labels = { pending: '대기', running: '처리 중', passed: '완료', failed: '실패' };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
function require(condition, message) { if (!condition) throw new Error(message); }
function pointerParts(pointer) {
  require(typeof pointer === 'string' && (pointer === '' || pointer.startsWith('/')) && !/~(?![01])/u.test(pointer), `Invalid JSON Pointer: ${pointer}`);
  return pointer === '' ? [] : pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}
function at(value, pointer) {
  for (const part of pointerParts(pointer)) {
    require(value !== null && typeof value === 'object' && Object.hasOwn(value, part), `Missing observed value: ${pointer}`);
    value = value[part];
  }
  return value;
}
function visit(value, callback) {
  if (!value || typeof value !== 'object') return;
  callback(value);
  Object.values(value).forEach(child => visit(child, callback));
}
async function read(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
async function locked(folder, work) {
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'flow.lock');
  let lock;
  try { lock = await fs.open(file, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Flow is locked. Check the running process before removing flow.lock.');
    throw error;
  }
  try { await lock.writeFile(String(process.pid)); return await work(); }
  finally { await lock.close(); await fs.unlink(file); }
}
async function load(cwd) {
  const definition = YAML.parse(await fs.readFile(path.join(cwd, '.api-tracker/flow.yaml'), 'utf8'), { maxAliasCount: 0 });
  require(object(definition) && definition.version === 1 && text(definition.title) && text(definition.description), 'Flow needs version: 1, title and description');
  require(text(definition.spec) && Array.isArray(definition.steps) && definition.steps.length > 0, 'Flow needs spec and nonempty steps');
  const document = YAML.parse(await fs.readFile(path.resolve(cwd, definition.spec), 'utf8'), { maxAliasCount: 0 });
  visit(document, value => require(!value.$ref || value.$ref.startsWith('#/'), 'Bundle external OpenAPI references first'));
  const spec = await Parser.validate(structuredClone(document), { resolve: { external: false } });
  const operations = new Map();
  for (const [route, item] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      require(text(operation.operationId) && !operations.has(operation.operationId), `Missing/duplicate operationId: ${method} ${route}`);
      operations.set(operation.operationId, { route, method: method.toUpperCase(), ...operation,
        parameters: [...(item.parameters || []), ...(operation.parameters || [])] });
    }
  }
  const earlier = new Set();
  for (const step of definition.steps) {
    require(object(step) && text(step.id) && !earlier.has(step.id), 'Step IDs must be nonempty and unique');
    for (const key of ['title', 'description', 'expected']) require(text(step[key]), `${step.id} needs ${key}`);
    const operation = operations.get(step.operationId);
    require(operation, `Unknown operationId: ${step.operationId}`);
    require(object(step.expect) && Number.isInteger(step.expect.status) && step.expect.status >= 100 && step.expect.status <= 599, `${step.id} needs expect.status`);
    if (step.expect.body !== undefined) {
      require(object(step.expect.body), 'expect.body must map JSON Pointers to expected values');
      Object.keys(step.expect.body).forEach(pointerParts);
    }
    const input = step.input || {};
    require(object(input) && Object.keys(input).every(key => ['path', 'query', 'body'].includes(key)), 'input supports path, query, body');
    for (const location of ['path', 'query']) {
      require(input[location] === undefined || object(input[location]), `input.${location} must be an object`);
      for (const name of Object.keys(input[location] || {})) require(operation.parameters.some(p => p.in === location && p.name === name), `Unknown ${location} parameter: ${name}`);
    }
    for (const param of operation.parameters.filter(p => p.required && ['path', 'query'].includes(p.in))) {
      require(Object.hasOwn(input[param.in] || {}, param.name), `Missing required ${param.in} parameter: ${param.name}`);
    }
    require(!operation.requestBody?.required || input.body !== undefined, `${step.id} needs a request body`);
    if (input.body !== undefined) require(operation.requestBody?.content?.['application/json'], `${step.id} only supports JSON request bodies declared in OpenAPI`);
    visit(input, value => {
      if (!Object.hasOwn(value, 'from')) return;
      require(Object.keys(value).length === 2 && earlier.has(value.from), `${step.id}: reference must name an earlier step`);
      pointerParts(value.pointer);
    });
    earlier.add(step.id);
  }
  const timeout = definition.timeoutMs ?? 10000;
  require(Number.isInteger(timeout) && timeout > 0 && timeout <= 120000, 'timeoutMs must be 1..120000');
  for (const value of Object.values(definition.headers || {})) require(object(value) && Object.keys(value).length === 1 && text(value.env), 'headers must reference environment variables with {env: name}');
  const runtime = await read(path.join(cwd, '.api-tracker/runtime/backend/runtime.json'));
  const baseUrl = definition.baseUrl || process.env.API_TRACKER_BASE_URL || runtime?.baseUrl;
  if (baseUrl) require(['http:', 'https:'].includes(new URL(baseUrl).protocol), 'baseUrl must use HTTP(S)');
  const fingerprint = createHash('sha256').update(JSON.stringify({ definition, document, baseUrl, runtimeId: definition.baseUrl || process.env.API_TRACKER_BASE_URL ? undefined : runtime?.runId })).digest('hex');
  return { definition, operations, baseUrl, fingerprint, timeout };
}
function initial({ definition, fingerprint }) {
  return { version: 1, fingerprint, title: definition.title, description: definition.description,
    steps: definition.steps.map(({ id, title, description, expected, operationId }) => ({ id, title, description, expected, operationId, status: 'pending', attempts: [] })) };
}
function render(state) {
  const lines = [state.title, state.description];
  state.steps.forEach((step, index) => {
    lines.push(`\n${index + 1}. [${labels[step.status]}] ${step.title} (${step.id})`, `   목적: ${step.description}`, `   기대 결과: ${step.expected}`);
    for (const [index, attempt] of step.attempts.entries()) {
      lines.push(`   시도 ${index + 1}: ${attempt.startedAt}`);
      if (attempt.bindings.length) lines.push('   이전 응답 연결: ' + JSON.stringify(attempt.bindings, null, 2));
      if (attempt.request) lines.push('   요청: ' + JSON.stringify(attempt.request, null, 2));
      if (attempt.response) lines.push('   응답: ' + JSON.stringify(attempt.response, null, 2));
      if (attempt.error) lines.push('   실패: ' + attempt.error);
    }
  });
  console.log(lines.join('\n'));
}
function resolve(value, state, bindings, target = '') {
  if (object(value) && Object.hasOwn(value, 'from')) {
    const source = state.steps.find(step => step.id === value.from);
    require(source?.status === 'passed', `No successful response from ${value.from}`);
    const observed = at(source.attempts.at(-1).response.body, value.pointer);
    bindings.push({ target, from: value.from, pointer: value.pointer, value: observed });
    return structuredClone(observed);
  }
  if (Array.isArray(value)) return value.map((child, index) => resolve(child, state, bindings, `${target}/${index}`));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolve(child, state, bindings, `${target}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)]));
  return value;
}
function scalar(value) {
  require(['string', 'number', 'boolean'].includes(typeof value), 'Path/query values must be scalar');
  return String(value);
}
async function execute(config, state, index, recordFile) {
  const step = config.definition.steps[index];
  const record = state.steps[index];
  const attempt = { startedAt: new Date().toISOString(), bindings: [] };
  record.status = 'running'; record.attempts.push(attempt);
  await save(recordFile, state); // Persist before a write request can reach the server.
  try {
    const input = resolve(step.input || {}, state, attempt.bindings);
    const operation = config.operations.get(step.operationId);
    const route = operation.route.replace(/\{([^}]+)\}/g, (_, name) => {
      require(Object.hasOwn(input.path || {}, name), `Missing path parameter: ${name}`);
      return encodeURIComponent(scalar(input.path[name]));
    });
    const url = new URL(config.baseUrl.replace(/\/$/, '') + route);
    for (const [name, value] of Object.entries(input.query || {})) url.searchParams.set(name, scalar(value));
    const headers = { Accept: 'application/json' };
    if (input.body !== undefined) headers['Content-Type'] = 'application/json';
    for (const [name, value] of Object.entries(config.definition.headers || {})) {
      require(text(process.env[value.env]), `Missing environment variable: ${value.env}`);
      headers[name] = process.env[value.env];
    }
    attempt.request = { method: operation.method, url: url.href, ...(input.body !== undefined ? { body: input.body } : {}) };
    await save(recordFile, state);
    const response = await fetch(url, { method: operation.method, headers, body: input.body === undefined ? undefined : JSON.stringify(input.body),
      redirect: 'error', signal: AbortSignal.timeout(config.timeout) });
    const raw = await response.text();
    let body = raw;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* Preserve a non-JSON error body as observed. */ }
    attempt.response = { status: response.status, body };
    require(response.status === step.expect.status, `Expected HTTP ${step.expect.status}, received ${response.status}`);
    for (const [pointer, expected] of Object.entries(step.expect.body || {})) require(isDeepStrictEqual(at(body, pointer), expected), `Unexpected response at ${pointer}`);
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed'; attempt.error = error.message;
  }
  attempt.finishedAt = new Date().toISOString();
  await save(recordFile, state);
}

export async function runFlow(args, cwd = process.cwd()) {
  if (!args.length || args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(help); return; }
  const [command, id] = args;
  require(['run', 'step', 'show', 'validate', 'reset', 'retry'].includes(command) &&
    (command === 'step' ? args.length === 2 && text(id) && !id.startsWith('-') : args.length === 1), `Expected: ${help}`);
  const folder = path.join(cwd, '.api-tracker');
  const recordFile = path.join(folder, 'flow-record.json');
  if (command === 'reset') {
    await locked(folder, () => fs.rm(recordFile, { force: true }));
    console.log('Flow 기록을 초기화했습니다. 서버 데이터는 유지됩니다.'); return;
  }
  const config = await load(cwd);
  if (command === 'validate') { console.log(`유효한 flow: ${config.definition.title} (${config.definition.steps.length}단계)`); return; }
  if (command === 'show') {
    const state = await read(recordFile);
    if (state && state.fingerprint !== config.fingerprint) console.log('정의·명세·서버가 변경됐습니다. 아래는 이전 기록입니다. 실행 전 flow reset이 필요합니다.');
    render(state || initial(config)); return;
  }
  require(config.baseUrl, 'Prepare the server with env prepare or configure flow.baseUrl first');
  await locked(folder, async () => {
    const state = await read(recordFile) || initial(config);
    require(state.fingerprint === config.fingerprint, 'Flow definition, spec or server changed; inspect the record then flow reset');
    let index = state.steps.findIndex(step => step.status !== 'passed');
    if (index < 0) { require(command === 'run', 'Flow is already complete'); render(state); return; }
    if (command === 'step') require(state.steps[index].id === id, `Next step is ${state.steps[index].id}`);
    const status = state.steps[index].status;
    if (command === 'retry') require(['failed', 'running'].includes(status), 'No failed/interrupted step to retry');
    else require(status === 'pending', 'Previous attempt failed or was interrupted. Inspect server effects and flow show, then use flow retry explicitly.');
    do {
      await execute(config, state, index, recordFile);
      if (state.steps[index].status !== 'passed') { render(state); throw new Error(`Step ${state.steps[index].id} failed; inspect flow show before flow retry`); }
      index++;
    } while (command === 'run' && index < state.steps.length);
    render(state);
  });
}
