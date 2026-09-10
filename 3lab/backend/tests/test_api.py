"""Integration tests against a dedicated initialized PostgreSQL database.

DATABASE_URL must reference a database ending in _test (market_app role).
TEST_ADMIN_URL references the same database using market_admin.
Tests add data with random barcodes and do not truncate any tables.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import psycopg
import unittest
from contextlib import contextmanager
from fastapi.testclient import TestClient

from app.main import app
from app.security import hash_password


@contextmanager
def initialized_client():
    if not os.environ.get('DATABASE_URL') or not os.environ.get('TEST_ADMIN_URL'):
        raise unittest.SkipTest('Set DATABASE_URL and TEST_ADMIN_URL for a dedicated PostgreSQL test database')
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        name = conn.execute('SELECT current_database()').fetchone()[0]
        assert name.endswith('_test'), 'Refusing to run outside a dedicated _test database'
        identity_sql = 'SELECT current_database(), inet_server_addr(), inet_server_port(), pg_postmaster_start_time()'
        admin_identity = conn.execute(identity_sql).fetchone()
        with psycopg.connect(os.environ['DATABASE_URL']) as api_conn:
            assert api_conn.execute(identity_sql).fetchone() == admin_identity, 'API and admin must use the same test database'
        for role in ['manager','cashier','auditor']:
            conn.execute('''INSERT INTO market.app_users(username,display_name,password_hash,role)
                VALUES (%s,%s,%s,%s) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,active=true''',
                (f'test_{role}',f'Test {role}',hash_password('test-password-36'),role))
    with TestClient(app) as c:
        yield c


def tokens(client):
    return {role: {'Authorization': 'Bearer ' + client.post('/api/auth/login', json={'username':f'test_{role}','password':'test-password-36'}).json()['access_token']} for role in ['manager','cashier','auditor']}


def product(client, tokens, stock=5):
    payload={'barcode':str(uuid4().int % (10**13)).zfill(13),'name':'Тестовый товар','category':'Бакалея','price':'19.90'}
    response=client.post('/api/products',json=payload,headers=tokens['manager']); assert response.status_code==201,response.text
    p=response.json()
    if stock:
        r=client.post(f'/api/products/{p["id"]}/stock',json={'delta':stock,'reason':'Тестовое поступление'},headers=tokens['manager']); assert r.status_code==200,r.text
        p=r.json()
    return p


def receipt(client,tokens,p,quantity=1,key=None):
    return client.post('/api/receipts',json={'request_id':key or str(uuid4()),'items':[{'product_id':p['id'],'quantity':quantity}]},headers=tokens['cashier'])


def test_auth_and_roles(client,tokens):
    assert client.get('/api/products').status_code==401
    assert client.post('/api/auth/login',json={'username':'test_cashier','password':'wrong'}).status_code==401
    p=product(client,tokens)
    assert client.post(f'/api/products/{p["id"]}/stock',json={'delta':1,'reason':'Попытка кассира'},headers=tokens['cashier']).status_code==403
    assert client.post('/api/receipts',json={'request_id':str(uuid4()),'items':[{'product_id':p['id'],'quantity':1}]},headers=tokens['auditor']).status_code==403
    assert client.post('/api/auth/logout',headers=tokens['auditor']).status_code==204
    assert client.get('/api/auth/me',headers=tokens['auditor']).status_code==401


def test_invalid_money(client,tokens,price):
    body={'barcode':'4609999999999','name':'Проверка цены','category':'Бакалея','price':price}
    assert client.post('/api/products',json=body,headers=tokens['manager']).status_code==422


def test_invalid_receipt_and_catalog(client,tokens):
    p=product(client,tokens)
    for quantity in [0,-1,1.5,True,'2',10001]:
        assert receipt(client,tokens,p,quantity).status_code==422
    body={'request_id':str(uuid4()),'items':[{'product_id':p['id'],'quantity':1}]*2}
    assert client.post('/api/receipts',json=body,headers=tokens['cashier']).status_code==422
    body['items']=[]
    assert client.post('/api/receipts',json=body,headers=tokens['cashier']).status_code==422
    body['items']=[{'product_id':p['id'],'quantity':1}]; body['total']='0.01'
    assert client.post('/api/receipts',json=body,headers=tokens['cashier']).status_code==422
    assert client.get('/api/products?limit=101',headers=tokens['cashier']).status_code==422
    assert client.get('/api/products?q=ab',headers=tokens['cashier']).status_code==422
    assert client.get('/api/products?q=%25%27%20OR%201%3D1',headers=tokens['cashier']).status_code==200


def test_idempotency_and_price_snapshot(client,tokens):
    p=product(client,tokens); key=str(uuid4())
    first=receipt(client,tokens,p,2,key); assert first.status_code==201,first.text
    r=first.json(); assert r['total']=='39.80'
    assert receipt(client,tokens,p,2,key).json()['id']==r['id']
    assert receipt(client,tokens,p,3,key).status_code==409
    body={k:p[k] for k in ['barcode','name','category','price','version','active']}; body['price']='29.90'
    assert client.put(f'/api/products/{p["id"]}',json=body,headers=tokens['manager']).status_code==200
    paid=client.post(f'/api/receipts/{r["id"]}/pay',headers=tokens['cashier']); assert paid.status_code==200,paid.text
    assert paid.json()['total']=='39.80'
    assert client.post(f'/api/receipts/{r["id"]}/pay',headers=tokens['cashier']).status_code==200
    assert client.post(f'/api/receipts/{r["id"]}/cancel',headers=tokens['cashier']).status_code==409
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==3
        assert conn.execute('SELECT count(*) FROM market.stock_movements WHERE receipt_id=%s',(r['id'],)).fetchone()[0]==1


def test_competing_sales_do_not_oversell(client,tokens):
    p=product(client,tokens,stock=1)
    ids=[receipt(client,tokens,p).json()['id'] for _ in range(2)]
    def pay(i): return client.post(f'/api/receipts/{i}/pay',headers=tokens['cashier']).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(pay,ids))==[200,409]
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==0


def test_cancel_version_and_archive(client,tokens):
    p=product(client,tokens); r=receipt(client,tokens,p).json()
    assert client.post(f'/api/receipts/{r["id"]}/cancel',headers=tokens['cashier']).status_code==200
    assert client.post(f'/api/receipts/{r["id"]}/cancel',headers=tokens['cashier']).status_code==200
    assert client.post(f'/api/receipts/{r["id"]}/pay',headers=tokens['cashier']).status_code==409
    body={k:p[k] for k in ['barcode','name','category','price','version','active']}; body['active']=False
    assert client.put(f'/api/products/{p["id"]}',json=body,headers=tokens['manager']).status_code==200
    assert client.put(f'/api/products/{p["id"]}',json=body,headers=tokens['manager']).status_code==409
    assert receipt(client,tokens,p).status_code==409


def test_cursor_and_duplicate_barcode(client,tokens):
    p=product(client,tokens)
    result=client.get('/api/products',params={'q':'тЕсТоВыЙ'},headers=tokens['cashier'])
    assert result.status_code==200,result.text
    assert any('Тестовый' in item['name'] for item in result.json()['items'])
    body={k:p[k] for k in ['barcode','name','category','price']}
    assert client.post('/api/products',json=body,headers=tokens['manager']).status_code==409
    first=client.get('/api/products?limit=1',headers=tokens['cashier']).json()
    after=first['next_cursor']; assert after is not None
    second=client.get(f'/api/products?limit=1&after={after}',headers=tokens['cashier']).json()
    assert second['items'][0]['id']>first['items'][0]['id']


def test_database_role_cannot_write_ddl_or_delete_history(client):
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        for sql in ['CREATE TABLE market.not_allowed(id integer)', 'DELETE FROM market.receipts', 'UPDATE market.app_users SET active=false']:
            with unittest.TestCase().assertRaises(psycopg.errors.InsufficientPrivilege):
                with conn.transaction(): conn.execute(sql)


class APIIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = initialized_client()
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)

    def setUp(self):
        self.auth = tokens(self.client)

    def test_auth(self): test_auth_and_roles(self.client, self.auth)
    def test_validation(self): test_invalid_receipt_and_catalog(self.client, self.auth)
    def test_repeat_and_snapshot(self): test_idempotency_and_price_snapshot(self.client, self.auth)
    def test_concurrency(self): test_competing_sales_do_not_oversell(self.client, self.auth)
    def test_transitions(self): test_cancel_version_and_archive(self.client, self.auth)
    def test_pagination(self): test_cursor_and_duplicate_barcode(self.client, self.auth)
    def test_permissions(self): test_database_role_cannot_write_ddl_or_delete_history(self.client)
    def test_money(self):
        for price in ['-1','0','1.001','NaN','Infinity','1000000.00']:
            with self.subTest(price=price): test_invalid_money(self.client, self.auth, price)


if __name__ == '__main__':
    unittest.main()
