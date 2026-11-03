import argparse
import json
import sqlite3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from examples.order_workspace.store import OrderStore
from examples.order_workspace.workspace import Workspace
from proofstill.trace import Flow


def run_workspace(connection, path=None, workspace_type=Workspace):
    store = OrderStore(connection)
    app = workspace_type(store)
    with Flow('주문 작업과 상태 수명', path=path) as flow:
        def transition(operation, description, function, inputs=None):
            return flow.transition(operation, description, function, state=app.snapshot, inputs=inputs,
                                   ui={'screen': app.snapshot()['screen'], 'action': description})
        transition('orders.search', '주문 찾기: 검색 조건과 페이지로 목록 조회', app.search, {'query': 'open', 'page': 2})
        first = transition('orders.select', '선택한 주문의 상세 조회 시작, 목록 데이터 정리', app.begin_detail, {'identifier': 1})
        row = flow.step('orders.fetch', '선택 ID로 저장소 상세 조회', store.get, inputs={'identifier': 1})
        transition('orders.receive', '현재 요청의 응답만 상세 화면에 반영', app.accept_detail, {'ticket': first.ref(), 'row': row.ref()})
        transition('orders.edit', '수정 작업 시작: 상세 대신 최소 초안 소유', app.begin_edit)
        transition('orders.change', '초안 금액 변경', app.change_amount, {'amount': 35})
        transition('orders.save', '저장 성공: 확정 상세 반영과 초안 제거', app.save)
        transition('orders.back', '조건과 페이지를 유지해 목록 재조회', app.back_to_list)
        old = transition('orders.select', '첫 주문 재조회 요청', app.begin_detail, {'identifier': 1})
        current = transition('orders.select', '응답 전에 다른 주문 선택', app.begin_detail, {'identifier': 2})
        current_row = flow.step('orders.fetch', '새 선택의 실제 데이터 조회', store.get, inputs={'identifier': 2})
        transition('orders.receive', '현재 선택 응답 반영', app.accept_detail, {'ticket': current.ref(), 'row': current_row.ref()})
        old_row = flow.step('orders.fetch', '늦게 도착한 이전 요청 데이터 조회', store.get, inputs={'identifier': 1})
        transition('orders.receive-stale', '이전 응답 무시: 현재 선택과 데이터 유지', app.accept_detail, {'ticket': old.ref(), 'row': old_row.ref()})
        transition('orders.leave', '주문 기능 종료: 검색 조건과 선택 데이터 정리', app.leave)
        transition('orders.receive-after-exit', '기능 종료 후 응답도 무시', app.accept_detail, {'ticket': old.ref(), 'row': old_row.ref()})
    return {'final': app.snapshot(), 'trace': str(flow.path)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--trace')
    args = parser.parse_args()
    with sqlite3.connect(':memory:') as connection:
        connection.execute('CREATE TABLE orders (id INTEGER PRIMARY KEY, amount INTEGER, status TEXT)')
        connection.executemany('INSERT INTO orders VALUES (?, ?, ?)', [(1, 10, 'open'), (2, 20, 'open'), (3, 100, 'closed')])
        connection.commit()
        result = run_workspace(connection, args.trace)
        result['saved'] = connection.execute('SELECT amount FROM orders WHERE id=1').fetchone()[0]
        print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
