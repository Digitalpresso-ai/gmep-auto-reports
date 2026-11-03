import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distribution = fileURLToPath(new URL('../', import.meta.url));
const allApps = ['backend', 'cli', 'app'];
const json = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function absent(file) {
  try { await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Refusing existing path: ${file}`);
}

export async function scaffold(destination, { apps = allApps.join(','), packageManager = 'npm' } = {}) {
  const selected = apps.split(',');
  if (!['npm', 'pnpm'].includes(packageManager)) throw new Error('package-manager must be npm or pnpm');
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(app => !allApps.includes(app))) {
    throw new Error('apps must be a nonempty, unique selection of backend,cli,app');
  }
  let target = path.resolve(destination);
  await absent(target);
  await fs.mkdir(path.dirname(target), { recursive: true });
  target = path.join(await fs.realpath(path.dirname(target)), path.basename(target));
  const source = await fs.realpath(distribution);
  if (target === source || target.startsWith(source + path.sep)) throw new Error('Create the project outside the installed distribution');
  const stage = await fs.mkdtemp(path.join(path.dirname(target), '.proofstill-scaffold-'));
  let reserved = false;
  try {
    await fs.cp(path.join(source, 'templates/monorepo'), stage, { recursive: true });
    await fs.rename(path.join(stage, 'gitignore'), path.join(stage, '.gitignore'));
    for (const app of allApps.filter(app => !selected.includes(app))) {
      await fs.rm(path.join(stage, 'apps', app), { recursive: true, force: true });
    }
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
    for (const relative of manifest.files) {
      const output = path.join(stage, '.proofstill-runtime', relative);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.copyFile(path.join(source, relative), output);
    }
    for (const name of ['proofstill-develop', 'proofstill-commit', 'proofstill-verify', 'proofstill-interview', 'proofstill-engineer', 'proofstill-ux']) {
      const output = path.join(stage, '.agents/skills', name);
      await fs.cp(path.join(source, '.agents/skills', name), output, { recursive: true });
      if (name === 'proofstill-develop') {
        const file = path.join(output, 'SKILL.md');
        const text = await fs.readFile(file, 'utf8');
        await fs.writeFile(file, text.replaceAll('`../../..`', '`../../../.proofstill-runtime`').replaceAll('../../../examples/', '../../../.proofstill-runtime/examples/'));
      }
    }
    for (const name of ['jwdesign', 'design-taste-frontend']) {
      await fs.cp(path.join(source, 'vendor/skills', name), path.join(stage, '.agents/skills', name), { recursive: true });
    }
    const design = path.join(stage, 'packages/jwdesign');
    await fs.cp(path.join(source, 'vendor/skills/jwdesign/assets'), path.join(design, 'assets'), { recursive: true });
    let component = await fs.readFile(path.join(design, 'assets/components/src/index.tsx'), 'utf8');
    component = component.replace('/* jwdesign UI — domain-agnostic component library. React 18 from window.React. */', "'use client';\nimport * as React from 'react';\nimport { createPortal } from 'react-dom';")
      .replace('declare const window: any;\nconst React = window.React;\n', '')
      .replace("window.ReactDOM && window.ReactDOM.createPortal && typeof document !== 'undefined' ? window.ReactDOM.createPortal(el, document.body)", "typeof document !== 'undefined' ? createPortal(el, document.body)");
    await fs.mkdir(path.join(design, 'src'));
    await fs.writeFile(path.join(design, 'src/index.tsx'), component);
    await fs.copyFile(path.join(design, 'assets/components/src/icons.json'), path.join(design, 'src/icons.json'));
    const workspace = packageManager === 'pnpm' ? 'workspace:*' : '*';
    for (const category of ['apps', 'packages']) {
      for (const name of await fs.readdir(path.join(stage, category))) {
        const file = path.join(stage, category, name, 'package.json');
        const pkg = JSON.parse(await fs.readFile(file, 'utf8'));
        for (const [name, value] of Object.entries(pkg.dependencies || {})) {
          if (value === 'WORKSPACE') pkg.dependencies[name] = workspace;
        }
        await json(file, pkg);
      }
    }
    const scripts = {
      proofstill: 'proofstill harness', 'openapi:export': 'proofstill openapi export',
      'api:generate': 'orval --config orval.config.mjs', 'api:tracker': 'proofstill tracker',
      build: 'orval --config orval.config.mjs && node scripts/build.mjs', typecheck: 'tsc --noEmit',
      'ui:add': 'proofstill ui',
    };
    if (selected.includes('backend')) {
      for (const command of ['backend:setup', 'auth:setup', 'db:revision', 'db:migrate', 'db:status', 'db:rollback', 'db:seed', 'db:reset', 'db:check', 'test:architecture', 'test:domain', 'test:usecase', 'test:unit', 'test:integration', 'test:flow', 'test:fast', 'test:e2e']) scripts[command] = `node scripts/backend.mjs ${command}`;
      scripts.test = 'node scripts/backend.mjs test:fast';
    }
    for (const name of selected) scripts[`dev:${name}`] = name === 'backend' ? 'node scripts/backend.mjs dev' : name === 'cli' ? 'node apps/cli/src/index.mjs' : `vite apps/${name}`;
    await json(path.join(stage, 'package.json'), {
      name: path.basename(target).toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'proofstill-project',
      private: true, version: '0.0.0', type: 'module', workspaces: ['apps/*', 'packages/*'],
      packageManager: `${packageManager}@${packageManager === 'npm' ? '11.9.0' : '10.28.2'}`,
      engines: { node: '>=22.18.0' }, scripts,
      devDependencies: {
        '@digitalpresso/proofstill': 'file:./.proofstill-runtime', '@tailwindcss/vite': '4.3.3',
        '@types/react': '19.3.0', '@types/react-dom': '19.3.0', orval: '8.46.0',
        pnpm: '10.28.2', shadcn: '4.23.0', tailwindcss: '4.3.3', tsx: '4.21.0', typescript: '5.9.3', vite: '8.3.5',
      },
    });
    await fs.writeFile(path.join(stage, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    await fs.writeFile(path.join(stage, '.npmrc'), 'install-links=true\naudit=false\nfund=false\n');
    await json(path.join(stage, 'proofstill.config.json'), { openapi: {
      ...(selected.includes('backend') ? { command: ['node', 'scripts/backend.mjs', 'openapi:export'] } : { file: 'packages/api/openapi.contract.json' }),
      output: 'packages/api/openapi.generated.json',
    } });
    await fs.copyFile(path.join(stage, 'packages/api/openapi.contract.json'), path.join(stage, 'packages/api/openapi.generated.json'));
    if (selected.includes('backend')) {
      for (const name of ['domain', 'usecase', 'app', 'infra']) await fs.writeFile(path.join(stage, 'apps/backend', name, '__init__.py'), '');
      const adapters = path.join(stage, 'apps/backend/scripts');
      await fs.mkdir(adapters, { recursive: true });
      for (const action of ['server-start', 'server-stop', 'server-reset', 'server-health', 'generate-openapi']) {
        await fs.writeFile(path.join(adapters, action), `#!/usr/bin/env node\nimport { run } from './adapter.mjs';\nawait run('${action}', process.argv.slice(2));\n`, { mode: 0o755 });
      }
    } else {
      await fs.rm(path.join(stage, '.api-tracker'), { recursive: true });
    }
    await fs.mkdir(target); // Exclusive reservation: never replace an existing project.
    reserved = true;
    await fs.rename(stage, target);
    reserved = false;
    return target;
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
    if (reserved) await fs.rmdir(target).catch(() => {});
  }
}
