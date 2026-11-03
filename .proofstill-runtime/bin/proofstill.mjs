#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = process.env.PROOFSTILL_PYTHON || 'python3';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  return process.exitCode;
}
const [command, ...args] = process.argv.slice(2);
if (['harness', 'tracker', 'ui'].includes(command) && args[0] === '--') args.shift();
try {
  if (['--help', '-h'].includes(command) || command === 'setup' && args.includes('--help')) {
    console.log(`proofstill [setup] [--codex-home <directory>] [--skills-dir <directory>]\n  No arguments: install the harness and skills into Codex user settings.\nproofstill scaffold <new-directory> [--apps backend,cli,app] [--package-manager npm|pnpm] [--install]
proofstill openapi export [--file <spec> | --url <url>] [--output <json>] [--config <json>]
proofstill tracker flow {run|step <id>|show|validate|reset|retry}
proofstill tracker <env|spec|app> <arguments>
proofstill ui <shadcn add arguments>
proofstill doctor
proofstill harness <existing Python harness arguments>
Existing init/test/review/status/report/cleanup/trace commands also work directly.`);
  } else if (!command || ['setup', '--codex-home', '--skills-dir'].includes(command)) {
    const { values } = parseArgs({ args: command === 'setup' ? args : process.argv.slice(2), options: {
      'codex-home': { type: 'string' }, 'skills-dir': { type: 'string' },
    } });
    const { setup } = await import('../bootstrap/setup.mjs');
    await setup({ codexHome: values['codex-home'], skillsDir: values['skills-dir'] });
  } else if (command === 'scaffold') {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      apps: { type: 'string', default: 'backend,cli,app' },
      'package-manager': { type: 'string', default: 'npm' }, install: { type: 'boolean', default: false },
    } });
    if (positionals.length !== 1) throw new Error('scaffold requires one new directory');
    const { scaffold } = await import('../bootstrap/scaffold.mjs');
    const target = await scaffold(positionals[0], { apps: values.apps, packageManager: values['package-manager'] });
    console.log(`Created ${target}`);
    if (values.install) {
      const pm = values['package-manager'];
      if (run(pm, ['install', '--ignore-scripts', ...(pm === 'npm' ? ['--no-audit', '--no-fund'] : [])], { cwd: target }) === 0) {
        const backendReady = !values.apps.split(',').includes('backend') || run(pm, ['run', 'backend:setup'], { cwd: target }) === 0;
        if (backendReady && run(pm, ['run', 'openapi:export'], { cwd: target }) === 0) run(pm, ['run', 'api:generate'], { cwd: target });
      }
    } else {
      console.log(`Next: cd ${JSON.stringify(target)}; ${values['package-manager']} install;${values.apps.split(',').includes('backend') ? ` ${values['package-manager']} run backend:setup;` : ''} ${values['package-manager']} run openapi:export; ${values['package-manager']} run api:generate`);
    }
  } else if (command === 'openapi') {
    if (args.shift() !== 'export') throw new Error('Expected: openapi export');
    if (args[0] === '--') args.shift();
    const { values } = parseArgs({ args, options: {
      file: { type: 'string' }, url: { type: 'string' }, output: { type: 'string' }, config: { type: 'string' },
    } });
    const { exportOpenapi } = await import('../bootstrap/openapi.mjs');
    console.log(JSON.stringify({ ok: true, output: await exportOpenapi(values) }));
  } else if (command === 'tracker') {
    if (args[0] === 'flow') {
      const { runFlow } = await import('../bootstrap/flow.mjs');
      await runFlow(args.slice(1));
    } else if (['env', 'spec', 'app'].includes(args[0])) {
      run(process.execPath, [path.join(root, 'vendor/api-tracker/dist/cli/index.js'), ...args]);
    } else if (!args.length || args.length === 1 && ['--help', '-h'].includes(args[0])) {
      console.log('tracker flow {run|step <id>|show|validate|reset|retry}\ntracker <env|spec|app> <arguments>');
    } else throw new Error('Expected tracker flow, env, spec or app');
  } else if (command === 'ui') {
    run(path.join(process.cwd(), 'node_modules/.bin/shadcn'), ['add', '--cwd', 'packages/ui', ...args]);
  } else if (command === 'doctor') {
    const probes = [['node', process.execPath, ['--version']], ['python', python, ['-c', 'import sys; assert sys.version_info >= (3,10); print(sys.version.split()[0])']], ['codex', 'codex', ['--version']]];
    const checks = probes.map(([name, executable, argv]) => {
      const result = spawnSync(executable, argv, { encoding: 'utf8', timeout: 10000 });
      return { name, ok: result.status === 0, version: result.stdout?.trim(), error: result.error?.message || result.stderr?.trim() || undefined };
    });
    const [major, minor] = process.versions.node.split('.').map(Number);
    checks[0].ok &&= major > 22 || (major === 22 && minor >= 18);
    console.log(JSON.stringify({ checks, note: 'Independent reviews require Codex CLI login. No API key is installed.' }, null, 2));
    process.exitCode = checks.every(item => item.ok) ? 0 : 1;
  } else {
    run(python, [path.join(root, 'bin/proofstill'), ...(command === 'harness' ? args : [command, ...args])], {
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
  }
} catch (error) {
  console.error(`proofstill: ${error.message}`);
  process.exitCode = 2;
}
