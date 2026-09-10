import hashlib
import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import errors

from .db import PoolTimeout, connection, create_pool
from .schemas import Login, ProductCreate, ProductOut, ProductPage, ProductUpdate, ReceiptCreate, ReceiptOut, StockAdjustment
from .security import hash_password, token_hash, verify_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = create_pool()
    app.state.pool.open(wait=True, timeout=15)
    yield
    app.state.pool.close()


app = FastAPI(title='ИС супермаркета — вариант 36', version='1.0.0', lifespan=lifespan,
              docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url=None)
bearer = HTTPBearer(auto_error=False)
SafeId = Annotated[int, Path(gt=0, le=9007199254740991)]
DUMMY_HASH = hash_password('invalid-user-dummy-password')


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(status_code=422, content={'detail': [
        {'loc': list(e['loc']), 'msg': e['msg'], 'type': e['type']} for e in exc.errors()
    ]})


@app.exception_handler(errors.UniqueViolation)
async def duplicate_error(request, exc):
    return JSONResponse(status_code=409, content={'detail': 'Запись с таким уникальным значением уже существует'})


@app.exception_handler(errors.CheckViolation)
async def constraint_error(request, exc):
    return JSONResponse(status_code=409, content={'detail': 'Операция нарушает ограничение данных'})


@app.exception_handler(PoolTimeout)
@app.exception_handler(errors.LockNotAvailable)
@app.exception_handler(errors.DeadlockDetected)
@app.exception_handler(errors.QueryCanceled)
async def busy_error(request, exc):
    return JSONResponse(status_code=503, content={'detail': 'Сервис занят. Повторите запрос с тем же идентификатором'}, headers={'Retry-After': '2'})


def current_user(request: Request, auth: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not auth or len(auth.credentials) > 256:
        raise HTTPException(401, 'Требуется вход', headers={'WWW-Authenticate': 'Bearer'})
    with connection(request) as conn:
        user = conn.execute('''SELECT u.id, u.username, u.display_name, u.role FROM sessions s
            JOIN app_users u ON u.id=s.user_id
            WHERE s.token_hash=%s AND s.expires_at>now() AND u.active''', (token_hash(auth.credentials),)).fetchone()
    if not user:
        raise HTTPException(401, 'Сессия истекла или недействительна', headers={'WWW-Authenticate': 'Bearer'})
    return user


def permit(*roles):
    def dependency(user=Depends(current_user)):
        if user['role'] not in roles:
            raise HTTPException(403, 'Недостаточно прав')
        return user
    return dependency


@app.get('/api/health')
def health(request: Request):
    with connection(request) as conn:
        conn.execute('SELECT 1')
    return {'status': 'ok'}


@app.post('/api/auth/login')
def login(body: Login, request: Request, response: Response):
    with connection(request) as conn:
        user = conn.execute('SELECT * FROM app_users WHERE username=%s', (body.username,)).fetchone()
        valid = verify_password(body.password, user['password_hash'] if user else DUMMY_HASH)
        if not valid or not user or not user['active']:
            raise HTTPException(401, 'Неверный логин или пароль')
        token = secrets.token_urlsafe(32)
        conn.execute('DELETE FROM sessions WHERE expires_at <= now()')
        expiry = conn.execute('INSERT INTO sessions(token_hash,user_id) VALUES (%s,%s) RETURNING expires_at', (token_hash(token), user['id'])).fetchone()['expires_at']
    response.headers['Cache-Control'] = 'no-store'
    return {'access_token': token, 'token_type': 'bearer', 'expires_at': expiry}


@app.get('/api/auth/me')
def me(user=Depends(current_user)):
    return user


@app.post('/api/auth/logout', status_code=204)
def logout(request: Request, auth=Depends(bearer), user=Depends(current_user)):
    with connection(request) as conn:
        conn.execute('DELETE FROM sessions WHERE token_hash=%s', (token_hash(auth.credentials),))


@app.get('/api/products', response_model=ProductPage)
def list_products(request: Request, q: str = Query('', max_length=160), category: str = Query('', max_length=60),
                  after: int = Query(0, ge=0, le=9007199254740991), limit: int = Query(24, ge=1, le=100),
                  include_archived: bool = False, user=Depends(current_user)):
    if include_archived and user['role'] != 'manager':
        raise HTTPException(403, 'Архив доступен менеджеру')
    q, category = q.strip(), category.strip()
    if q and len(q) < 3:
        raise HTTPException(422, 'Введите не менее трёх символов для поиска')
    where, values = ['id > %s'], [after]
    if not include_archived:
        where.append('active')
    if q:
        if q.isascii() and q.isdigit() and 8 <= len(q) <= 14:
            where.append('barcode=%s')
            values.append(q)
        else:
            where.append("lower(name COLLATE unicode_case) LIKE lower(%s COLLATE unicode_case) ESCAPE E'\\\\'")
            values.append('%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%')
    if category:
        where.append('category=%s')
        values.append(category)
    # Only hardcoded SQL fragments are interpolated; all request values are bound.
    with connection(request) as conn:
        rows = conn.execute('SELECT id,barcode,name,category,price,stock,active,version FROM products WHERE '
                            + ' AND '.join(where) + ' ORDER BY id LIMIT %s', [*values, limit+1]).fetchall()
    return {'items': rows[:limit], 'next_cursor': rows[limit-1]['id'] if len(rows)>limit else None}


@app.post('/api/products', response_model=ProductOut, status_code=201)
def create_product(body: ProductCreate, request: Request, user=Depends(permit('manager'))):
    with connection(request) as conn:
        return conn.execute('''INSERT INTO products(barcode,name,category,price) VALUES (%s,%s,%s,%s)
            RETURNING *''', (body.barcode, body.name, body.category, body.price)).fetchone()


@app.put('/api/products/{product_id}', response_model=ProductOut)
def update_product(product_id: SafeId, body: ProductUpdate, request: Request, user=Depends(permit('manager'))):
    with connection(request) as conn:
        row = conn.execute('''UPDATE products SET barcode=%s,name=%s,category=%s,price=%s,active=%s,
            version=version+1,updated_at=now() WHERE id=%s AND version=%s RETURNING *''',
            (body.barcode, body.name, body.category, body.price, body.active, product_id, body.version)).fetchone()
        if not row:
            exists = conn.execute('SELECT 1 FROM products WHERE id=%s', (product_id,)).fetchone()
            raise HTTPException(409 if exists else 404, 'Товар изменён другим пользователем' if exists else 'Товар не найден')
        return row


@app.post('/api/products/{product_id}/stock', response_model=ProductOut)
def adjust_stock(product_id: SafeId, body: StockAdjustment, request: Request, user=Depends(permit('manager'))):
    with connection(request) as conn:
        product = conn.execute('SELECT * FROM products WHERE id=%s FOR UPDATE', (product_id,)).fetchone()
        if not product:
            raise HTTPException(404, 'Товар не найден')
        if not 0 <= product['stock']+body.delta <= 1000000000:
            raise HTTPException(409, 'Остаток вне допустимого диапазона')
        conn.execute('INSERT INTO stock_movements(product_id,actor_id,delta,reason) VALUES (%s,%s,%s,%s)',
                     (product_id, user['id'], body.delta, body.reason))
        return conn.execute('UPDATE products SET stock=stock+%s,version=version+1,updated_at=now() WHERE id=%s RETURNING *', (body.delta, product_id)).fetchone()


def read_receipt(conn, receipt_id, user, lock=False):
    receipt = conn.execute('SELECT * FROM receipts WHERE id=%s' + (' FOR UPDATE' if lock else ''), (receipt_id,)).fetchone()
    if not receipt or (user['role']=='cashier' and receipt['cashier_id'] != user['id']):
        raise HTTPException(404, 'Чек не найден')
    receipt['items'] = conn.execute('SELECT product_id,product_name,barcode,quantity,unit_price,line_total FROM receipt_items WHERE receipt_id=%s ORDER BY product_id', (receipt_id,)).fetchall()
    from decimal import Decimal
    receipt['total'] = sum((i['line_total'] for i in receipt['items']), Decimal('0.00'))
    return receipt


@app.post('/api/receipts', response_model=ReceiptOut, status_code=201)
def create_receipt(body: ReceiptCreate, request: Request, user=Depends(permit('cashier', 'manager'))):
    lines = sorted(body.items, key=lambda i: i.product_id)
    digest = hashlib.sha256(json.dumps([(i.product_id,i.quantity) for i in lines]).encode()).hexdigest()
    with connection(request) as conn:
        inserted = conn.execute('''INSERT INTO receipts(request_id,payload_hash,cashier_id) VALUES (%s,%s,%s)
            ON CONFLICT(request_id) DO NOTHING RETURNING id''', (body.request_id, digest, user['id'])).fetchone()
        if not inserted:
            existing = conn.execute('SELECT * FROM receipts WHERE request_id=%s', (body.request_id,)).fetchone()
            if existing['cashier_id'] != user['id'] or existing['payload_hash'] != digest:
                raise HTTPException(409, 'Идентификатор запроса уже использован с другим содержимым')
            return read_receipt(conn, existing['id'], user)
        products = conn.execute('SELECT * FROM products WHERE id=ANY(%s) ORDER BY id FOR SHARE', ([i.product_id for i in lines],)).fetchall()
        by_id = {p['id']: p for p in products}
        for line in lines:
            p = by_id.get(line.product_id)
            if not p or not p['active']:
                raise HTTPException(409, 'Товар отсутствует или находится в архиве')
            if p['stock'] < line.quantity:
                raise HTTPException(409, f'Недостаточно товара: {p["name"]}')
            conn.execute('''INSERT INTO receipt_items(receipt_id,product_id,product_name,barcode,quantity,unit_price)
                VALUES (%s,%s,%s,%s,%s,%s)''', (inserted['id'], p['id'], p['name'], p['barcode'], line.quantity, p['price']))
        return read_receipt(conn, inserted['id'], user)


@app.get('/api/receipts')
def list_receipts(request: Request, before: int = Query(9007199254740991, gt=0, le=9007199254740991),
                  limit: int = Query(24, ge=1, le=100), user=Depends(current_user)):
    with connection(request) as conn:
        condition = ' AND cashier_id=%s' if user['role']=='cashier' else ''
        params = [before, user['id'], limit+1] if condition else [before, limit+1]
        rows = conn.execute('SELECT id,status,created_at,cashier_id FROM receipts WHERE id<%s'+condition+' ORDER BY id DESC LIMIT %s', params).fetchall()
    return {'items': rows[:limit], 'next_cursor': rows[limit-1]['id'] if len(rows)>limit else None}


@app.get('/api/receipts/{receipt_id}', response_model=ReceiptOut)
def get_receipt(receipt_id: SafeId, request: Request, user=Depends(current_user)):
    with connection(request) as conn:
        return read_receipt(conn, receipt_id, user)


@app.post('/api/receipts/{receipt_id}/pay', response_model=ReceiptOut)
def pay_receipt(receipt_id: SafeId, request: Request, user=Depends(permit('cashier','manager'))):
    with connection(request) as conn:
        receipt = read_receipt(conn, receipt_id, user, lock=True)
        if receipt['status']=='paid':
            return receipt
        if receipt['status']!='draft':
            raise HTTPException(409, 'Отменённый чек нельзя оплатить')
        products = conn.execute('SELECT * FROM products WHERE id=ANY(%s) ORDER BY id FOR UPDATE', ([i['product_id'] for i in receipt['items']],)).fetchall()
        stock = {p['id']: p for p in products}
        for line in receipt['items']:
            p = stock[line['product_id']]
            if not p['active'] or p['stock'] < line['quantity']:
                raise HTTPException(409, f'Недостаточно товара или товар в архиве: {p["name"]}')
        for line in receipt['items']:
            conn.execute('UPDATE products SET stock=stock-%s,version=version+1,updated_at=now() WHERE id=%s', (line['quantity'], line['product_id']))
            conn.execute('''INSERT INTO stock_movements(product_id,actor_id,receipt_id,delta,reason)
                VALUES (%s,%s,%s,%s,'Продажа на кассе')''', (line['product_id'], user['id'], receipt_id, -line['quantity']))
        conn.execute("UPDATE receipts SET status='paid',paid_at=now() WHERE id=%s", (receipt_id,))
        return read_receipt(conn, receipt_id, user)


@app.post('/api/receipts/{receipt_id}/cancel', response_model=ReceiptOut)
def cancel_receipt(receipt_id: SafeId, request: Request, user=Depends(permit('cashier','manager'))):
    with connection(request) as conn:
        receipt = read_receipt(conn, receipt_id, user, lock=True)
        if receipt['status']=='paid':
            raise HTTPException(409, 'Оплаченный чек нельзя отменить')
        if receipt['status']=='draft':
            conn.execute("UPDATE receipts SET status='cancelled' WHERE id=%s", (receipt_id,))
        return read_receipt(conn, receipt_id, user)
