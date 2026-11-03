import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from examples.order_workspace.store import OrderStore
from examples.order_workspace.workspace import Workspace
from proofstill.trace import Flow
from proofstill.trace_check import verify_trace

ROOT = Path(__file__).resolve().parents[4]
EXPECTED = json.loads((ROOT / 'examples/order_status/expected.json').read_text())


class StatusStoreTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(getattr(OrderStore, 'set_status', None)), 'STATUS_STORE_NOT_IMPLEMENTED')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / 'orders.db'
        self.connection = sqlite3.connect(self.database)
        self.addCleanup(self.connection.close)
        self.connection.execute('CREATE TABLE orders (id INTEGER PRIMARY KEY, amount INTEGER, status TEXT)')
        self.connection.executemany('INSERT INTO orders VALUES (?, ?, ?)', [(1, 10, 'open'), (2, 20, 'open'), (3, 30, 'closed')])
        self.connection.commit()
        self.store = OrderStore(self.connection)
        self.app = Workspace(self.store)

    def test_update_and_requery_use_same_filter_page_and_survive_reopen(self):
        self.app.search('open', 2)
        sql = []
        self.connection.set_trace_callback(sql.append)
        self.app.set_status(1, 'closed')
        self.connection.set_trace_callback(None)
        business = [s for s in sql if s.startswith('UPDATE') or s.startswith('SELECT')]
        self.assertEqual(len(business), 2)
        self.assertRegex(business[0], r"UPDATE orders SET status='closed' WHERE id=1\b")
        self.assertIn("status='open'", business[1])
        self.assertIn('OFFSET 1', business[1])
        self.assertEqual(self.app.snapshot()['data'], {'query': 'open', 'page': 2, 'items': []})
        with sqlite3.connect(self.database) as reopened:
            self.assertEqual(reopened.execute('SELECT id, amount, status FROM orders ORDER BY id').fetchall(),
                             [(1, 10, 'closed'), (2, 20, 'open'), (3, 30, 'closed')])

    def test_refresh_error_rolls_back_database_and_preserves_previous_list(self):
        self.app.search('open', 1)
        before = self.app.snapshot()
        with patch.object(self.store, 'search', side_effect=sqlite3.OperationalError('REFRESH_FAILED')):
            with self.assertRaisesRegex(sqlite3.OperationalError, 'REFRESH_FAILED'):
                self.app.set_status(2, 'closed')
        self.assertEqual(self.app.snapshot()['data'], {**before['data'], 'error': 'REFRESH_FAILED'})
        self.assertEqual(self.connection.execute('SELECT status FROM orders WHERE id=2').fetchone()[0], 'open')

    def test_real_write_failure_is_traced_and_retry_clears_error(self):
        self.app.search('open', 1)
        before = self.app.snapshot()
        self.connection.execute("CREATE TRIGGER reject_status BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT,'STATUS_REJECTED'); END")
        path = Path(self.temp.name) / 'failed.jsonl'
        with Flow('상태 변경 실패', path=path) as flow:
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'STATUS_REJECTED'):
                flow.transition('orders.status', 'DB 저장 실패 후 원래 목록 유지', self.app.set_status,
                                inputs={'identifier': 2, 'status': 'closed'}, state=self.app.snapshot)
        checked = verify_trace(path, {'status': 'failed', 'state': {
            'screens': EXPECTED['state']['screens'], 'transitions': [
                {'step': 0, 'from': 'orders.list', 'to': 'orders.list', 'preserve': ['query', 'page', 'items']}]}})
        self.assertTrue(checked['valid'], checked['issues'])
        self.assertEqual(self.app.snapshot()['data'], {**before['data'], 'error': 'STATUS_REJECTED'})
        self.assertEqual(self.connection.execute('SELECT status FROM orders WHERE id=2').fetchone()[0], 'open')
        self.connection.execute('DROP TRIGGER reject_status')
        self.app.set_status(2, 'closed')
        self.assertNotIn('error', self.app.snapshot()['data'])

    def test_repository_rejects_invalid_input_and_missing_order_without_changes(self):
        original = self.connection.execute('SELECT * FROM orders ORDER BY id').fetchall()
        for identifier, status in [(True, 'closed'), ('1', 'closed'), (0, 'closed'), (-1, 'closed'), (1, 'bad'), (1, None)]:
            sql = []
            self.connection.set_trace_callback(sql.append)
            with self.subTest(identifier=identifier, status=status), self.assertRaises(ValueError):
                self.store.set_status(identifier, status, '', 1)
            self.connection.set_trace_callback(None)
            self.assertFalse(any(s.startswith('UPDATE') for s in sql), sql)
            self.assertEqual(self.connection.execute('SELECT * FROM orders ORDER BY id').fetchall(), original)
        with self.assertRaises(ValueError):
            self.store.set_status(999, 'closed', '', 1)
        self.assertEqual(self.connection.execute('SELECT * FROM orders ORDER BY id').fetchall(), original)

    def test_same_status_is_idempotent_and_unfiltered_refresh_returns_canonical_row(self):
        self.app.search('', 1)
        self.app.set_status(3, 'closed')
        self.assertEqual(self.app.snapshot()['data']['items'], [{'id': 3, 'amount': 30, 'status': 'closed'}])
        self.app.set_status(3, 'open')
        self.assertEqual(self.app.snapshot()['data']['items'], [{'id': 3, 'amount': 30, 'status': 'open'}])

    def test_real_workflow_matches_frozen_state_and_data_provenance(self):
        from examples.order_status.scenario import run_status_flow
        result = run_status_flow(self.connection)
        checked = verify_trace(result['trace'], EXPECTED)
        self.assertTrue(checked['valid'], checked['issues'])
        self.assertEqual(len(checked['steps']), 7)
        self.assertEqual(result['final'], {'feature': 'home', 'screen': 'home', 'data': {}})
        self.assertEqual(self.connection.execute('SELECT id, amount, status FROM orders ORDER BY id').fetchall(),
                         [(1, 10, 'closed'), (2, 20, 'open'), (3, 30, 'open')])
        records = [json.loads(line) for line in Path(result['trace']).read_text().splitlines()]
        variants = {}
        from copy import deepcopy
        wrong_description = deepcopy(records)
        next(r for r in wrong_description if r['event'] == 'step.started')['description'] = '전혀 다른 작업'
        variants['description'] = wrong_description
        variants['missing'] = [r for r in deepcopy(records) if not (r['event'] == 'step.finished' and r['step_id'] == checked['steps'][2]['id'])]
        wrong_value = deepcopy(records)
        next(r for r in wrong_value if r['event'] == 'step.inputs' and r['step_id'] == checked['steps'][2]['id'])['inputs']['status'] = 'open'
        variants['value'] = wrong_value
        wrong_order = deepcopy(records)
        starts = [r for r in wrong_order if r['event'] == 'step.started']
        starts[0]['operation'], starts[1]['operation'] = starts[1]['operation'], starts[0]['operation']
        variants['order'] = wrong_order
        literal_copy = deepcopy(records)
        next(r for r in literal_copy if r['event'] == 'step.inputs' and r['step_id'] == checked['steps'][2]['id'])['bindings'] = []
        variants['literal-without-provenance'] = literal_copy
        for name, variant in variants.items():
            with self.subTest(rejected=name):
                for seq, record in enumerate(variant):
                    record['sequence'] = seq
                path = Path(self.temp.name) / (name + '.jsonl')
                path.write_text(''.join(json.dumps(r) + '\n' for r in variant))
                self.assertFalse(verify_trace(path, EXPECTED)['valid'])


if __name__ == '__main__':
    unittest.main()
