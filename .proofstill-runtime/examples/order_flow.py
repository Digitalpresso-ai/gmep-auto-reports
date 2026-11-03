import argparse
import json
import sqlite3
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from proofstill.trace import Flow


class Orders:
    def __init__(self, connection):
        self.connection = connection

    def lookup(self, tenant, after):
        rows = self.connection.execute("SELECT id, amount FROM orders WHERE tenant=? AND status='pending' AND id>? ORDER BY id LIMIT 1", (tenant, after)).fetchall()
        return {'items': [{'id': row[0], 'amount': row[1]} for row in rows]}

    def process(self, payload):
        with self.connection:
            cursor = self.connection.execute("UPDATE orders SET amount=?, status='done' WHERE id=? AND tenant=? AND status='pending'",
                                             (payload['amount'], payload['id'], payload['tenant']))
            if cursor.rowcount != 1:
                raise ValueError('현재 처리할 주문이 없습니다')
        return {'last_id': payload['id'], 'processed': {'id': payload['id'], 'amount': payload['amount']}}


def merge(item, policy):
    return {'id': item['id'], 'tenant': policy['tenant'], 'amount': item['amount'] * policy['multiplier']}


def run_orders(connection, path, context):
    orders, processed = Orders(connection), []
    with Flow('미처리 주문 순차 처리', context=context, path=path) as flow:
        found = flow.step('orders.lookup', '현재 컨텍스트에서 미처리 주문을 조회해요', orders.lookup,
                          inputs={'tenant': flow.context_ref('/tenant'), 'after': 0},
                          ui={'screen': 'orders', 'action': '조회하기', 'element': '#query'})
        while found.value['items']:
            prepared = flow.step('context.merge', '조회한 주문과 현재 처리 조건을 결합해요', merge,
                                 inputs={'item': found.ref('/items/0'), 'policy': flow.context_ref()},
                                 ui={'screen': 'orders', 'action': '처리 조건 준비', 'element': '#process'})
            result = flow.step('orders.process', '결합한 데이터로 주문을 처리하고 저장해요', orders.process,
                               inputs={'payload': prepared.ref()},
                               ui={'screen': 'orders', 'action': '처리하기', 'element': '#process'})
            processed.append(result.value['processed'])
            found = flow.step('orders.lookup', '이전 처리 결과를 사용해 다음 미처리 주문을 다시 조회해요', orders.lookup,
                              inputs={'tenant': flow.context_ref('/tenant'), 'after': result.ref('/last_id')},
                              ui={'screen': 'orders', 'action': '처리 후 새로고침', 'element': '#list'})
    return {'processed': processed, 'trace': str(flow.path)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--trace', help='생략하면 하네스가 지정한 trace 디렉터리에 기록')
    args = parser.parse_args()
    connection = sqlite3.connect(':memory:')
    try:
        connection.execute('CREATE TABLE orders (id INTEGER PRIMARY KEY, tenant TEXT, amount INTEGER, status TEXT)')
        connection.executemany('INSERT INTO orders VALUES (?, ?, ?, ?)', [(1, 'demo', 10, 'pending'), (2, 'demo', 20, 'pending')])
        connection.commit()
        print(json.dumps(run_orders(connection, args.trace, {'tenant': 'demo', 'multiplier': 2}), ensure_ascii=False))
    finally:
        connection.close()


if __name__ == '__main__':
    main()
