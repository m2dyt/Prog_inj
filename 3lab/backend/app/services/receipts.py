import hashlib
import json
from decimal import Decimal

from fastapi import HTTPException


def read(conn, receipt_id: int, user, *, lock: bool = False):
    receipt = conn.execute(
        "SELECT * FROM receipts WHERE id=%s" + (" FOR UPDATE" if lock else ""),
        (receipt_id,),
    ).fetchone()
    if not receipt or (user["role"] == "cashier" and receipt["cashier_id"] != user["id"]):
        raise HTTPException(404, "Чек не найден")
    receipt["items"] = conn.execute(
        """SELECT product_id,product_name,barcode,quantity,unit_price,line_total
        FROM receipt_items WHERE receipt_id=%s ORDER BY product_id""",
        (receipt_id,),
    ).fetchall()
    receipt["total"] = sum(
        (item["line_total"] for item in receipt["items"]), Decimal("0.00")
    )
    return receipt


def create(conn, body, user):
    lines = sorted(body.items, key=lambda item: item.product_id)
    digest = hashlib.sha256(
        json.dumps([(item.product_id, item.quantity) for item in lines]).encode()
    ).hexdigest()
    inserted = conn.execute(
        """INSERT INTO receipts(request_id,payload_hash,cashier_id) VALUES (%s,%s,%s)
        ON CONFLICT(request_id) DO NOTHING RETURNING id""",
        (body.request_id, digest, user["id"]),
    ).fetchone()
    if not inserted:
        existing = conn.execute(
            "SELECT * FROM receipts WHERE request_id=%s", (body.request_id,)
        ).fetchone()
        if existing["cashier_id"] != user["id"] or existing["payload_hash"] != digest:
            raise HTTPException(409, "Идентификатор запроса уже использован с другим содержимым")
        return read(conn, existing["id"], user)

    products = conn.execute(
        "SELECT * FROM products WHERE id=ANY(%s) ORDER BY id FOR SHARE",
        ([item.product_id for item in lines],),
    ).fetchall()
    by_id = {product["id"]: product for product in products}
    for line in lines:
        product = by_id.get(line.product_id)
        if not product or not product["active"]:
            raise HTTPException(409, "Товар отсутствует или находится в архиве")
        if product["stock"] < line.quantity:
            raise HTTPException(409, f'Недостаточно товара: {product["name"]}')
        conn.execute(
            """INSERT INTO receipt_items(
                receipt_id,product_id,product_name,barcode,quantity,unit_price
            ) VALUES (%s,%s,%s,%s,%s,%s)""",
            (
                inserted["id"],
                product["id"],
                product["name"],
                product["barcode"],
                line.quantity,
                product["price"],
            ),
        )
    return read(conn, inserted["id"], user)


def fetch_page(conn, *, before: int, limit: int, user):
    condition = " AND cashier_id=%s" if user["role"] == "cashier" else ""
    params = [before, user["id"], limit + 1] if condition else [before, limit + 1]
    rows = conn.execute(
        """SELECT id,status,created_at,cashier_id FROM receipts WHERE id<%s"""
        + condition
        + " ORDER BY id DESC LIMIT %s",
        params,
    ).fetchall()
    return {
        "items": rows[:limit],
        "next_cursor": rows[limit - 1]["id"] if len(rows) > limit else None,
    }


def pay(conn, receipt_id: int, user, payment):
    receipt = read(conn, receipt_id, user, lock=True)
    if receipt["status"] == "paid":
        return receipt
    if receipt["status"] != "draft":
        raise HTTPException(409, "Отменённый чек нельзя оплатить")
    cash_received = payment.cash_received
    change_due = None
    if payment.payment_method == 'cash':
        if cash_received < receipt['total']:
            missing = receipt['total'] - cash_received
            raise HTTPException(422, f'Недостаточно наличных. Не хватает {missing:.2f} ₽; чек остаётся черновиком.')
        change_due = cash_received - receipt['total']
    elif payment.card_outcome == 'declined':
        raise HTTPException(402, 'Учебный терминал отклонил оплату. Чек остался черновиком.')
    else:
        cash_received = None
    products = conn.execute(
        "SELECT * FROM products WHERE id=ANY(%s) ORDER BY id FOR UPDATE",
        ([item["product_id"] for item in receipt["items"]],),
    ).fetchall()
    stock = {product["id"]: product for product in products}
    for line in receipt["items"]:
        product = stock[line["product_id"]]
        if not product["active"] or product["stock"] < line["quantity"]:
            raise HTTPException(
                409,
                f'Недостаточно товара или товар в архиве: {product["name"]}',
            )
    for line in receipt["items"]:
        conn.execute(
            """UPDATE products SET stock=stock-%s,version=version+1,updated_at=now()
            WHERE id=%s""",
            (line["quantity"], line["product_id"]),
        )
        conn.execute(
            """INSERT INTO stock_movements(product_id,actor_id,receipt_id,delta,reason)
            VALUES (%s,%s,%s,%s,'Продажа на кассе')""",
            (line["product_id"], user["id"], receipt_id, -line["quantity"]),
        )
    conn.execute(
        """UPDATE receipts SET status='paid',paid_at=now(),payment_method=%s,
        cash_received=%s,change_due=%s WHERE id=%s""",
        (payment.payment_method, cash_received, change_due, receipt_id),
    )
    return read(conn, receipt_id, user)


def cancel(conn, receipt_id: int, user):
    receipt = read(conn, receipt_id, user, lock=True)
    if receipt["status"] == "paid":
        raise HTTPException(409, "Оплаченный чек нельзя отменить")
    if receipt["status"] == "draft":
        conn.execute("UPDATE receipts SET status='cancelled' WHERE id=%s", (receipt_id,))
    return read(conn, receipt_id, user)
