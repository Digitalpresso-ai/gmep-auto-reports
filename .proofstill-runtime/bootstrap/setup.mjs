import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('../', import.meta.url));
const begin = '<!-- proofstill:begin -->';
const end = '<!-- proofstill:end -->';
const skills = {
  'proofstill-develop': '.agents/skills/proofstill-develop',
  'proofstill-commit': '.agents/skills/proofstill-commit',
  'proofstill-interview': '.agents/skills/proofstill-interview',
  'proofstill-engineer': '.agents/skills/proofstill-engineer',
  'proofstill-ux': '.agents/skills/proofstill-ux',
  'proofstill-verify': '.agents/skills/proofstill-verify',
  jwdesign: 'vendor/skills/jwdesign',
  'design-taste-frontend': 'vendor/skills/design-taste-frontend',
  'proofstill-api': 'templates/monorepo/.agents/skills/proofstill-api',
  'proofstill-db': 'templates/monorepo/.agents/skills/proofstill-db',
};
const stat = file => fs.lstat(file).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

function guidance(install) {
  const link = name => `[${name}](<${path.join(install, 'skills', name, 'SKILL.md')}>)`;
  const command = `node ${quote(path.join(install, 'runtime/bin/proofstill.mjs'))}`;
  return `${begin}
## Proofstill

- 개발·검증은 ${link('proofstill-develop')}과 ${link('proofstill-verify')}를 따른다. 기존 프로젝트의 지침도 함께 적용한다.
- 모든 구현 작업자는 ${link('proofstill-commit')}을 읽고 작은 관심사의 구현·검사·빌드 직후 커밋한 뒤 다음 관심사로 이동한다. 위임 시 같은 규칙을 전달하고 공유 index의 stage·커밋은 직렬화한다. 마지막에 변경을 모아 hunk로 나누지 않는다. 읽기 전용 검증자는 커밋하지 않는다. push·이력 재작성은 포함하지 않는다.
- 요청의 범위가 불명확하면 ${link('proofstill-interview')}, 화면 흐름을 정할 때는 ${link('proofstill-ux')}를 사용한다. 새 프로젝트나 중요한 기술 변경은 ${link('proofstill-engineer')}로 구현 가능성·아키텍처를 사용자와 논의하고 필요한 결정을 받은 뒤 스택·폴더 구조를 확정한다.
- UI 작업은 ${link('jwdesign')}와 ${link('design-taste-frontend')}, API와 DB 작업은 ${link('proofstill-api')}와 ${link('proofstill-db')}를 참고한다. API/DB npm 명령은 해당 스캐폴드가 있는 프로젝트에서 실행한다.
- 사용자가 “Proofstill로 프로젝트 만들어줘”라고 하면 먼저 시니어 개발자 인터뷰로 기술 결정을 확정한다. 합의한 스택·구조가 제공 템플릿과 맞을 때 새 디렉터리에 \`${command} scaffold <새-디렉터리> --install\`을 실행한다. pnpm 프로젝트는 \`--package-manager pnpm\`을 추가한다. 기존 저장소에 임의로 새 프로젝트를 만들지 않는다.
- 하네스 명령은 \`${command} harness --root <프로젝트> --help\`로 확인한다. 사람은 의도와 수용을, 에이전트는 위임된 조사·구현·검증을 담당한다. 설치는 배포·외부 전송·권한 변경의 승인이 아니다.
${end}`;
}

function managed(text, block) {
  const starts = text.split(begin).length - 1;
  const ends = text.split(end).length - 1;
  if (!starts && !ends) return text + (text.endsWith('\n\n') || !text ? '' : text.endsWith('\n') ? '\n' : '\n\n') + block + '\n';
  if (starts !== 1 || ends !== 1 || text.indexOf(begin) > text.indexOf(end)) {
    throw new Error('Proofstill 관리 마커가 잘못되었습니다. 기존 지침을 확인한 후 다시 실행하세요.');
  }
  return text.slice(0, text.indexOf(begin)) + block + text.slice(text.indexOf(end) + end.length);
}

async function atomic(file, content, mode) {
  const temporary = `${file}.proofstill-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx', mode: mode ?? 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function setup({ codexHome, skillsDir } = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 18) throw new Error('Node 22.18+가 필요합니다.');
  for (const value of [codexHome, skillsDir]) if (value !== undefined && !value.trim()) throw new Error('설치 경로는 비어 있을 수 없습니다.');
  codexHome = path.resolve(codexHome ?? (process.env.CODEX_HOME || path.join(os.homedir(), '.codex')));
  skillsDir = path.resolve(skillsDir ?? path.join(os.homedir(), '.agents/skills'));
  const install = path.join(codexHome, 'proofstill');
  if (skillsDir === install || skillsDir.startsWith(install + path.sep)) throw new Error('skills-dir은 Proofstill runtime 밖의 경로여야 합니다.');
  await fs.mkdir(codexHome, { recursive: true });
  const lockPath = path.join(codexHome, '.proofstill-setup.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`다른 설치가 실행 중입니다. 종료된 실행의 잠금이면 ${lockPath}를 제거하고 재실행하세요.`);
    throw error;
  }
  let stage, previous, backup, promoted = false;
  const changed = [], createdLinks = [], guides = [];
  try {
    const existing = await stat(install);
    if (existing) {
      if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error(`기존 경로를 덮어쓸 수 없습니다: ${install}`);
      const owner = await fs.readFile(path.join(install, 'installation.json'), 'utf8').then(JSON.parse).catch(() => null);
      if (owner?.owner !== 'proofstill' || owner?.format !== 1) throw new Error(`Proofstill이 관리하지 않는 경로입니다: ${install}`);
    }
    const block = guidance(install);
    for (const name of ['AGENTS.md', 'AGENTS.override.md']) {
      const file = path.join(codexHome, name);
      const info = await stat(file);
      if (info && !info.isFile()) throw new Error(`일반 파일인 전역 지침만 수정할 수 있습니다: ${file}`);
      const bytes = info ? await fs.readFile(file) : null;
      const text = bytes ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : '';
      if (name === 'AGENTS.override.md' && !text.trim()) continue;
      guides.push({ file, name, bytes, mode: info ? info.mode & 0o777 : 0o600, next: managed(text, block) });
    }
    const links = [];
    const preserved = [];
    for (const name of Object.keys(skills)) {
      const file = path.join(skillsDir, name), target = path.join(install, 'skills', name);
      const info = await stat(file);
      if (!info) links.push({ file, target });
      else if (!info.isSymbolicLink() || path.resolve(path.dirname(file), await fs.readlink(file)) !== target) preserved.push(name);
    }
    stage = await fs.mkdtemp(path.join(codexHome, '.proofstill-setup-'));
    const runtime = path.join(stage, 'runtime');
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
    for (const name of manifest.files) {
      if (path.isAbsolute(name) || name.split('/').includes('..')) throw new Error(`잘못된 배포 경로: ${name}`);
      const file = path.join(runtime, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.copyFile(path.join(source, name), file);
    }
    // Install a self-contained runtime: the npx cache can disappear after this command.
    const npm = spawnSync('npm', ['install', '--prefix', runtime, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: runtime, encoding: 'utf8', timeout: 120000,
    });
    if (npm.error || npm.status !== 0) throw new Error(`runtime 의존성 설치 실패 (${npm.status ?? npm.error?.code}): ${(npm.stderr || npm.error?.message || '').slice(-2000)}`);
    for (const [name, relative] of Object.entries(skills)) {
      const target = path.join(stage, 'skills', name);
      await fs.cp(path.join(source, relative), target, { recursive: true, dereference: true });
      if (name === 'proofstill-develop') {
        const file = path.join(target, 'SKILL.md');
        const permanent = path.join(install, 'runtime');
        const text = (await fs.readFile(file, 'utf8'))
          .replaceAll('`../../..`', `\`${permanent}\``)
          .replace(/`\.\.\/\.\.\/\.\.\/examples\/([^`]+)`/g, (_, relative) => `[examples/${relative}](<${permanent}/examples/${relative}>)`)
          .replace('CLI는', `[CLI](<${permanent}/bin/proofstill>)는`);
        await fs.writeFile(file, text);
      }
    }
    await fs.writeFile(path.join(stage, 'installation.json'), JSON.stringify({ owner: 'proofstill', format: 1, version: manifest.version }, null, 2) + '\n');
    const updates = guides.filter(item => item.next !== item.bytes?.toString('utf8'));
    if (updates.some(item => item.bytes !== null)) {
      backup = path.join(codexHome, 'proofstill-backups', randomUUID());
      await fs.mkdir(backup, { recursive: true, mode: 0o700 });
      for (const item of updates) if (item.bytes !== null) await fs.writeFile(path.join(backup, item.name), item.bytes, { mode: item.mode });
    }
    if (existing) {
      previous = path.join(codexHome, `.proofstill-previous-${randomUUID()}`);
      await fs.rename(install, previous);
    }
    await fs.rename(stage, install);
    stage = null;
    promoted = true;
    await fs.mkdir(skillsDir, { recursive: true });
    for (const link of links) {
      await fs.symlink(link.target, link.file, 'dir');
      createdLinks.push(link.file);
    }
    for (const item of updates) {
      await atomic(item.file, item.next, item.mode);
      changed.push(item);
    }
    if (previous) await fs.rm(previous, { recursive: true, force: true }).catch(error => console.warn(`이전 runtime 정리 필요: ${previous}: ${error.message}`));
    console.log(`Proofstill ${manifest.version}: 전역 하네스·스킬·지침 즉시 등록 완료.\n설치 위치: ${install}\n스킬 위치: ${skillsDir}\n새 Codex 세션에서 “Proofstill로 프로젝트 만들어줘”라고 요청하세요.\n스킬 변경은 자동 감지되지만 전역 AGENTS 지침은 새 세션에서 읽습니다.`);
    if (preserved.length) console.log(`기존 개인 스킬 보존: ${preserved.join(', ')}. 전역 지침은 설치본의 스킬 경로를 연결합니다.`);
    if (backup) console.log(`기존 지침 백업: ${backup}`);
  } catch (error) {
    const failures = [];
    const restore = async fn => { try { await fn(); } catch (failure) { failures.push(failure.message); } };
    for (const item of changed.reverse()) await restore(() => item.bytes === null ? fs.rm(item.file, { force: true }) : atomic(item.file, item.bytes, item.mode));
    for (const file of createdLinks.reverse()) await restore(() => fs.unlink(file));
    if (promoted) await restore(() => fs.rm(install, { recursive: true, force: true }));
    if (previous) await restore(() => fs.rename(previous, install));
    if (backup && !failures.length) await restore(() => fs.rm(backup, { recursive: true, force: true }));
    if (failures.length) throw new Error(`${error.message}\n복구 확인 필요: ${failures.join('; ')}`);
    throw error;
  } finally {
    if (stage) await fs.rm(stage, { recursive: true, force: true });
    await lock.close();
    await fs.unlink(lockPath);
  }
}
