class OrderStore:
    def __init__(self, connection):
        self.connection = connection

    @staticmethod
    def _row(row):
        if row is None:
            raise ValueError('주문이 없습니다')
        return dict(zip(['id', 'amount', 'status'], row))

    def search(self, query, page):
        rows = self.connection.execute(
            "SELECT id, amount, status FROM orders WHERE (?='' OR status=?) ORDER BY id DESC LIMIT 1 OFFSET ?",
            (query, query, page - 1)).fetchall()
        return [self._row(row) for row in rows]

    def get(self, identifier):
        return self._row(self.connection.execute('SELECT id, amount, status FROM orders WHERE id=?', (identifier,)).fetchone())

    def save(self, identifier, amount):
        with self.connection:
            updated = self.connection.execute('UPDATE orders SET amount=? WHERE id=?', (amount, identifier))
            if updated.rowcount != 1:
                raise ValueError('주문이 없습니다')
            row = self.get(identifier)
        return row

    def set_status(self, identifier, status, query, page):
        if type(identifier) is not int or identifier < 1 or status not in ['open', 'closed']:
            raise ValueError('주문 ID와 상태가 잘못됐습니다')
        with self.connection:
            updated = self.connection.execute('UPDATE orders SET status=? WHERE id=?', (status, identifier))
            if updated.rowcount != 1:
                raise ValueError('주문이 없습니다')
            return self.search(query, page)
