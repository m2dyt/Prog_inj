from fastapi import HTTPException


def fetch_page(conn, *, q: str, category: str, after: int, limit: int, include_archived: bool):
    where = ["id > %s"]
    values = [after]
    if not include_archived:
        where.append("active")
    if q:
        if q.isascii() and q.isdigit() and 8 <= len(q) <= 14:
            where.append("barcode=%s")
            values.append(q)
        else:
            where.append("lower(name COLLATE unicode_case) LIKE lower(%s COLLATE unicode_case) ESCAPE E'\\\\'")
            values.append("%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
    if category:
        where.append("category=%s")
        values.append(category)
    # Only the fragments above are interpolated; request values stay bound parameters.
    rows = conn.execute(
        "SELECT id,barcode,name,category,price,stock,active,version FROM products WHERE "
        + " AND ".join(where)
        + " ORDER BY id LIMIT %s",
        [*values, limit + 1],
    ).fetchall()
    return {
        "items": rows[:limit],
        "next_cursor": rows[limit - 1]["id"] if len(rows) > limit else None,
    }


def create(conn, body):
    return conn.execute(
        """INSERT INTO products(barcode,name,category,price) VALUES (%s,%s,%s,%s)
        RETURNING *""",
        (body.barcode, body.name, body.category, body.price),
    ).fetchone()


def update(conn, product_id: int, body):
    row = conn.execute(
        """UPDATE products SET barcode=%s,name=%s,category=%s,price=%s,active=%s,
        version=version+1,updated_at=now() WHERE id=%s AND version=%s RETURNING *""",
        (
            body.barcode,
            body.name,
            body.category,
            body.price,
            body.active,
            product_id,
            body.version,
        ),
    ).fetchone()
    if row:
        return row
    exists = conn.execute("SELECT 1 FROM products WHERE id=%s", (product_id,)).fetchone()
    raise HTTPException(
        409 if exists else 404,
        "Товар изменён другим пользователем" if exists else "Товар не найден",
    )


def adjust_stock(conn, product_id: int, body, actor_id: int):
    product = conn.execute(
        "SELECT * FROM products WHERE id=%s FOR UPDATE", (product_id,)
    ).fetchone()
    if not product:
        raise HTTPException(404, "Товар не найден")
    if not 0 <= product["stock"] + body.delta <= 1_000_000_000:
        raise HTTPException(409, "Остаток вне допустимого диапазона")
    conn.execute(
        "INSERT INTO stock_movements(product_id,actor_id,delta,reason) VALUES (%s,%s,%s,%s)",
        (product_id, actor_id, body.delta, body.reason),
    )
    return conn.execute(
        """UPDATE products SET stock=stock+%s,version=version+1,updated_at=now()
        WHERE id=%s RETURNING *""",
        (body.delta, product_id),
    ).fetchone()
