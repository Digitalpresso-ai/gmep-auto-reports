import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from orders import OrderStore


class StoreTests(unittest.TestCase):
    def test_persists_once_and_keeps_original_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'orders.sqlite'
            with OrderStore(path) as store:
                self.assertEqual(store.add([{'id': 'a', 'amount': 10}, {'id': 'b', 'amount': 20}]), 2)
                self.assertEqual(store.add([{'id': 'a', 'amount': 999}]), 0)
            with OrderStore(path) as store:
                self.assertEqual(store.rows(), [{'id': 'a', 'amount': 10}, {'id': 'b', 'amount': 20}])

    def test_invalid_batch_does_not_partially_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            with OrderStore(Path(tmp) / 'orders.sqlite') as store:
                with self.assertRaises(ValueError):
                    store.add([{'id': 'a', 'amount': 10}, {'id': '', 'amount': 20}])
                self.assertEqual(store.rows(), [])

    def test_missing_id_batch_does_not_partially_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            with OrderStore(Path(tmp) / 'orders.sqlite') as store:
                with self.assertRaises(ValueError):
                    store.add([{'id': 'a', 'amount': 10}, {'amount': 20}])
                self.assertEqual(store.rows(), [])

    def test_same_batch_duplicate_preserves_first_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            with OrderStore(Path(tmp) / 'orders.sqlite') as store:
                self.assertEqual(store.add([{'id': 'a', 'amount': 10}, {'id': 'a', 'amount': 999}, {'id': 'b', 'amount': 20}]), 2)
                self.assertEqual(store.rows(), [{'id': 'a', 'amount': 10}, {'id': 'b', 'amount': 20}])

    def test_invalid_batch_preserves_existing_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            with OrderStore(Path(tmp) / 'orders.sqlite') as store:
                store.add([{'id': 'old', 'amount': 5}])
                with self.assertRaises(ValueError):
                    store.add([{'id': 'new', 'amount': 10}, {'id': '', 'amount': 20}])
                self.assertEqual(store.rows(), [{'id': 'old', 'amount': 5}])

    def test_real_sqlite_survives_a_fresh_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'orders.sqlite'
            with OrderStore(path) as store:
                store.add([{'id': 'a', 'amount': 10}])
            self.assertTrue(path.is_file(), 'SQLITE_FILE_REQUIRED')
            self.assertTrue(path.read_bytes().startswith(b'SQLite format 3\x00'))
            with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as connection:
                self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            code = ('import json, sys; from orders import OrderStore; '
                    'store = OrderStore(sys.argv[1]); print(json.dumps(store.rows()))')
            result = subprocess.run([sys.executable, '-c', code, str(path)],
                                    cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), [{'id': 'a', 'amount': 10}])
