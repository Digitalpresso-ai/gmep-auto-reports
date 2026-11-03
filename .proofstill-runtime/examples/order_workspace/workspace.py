from copy import deepcopy


class UnsavedChanges(ValueError):
    pass


class Workspace:
    def __init__(self, store):
        self.store = store
        self._ticket = 0
        self._state = {'feature': 'home', 'screen': 'home', 'data': {}}

    def snapshot(self):
        return deepcopy(self._state)

    def view(self):
        state = self.snapshot()
        if state['screen'] == 'orders.list':
            state['total'] = sum(row['amount'] for row in state['data']['items'])
        return state

    def _screen(self, screen):
        if self._state['screen'] != screen:
            raise ValueError('현재 화면에서 할 수 없는 작업입니다')

    def _can_navigate(self):
        if self._state['screen'] == 'orders.edit':
            raise UnsavedChanges('저장하거나 명시적으로 취소한 뒤 이동하세요')

    def _navigation(self):
        data = self._state['data']
        return {'query': data['query'], 'page': data['page']}

    def search(self, query='', page=1):
        self._can_navigate()
        if not isinstance(query, str) or type(page) is not int or page < 1:
            raise ValueError('검색 조건과 페이지가 잘못됐습니다')
        items = self.store.search(query, page)
        self._state = {'feature': 'orders', 'screen': 'orders.list',
                       'data': {'query': query, 'page': page, 'items': items}}

    def set_status(self, identifier, status):
        self._screen('orders.list')
        data = self._state['data']
        if (type(identifier) is not int or identifier < 1 or status not in ['open', 'closed']
                or not any(row['id'] == identifier for row in data['items'])):
            raise ValueError('목록에 보이는 주문과 올바른 상태를 지정하세요')
        navigation = self._navigation()
        try:
            items = self.store.set_status(identifier, status, **navigation)
        except Exception as error:
            data['error'] = str(error)
            raise
        self._state = {'feature': 'orders', 'screen': 'orders.list',
                       'data': {**navigation, 'items': items}}

    def begin_detail(self, identifier):
        self._can_navigate()
        if self._state['feature'] != 'orders' or type(identifier) is not int or identifier < 1:
            raise ValueError('주문 기능에서 주문 ID를 선택하세요')
        self._ticket += 1
        self._state = {'feature': 'orders', 'screen': 'orders.detail',
                       'data': {**self._navigation(), 'selected_id': identifier, 'detail': None,
                                'request': self._ticket}}
        return self._ticket

    def accept_detail(self, ticket, row):
        data = self._state['data']
        if (type(ticket) is not int or self._state['screen'] != 'orders.detail'
                or 'request' not in data or data['request'] != ticket):
            return False
        if not isinstance(row, dict) or row.get('id') != data['selected_id']:
            raise ValueError('선택한 주문과 응답의 ID가 다릅니다')
        data['detail'] = deepcopy(row)
        del data['request']
        return True

    def begin_edit(self):
        self._screen('orders.detail')
        data = self._state['data']
        if data['detail'] is None or 'request' in data:
            raise ValueError('상세 조회가 끝나야 수정할 수 있습니다')
        self._state = {'feature': 'orders', 'screen': 'orders.edit',
                       'data': {**self._navigation(), 'selected_id': data['selected_id'],
                                'draft': {'amount': data['detail']['amount']}}}

    def change_amount(self, amount):
        self._screen('orders.edit')
        if type(amount) is not int or amount <= 0:
            raise ValueError('금액은 양의 정수여야 합니다')
        self._state['data']['draft']['amount'] = amount
        self._state['data'].pop('error', None)

    def save(self):
        self._screen('orders.edit')
        data = self._state['data']
        try:
            row = self.store.save(data['selected_id'], data['draft']['amount'])
        except Exception as error:
            data['error'] = str(error)
            raise
        self._show_detail(row)

    def _show_detail(self, row):
        self._state = {'feature': 'orders', 'screen': 'orders.detail',
                       'data': {**self._navigation(), 'selected_id': row['id'], 'detail': deepcopy(row)}}

    def cancel_edit(self):
        self._screen('orders.edit')
        row = self.store.get(self._state['data']['selected_id'])
        self._show_detail(row)

    def back_to_list(self):
        self._can_navigate()
        self._screen('orders.detail')
        self.search(**self._navigation())

    def leave(self):
        self._can_navigate()
        self._state = {'feature': 'home', 'screen': 'home', 'data': {}}
