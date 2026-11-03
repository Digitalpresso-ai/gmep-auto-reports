import hashlib
import json
import re
from pathlib import Path


class HarnessError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise HarnessError(message)


def read_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError) as error:
        raise HarnessError(f'JSON 읽기 실패: {path}: {error}') from error


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else 'missing'


def project_path(root, value):
    require(isinstance(value, str) and value.strip(), '경로가 비어 있습니다')
    path = (root / value).resolve()
    require(path.is_relative_to(root), f'프로젝트 밖의 기준/소스: {value}')
    require('.proofstill' not in path.relative_to(root).parts, '하네스 상태를 소스/기준으로 지정할 수 없습니다')
    return path


def inventory(root, paths):
    result = {}
    ignored = {'.git', '.proofstill', '__pycache__', '.pytest_cache', '.review-tmp', 'reports'}
    for name in paths:
        path = project_path(root, name)
        if path.is_dir():
            result[str(path.relative_to(root)) + '/'] = 'directory'
            files = (p for p in path.rglob('*') if p.is_file() and not ignored.intersection(p.relative_to(root).parts))
        else:
            files = [path]
        for item in files:
            resolved = project_path(root, str(item))
            result[str(item.relative_to(root))] = file_hash(resolved)
    return result


def validate_plan(root, plan):
    require(isinstance(plan, dict), '기능 정의는 객체여야 합니다')
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', str(plan.get('id', ''))), '잘못된 기능 ID')
    for key in ['title', 'intent', 'context']:
        require(isinstance(plan.get(key), str) and plan[key].strip(), f'{key}가 필요합니다')
    for key in ['sources', 'requirements', 'checks']:
        require(isinstance(plan.get(key), list) and plan[key], f'{key}가 비어 있습니다')
    for key in ['context_files', 'artifacts', 'limitations']:
        plan.setdefault(key, [])
        require(isinstance(plan[key], list), f'{key}는 배열이어야 합니다')
    for path in plan['sources']:
        project_path(root, path)
    for path in plan['context_files']:
        require(project_path(root, path).is_file(), f'맥락 파일 없음: {path}')
    ids = []
    for check in plan['checks']:
        require(isinstance(check, dict), '잘못된 check')
        require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', str(check.get('id', ''))), '잘못된 check ID')
        ids.append(check['id'])
        require(check.get('kind') in ['unit', 'integration'], 'kind는 unit/integration이어야 합니다')
        require(isinstance(check.get('module'), str) and check['module'].strip(), 'module이 필요합니다')
        argv = check.get('argv')
        require(isinstance(argv, list) and argv and all(isinstance(x, str) and x for x in argv), '명령은 비어 있지 않은 argv 배열이어야 합니다')
        require(isinstance(check.get('files'), list) and check['files'], '테스트/fixture 파일을 지정하세요')
        if 'trace_expectation' in check:
            expected = check['trace_expectation']
            require(project_path(root, expected).is_file(), f'기대 흐름 파일 없음: {expected}')
            require(isinstance(read_json(project_path(root, expected)), dict), '기대 흐름은 JSON 객체여야 합니다')
            if expected not in check['files']:
                check['files'].append(expected)
        for name in check['files']:
            require(project_path(root, name).exists(), f'검토할 테스트 파일 없음: {name}')
        if 'surface' in check:
            require(check['surface'] in ['code', 'browser'], 'surface는 code/browser여야 합니다')
        for field in ['label', 'purpose', 'rationale', 'expected', 'scope']:
            if field in check:
                require(isinstance(check[field], str) and check[field].strip(), f'{field}는 비어 있지 않은 설명이어야 합니다')
        check.setdefault('timeout', 60)
        check.setdefault('regression', False)
        require(type(check['regression']) is bool, 'regression은 boolean이어야 합니다')
        require(type(check['timeout']) in [int, float] and 0 < check['timeout'] <= 3600, '잘못된 timeout')
        for key in ['green_pattern'] + (['red_pattern'] if 'red_pattern' in check else []):
            require(isinstance(check.get(key), str) and check[key].strip(), f'{key}가 필요합니다')
            try:
                re.compile(check[key])
            except re.error as error:
                raise HarnessError(f'잘못된 {key}: {error}') from error
    require(len(ids) == len(set(ids)), '중복 check ID')
    requirements = []
    mapped = set()
    for item in plan['requirements']:
        require(isinstance(item, dict) and isinstance(item.get('id'), str) and item['id'].strip(), '요구사항 ID 필요')
        require(isinstance(item.get('text'), str) and item['text'].strip(), '요구사항 내용 필요')
        require(isinstance(item.get('checks'), list) and item['checks'], '요구사항에 검사를 연결하세요')
        require(all(x in ids for x in item['checks']), '알 수 없는 check 매핑')
        mapped.update(item['checks'])
        requirements.append(item['id'])
    require(len(requirements) == len(set(requirements)), '중복 요구사항 ID')
    require(mapped == set(ids), '요구사항과 연결되지 않은 검사')
    for artifact in plan['artifacts']:
        require(isinstance(artifact, dict) and artifact.get('label'), '아티팩트 label 필요')
        require(bool(artifact.get('path')) != bool(artifact.get('url')), '아티팩트는 path 또는 url 하나를 지정하세요')
        if 'url' in artifact:
            require(isinstance(artifact['url'], str) and artifact['url'].startswith(('https://', 'http://')), 'http(s) 아티팩트 URL만 지원합니다')
    from .collaboration import validate_collaboration
    validate_collaboration(plan)
    from .assurance import validate_assurance
    validate_assurance(root, plan)
    return plan
