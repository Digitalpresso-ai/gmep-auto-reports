from copy import deepcopy
import unittest
from examples.order_workspace.workspace import Workspace


class MemoryOrders:
    def __init__(self):
        self.rows = {1: {'id': 1, 'amount': 10, 'status': 'open'},
                     2: {'id': 2, 'amount': 20, 'status': 'open'},
                     3: {'id': 3, 'amount': 30, 'status': 'closed'}}
        self.calls, self.queries, self.fail = [], [], False

    def search(self, query, page):
        self.queries.append((query, page))
        rows = [deepcopy(row) for _, row in sorted(self.rows.items(), reverse=True)
                if not query or row['status'] == query]
        return rows[page - 1:page]

    def get(self, identifier):
        return deepcopy(self.rows[identifier])

    def set_status(self, identifier, status, query, page):
        self.calls.append((identifier, status, query, page))
        if self.fail:
            raise OSError('STATUS_WRITE_FAILED')
        self.rows[identifier]['status'] = status
        return self.search(query, page)


class StatusWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.store = MemoryOrders()
        self.app = Workspace(self.store)
        self.assertTrue(callable(getattr(self.app, 'set_status', None)), 'STATUS_WORKSPACE_NOT_IMPLEMENTED')

    def test_filtered_update_requeries_same_page_and_keeps_only_list_state(self):
        self.app.search('open', 2)
        self.app.set_status(1, 'closed')
        self.assertEqual(self.store.calls, [(1, 'closed', 'open', 2)])
        self.assertEqual(self.store.queries, [('open', 2), ('open', 2)])
        self.assertEqual(self.app.snapshot(), {'feature': 'orders', 'screen': 'orders.list',
                                             'data': {'query': 'open', 'page': 2, 'items': []}})
        self.assertEqual(self.store.rows[1], {'id': 1, 'amount': 10, 'status': 'closed'})
        self.assertEqual(self.store.rows[2]['status'], 'open')

    def test_unfiltered_update_replaces_visible_row_with_canonical_result(self):
        self.app.search('', 1)
        self.app.set_status(3, 'open')
        self.assertEqual(self.app.snapshot()['data']['items'], [{'id': 3, 'amount': 30, 'status': 'open'}])
        self.assertEqual(self.store.calls, [(3, 'open', '', 1)])

    def test_nonvisible_or_invalid_input_is_rejected_before_store_and_state_change(self):
        self.app.search('open', 2)
        before = self.app.snapshot()
        for identifier, status in [(2, 'closed'), (999, 'closed'), (True, 'closed'), ('1', 'closed'), (0, 'closed'), (-1, 'closed'),
                                   (1, 'unknown'), (1, None), (1, True)]:
            with self.subTest(identifier=identifier, status=status), self.assertRaises(ValueError):
                self.app.set_status(identifier, status)
            self.assertEqual(self.app.snapshot(), before)
        self.assertEqual(self.store.calls, [])

    def test_home_detail_and_edit_cannot_change_status(self):
        for screen in ['home', 'detail', 'edit']:
            if screen != 'home':
                self.app.search('open', 1)
                token = self.app.begin_detail(2)
                self.app.accept_detail(token, self.store.get(2))
                if screen == 'edit':
                    self.app.begin_edit()
            before = self.app.snapshot()
            with self.subTest(screen=screen), self.assertRaises(ValueError):
                self.app.set_status(2, 'closed')
            self.assertEqual(self.app.snapshot(), before)
        self.assertEqual(self.store.calls, [])

    def test_failure_keeps_old_list_and_query_then_retry_clears_error(self):
        self.app.search('open', 1)
        before = self.app.snapshot()
        self.store.fail = True
        with self.assertRaisesRegex(OSError, 'STATUS_WRITE_FAILED'):
            self.app.set_status(2, 'closed')
        failed = self.app.snapshot()
        self.assertEqual(failed['screen'], 'orders.list')
        self.assertEqual(failed['data'], {**before['data'], 'error': 'STATUS_WRITE_FAILED'})
        self.assertEqual(self.store.rows[2]['status'], 'open')
        self.store.fail = False
        self.app.set_status(2, 'closed')
        self.assertNotIn('error', self.app.snapshot()['data'])
        self.assertEqual(self.app.snapshot()['data']['items'], [{'id': 1, 'amount': 10, 'status': 'open'}])

    def test_feature_exit_and_reentry_drop_error_and_old_navigation(self):
        self.app.search('open', 2)
        self.store.fail = True
        with self.assertRaises(OSError):
            self.app.set_status(1, 'closed')
        self.app.leave()
        self.assertEqual(self.app.snapshot(), {'feature': 'home', 'screen': 'home', 'data': {}})
        self.app.search()
        state = self.app.snapshot()
        self.assertEqual((state['data']['query'], state['data']['page']), ('', 1))
        self.assertEqual(set(state['data']), {'query', 'page', 'items'})


if __name__ == '__main__':
    unittest.main()
