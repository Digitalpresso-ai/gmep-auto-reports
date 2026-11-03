from proofstill.trace import Flow
from examples.order_workspace.store import OrderStore
from examples.order_workspace.workspace import Workspace


def run_status_flow(connection, path=None):
    app = Workspace(OrderStore(connection))
    with Flow('목록 주문 상태 변경', context={'target_status': 'closed'}, path=path) as flow:
        def transition(operation, description, function, inputs=None):
            return flow.transition(operation, description, function, state=app.snapshot, inputs=inputs,
                                   ui={'screen': app.snapshot()['screen'], 'action': description})
        transition('orders.search', 'open 주문 2페이지 조회', app.search, {'query': 'open', 'page': 2})
        visible = flow.step('orders.visible', '실제 목록의 현재 주문과 검색 조건 확인', app.snapshot)
        transition('orders.status', '보이는 주문 상태 변경 후 같은 조건·페이지 재조회', app.set_status,
                   {'identifier': visible.ref('/data/items/0/id'), 'status': flow.context_ref('/target_status')})
        transition('orders.search', 'closed 주문 1페이지 조회', app.search, {'query': 'closed', 'page': 1})
        visible = flow.step('orders.visible', '변경할 현재 주문 데이터 확인', app.snapshot)
        flow.set_context({'target_status': 'open'})
        transition('orders.status', '현재 컨텍스트의 상태로 변경하고 목록 교체', app.set_status,
                   {'identifier': visible.ref('/data/items/0/id'), 'status': flow.context_ref('/target_status')})
        transition('orders.leave', '기능 종료 시 목록·조건·오류 정리', app.leave)
    return {'trace': str(flow.path), 'final': app.snapshot()}
