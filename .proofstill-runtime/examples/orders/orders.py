import json
import sqlite3


def deduplicate(orders):
    result, seen = [], set()
    for order in orders:
        identifier = order.get('id')
        if identifier is None or identifier == '':
            raise ValueError('order id is required')
        if identifier not in seen:
            result.append(dict(order))
            seen.add(identifier)
    return result


class OrderStore:
    def __init__(self, path):
        self.connection = sqlite3.connect(path)
        self.connection.execute('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.connection.close()

    def add(self, orders):
        unique = deduplicate(orders)
        before = self.connection.total_changes
        with self.connection:
            self.connection.executemany('INSERT OR IGNORE INTO orders VALUES (?, ?)',
                                        ((order['id'], json.dumps(order)) for order in unique))
        return self.connection.total_changes - before

    def rows(self):
        return [json.loads(row[0]) for row in self.connection.execute('SELECT payload FROM orders ORDER BY rowid')]
