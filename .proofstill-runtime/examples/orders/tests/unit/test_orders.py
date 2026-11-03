import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from orders import deduplicate


class OrderTests(unittest.TestCase):
    def test_keeps_first_order_for_duplicate_id(self):
        original = [{'id': 'a', 'amount': 10}, {'id': 'a', 'amount': 99}, {'id': 'b', 'amount': 20}]
        before = copy.deepcopy(original)
        result = deduplicate(original)
        self.assertEqual(result, [before[0], before[2]])
        self.assertEqual(original, before)

    def test_rejects_empty_id(self):
        with self.assertRaises(ValueError):
            deduplicate([{'id': '', 'amount': 1}])

    def test_rejects_missing_id(self):
        with self.assertRaises(ValueError):
            deduplicate([{'amount': 1}])

    def test_empty_input_is_valid(self):
        self.assertEqual(deduplicate([]), [])
