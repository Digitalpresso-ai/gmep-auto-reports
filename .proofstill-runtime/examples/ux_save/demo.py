"""UX의 상태·전이 ID를 앱 관측과 연결하는 로컬 예제. 제품 UI 클릭은 포함하지 않는다."""
import copy
from proofstill.trace import Flow


class SaveForm:
    def __init__(self):
        self.phase = 'editing'
        self.data = {'draft': {'name': '수정한 이름'}}
        self.stored = {'name': '원래 이름'}

    def snapshot(self):
        return {'state_id': self.phase, 'feature': 'profile',
                'screen': 'profile.detail' if self.phase == 'saved' else 'profile.edit',
                'data': copy.deepcopy(self.data)}

    def submit(self):
        if self.phase not in ['editing', 'failed']:
            raise ValueError('편집 중 또는 실패 후에만 저장할 수 있습니다')
        self.phase = 'saving'
        self.data.pop('error', None)

    def failure(self):
        if self.phase != 'saving':
            raise ValueError('저장 요청이 없습니다')
        self.phase = 'failed'
        self.data['error'] = '저장 실패. 다시 시도해 주세요.'

    def success(self):
        if self.phase != 'saving':
            raise ValueError('저장 요청이 없습니다')
        self.stored = copy.deepcopy(self.data['draft'])
        self.data = {'profile': copy.deepcopy(self.stored)}
        self.phase = 'saved'


def run(path=None):
    app = SaveForm()
    with Flow('UX 저장 실패와 재시도', path=path) as flow:
        flow.transition('profile.submit', '입력 내용을 유지하며 저장 시작', app.submit,
                        state=app.snapshot, transition_id='submit')
        flow.transition('profile.failure', '저장 실패를 표시하고 초안 유지', app.failure,
                        state=app.snapshot, transition_id='save-failed')
        flow.transition('profile.retry', '오류를 정리하고 같은 초안으로 재시도', app.submit,
                        state=app.snapshot, transition_id='retry')
        flow.transition('profile.success', '저장 결과를 표시하고 초안 정리', app.success,
                        state=app.snapshot, transition_id='save-succeeded')
    return flow.path, app


if __name__ == '__main__':
    print(run()[0])
