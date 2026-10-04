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
from app.seed import PRODUCTS, validate_seed_catalog


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
    paid=client.post(f'/api/receipts/{r["id"]}/pay',json={'payment_method':'cash','cash_received':'50.00'},headers=tokens['cashier']); assert paid.status_code==200,paid.text
    assert paid.json()['total']=='39.80'
    assert paid.json()['payment_method']=='cash' and paid.json()['change_due']=='10.20'
    replay=client.post(f'/api/receipts/{r["id"]}/pay',json={'payment_method':'card_simulated'},headers=tokens['cashier'])
    assert replay.status_code==200 and replay.json()['change_due']=='10.20'
    assert client.post(f'/api/receipts/{r["id"]}/cancel',headers=tokens['cashier']).status_code==409
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==3
        assert conn.execute('SELECT count(*) FROM market.stock_movements WHERE receipt_id=%s',(r['id'],)).fetchone()[0]==1


def test_competing_sales_do_not_oversell(client,tokens):
    p=product(client,tokens,stock=1)
    ids=[receipt(client,tokens,p).json()['id'] for _ in range(2)]
    def pay(i): return client.post(f'/api/receipts/{i}/pay',json={'payment_method':'card_simulated'},headers=tokens['cashier']).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(pay,ids))==[200,409]
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==0


def test_cancel_version_and_archive(client,tokens):
    p=product(client,tokens); r=receipt(client,tokens,p).json()
    assert client.post(f'/api/receipts/{r["id"]}/cancel',headers=tokens['cashier']).status_code==200
    assert client.post(f'/api/receipts/{r["id"]}/cancel',headers=tokens['cashier']).status_code==200
    assert client.post(f'/api/receipts/{r["id"]}/pay',json={'payment_method':'cash','cash_received':'19.90'},headers=tokens['cashier']).status_code==409
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


def test_product_details_and_server_validation(client,tokens):
    p=product(client,tokens)
    body={k:p[k] for k in ['barcode','name','category','price','version','active']}
    body.update({
        'brand':'Тестовый бренд',
        'description':'Описание товара',
        'ingredients':'Молоко нормализованное',
        'proteins':'3.00','fats':'2.50','carbohydrates':'4.70','calories':'53',
        'image_url':'https://example.test/product.png',
        'source_url':'https://example.test/product',
    })
    changed=client.put(f'/api/products/{p["id"]}',json=body,headers=tokens['manager'])
    assert changed.status_code==200,changed.text
    detail=client.get(f'/api/products/{p["id"]}',headers=tokens['cashier'])
    assert detail.status_code==200,detail.text
    assert detail.json()['ingredients']=='Молоко нормализованное'
    assert detail.json()['proteins']=='3.00'
    assert detail.json()['image_url']=='https://example.test/product.png'
    body['version']=changed.json()['version']; body['proteins']=-1
    assert client.put(f'/api/products/{p["id"]}',json=body,headers=tokens['manager']).status_code==422
    assert client.get('/api/products/9007199254740000',headers=tokens['cashier']).status_code==404


def test_database_role_cannot_write_ddl_or_delete_history(client):
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        for sql in ['CREATE TABLE market.not_allowed(id integer)', 'DELETE FROM market.receipts', 'UPDATE market.app_users SET active=false']:
            with unittest.TestCase().assertRaises(psycopg.errors.InsufficientPrivilege):
                with conn.transaction(): conn.execute(sql)


def test_cash_payment(client,tokens):
    p=product(client,tokens,stock=2); r=receipt(client,tokens,p).json()
    url=f'/api/receipts/{r["id"]}/pay'
    short=client.post(url,json={'payment_method':'cash','cash_received':'19.89'},headers=tokens['cashier'])
    assert short.status_code==422,short.text
    assert 'Не хватает 0.01' in short.json()['detail']
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT status FROM market.receipts WHERE id=%s',(r['id'],)).fetchone()[0]=='draft'
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==2
        assert conn.execute('SELECT count(*) FROM market.stock_movements WHERE receipt_id=%s',(r['id'],)).fetchone()[0]==0
    paid=client.post(url,json={'payment_method':'cash','cash_received':'50.00'},headers=tokens['cashier'])
    assert paid.status_code==200,paid.text
    assert paid.json()['cash_received']=='50.00' and paid.json()['change_due']=='30.10'
    assert client.post(url,json={'payment_method':'cash'},headers=tokens['cashier']).status_code==422
    assert client.post(url,json={'payment_method':'cash','cash_received':'50.00','total':'19.90'},headers=tokens['cashier']).status_code==422
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==1
        assert conn.execute('SELECT count(*) FROM market.stock_movements WHERE receipt_id=%s',(r['id'],)).fetchone()[0]==1


def test_card_payment(client,tokens):
    p=product(client,tokens,stock=2); r=receipt(client,tokens,p).json()
    url=f'/api/receipts/{r["id"]}/pay'
    mismatch=client.post(url,json={'payment_method':'card_simulated','cash_received':'50.00'},headers=tokens['cashier'])
    assert mismatch.status_code==422
    declined=client.post(url,json={'payment_method':'card_simulated','card_outcome':'declined'},headers=tokens['cashier'])
    assert declined.status_code==402,declined.text
    assert 'остался черновиком' in declined.json()['detail']
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT status FROM market.receipts WHERE id=%s',(r['id'],)).fetchone()[0]=='draft'
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==2
        assert conn.execute('SELECT count(*) FROM market.stock_movements WHERE receipt_id=%s',(r['id'],)).fetchone()[0]==0
    paid=client.post(url,json={'payment_method':'card_simulated'},headers=tokens['cashier'])
    assert paid.status_code==200,paid.text
    assert paid.json()['payment_method']=='card_simulated'
    assert paid.json()['cash_received'] is None and paid.json()['change_due'] is None
    replay=client.post(url,json={'payment_method':'card_simulated'},headers=tokens['cashier'])
    assert replay.status_code==200 and replay.json()['payment_method']=='card_simulated'
    with psycopg.connect(os.environ['TEST_ADMIN_URL']) as conn:
        assert conn.execute('SELECT stock FROM market.products WHERE id=%s',(p['id'],)).fetchone()[0]==1
        assert conn.execute('SELECT count(*) FROM market.stock_movements WHERE receipt_id=%s',(r['id'],)).fetchone()[0]==1


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
    def test_product_details(self): test_product_details_and_server_validation(self.client, self.auth)
    def test_permissions(self): test_database_role_cannot_write_ddl_or_delete_history(self.client)
    def test_cash_payment(self): test_cash_payment(self.client, self.auth)
    def test_card_payment(self): test_card_payment(self.client, self.auth)
    def test_money(self):
        for price in ['-1','0','1.001','NaN','Infinity','1000000.00']:
            with self.subTest(price=price): test_invalid_money(self.client, self.auth, price)


class SeedCatalogUnit(unittest.TestCase):
    def test_seed_cards_are_complete_and_have_unique_valid_ean13(self):
        validate_seed_catalog()
        self.assertEqual(len(PRODUCTS), 30)
        self.assertEqual(len({row[0] for row in PRODUCTS}), 30)


if __name__ == '__main__':
    unittest.main()
