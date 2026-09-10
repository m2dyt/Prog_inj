"""Initial users and a small demo dataset. Never overwrites existing rows."""
import os
from .db import create_pool
from .security import hash_password

PRODUCTS = [
    ('4600000000001','Молоко цельное 3,2% · 1 л','Молочные продукты','99.90',86),
    ('4600000000002','Йогурт натуральный · 250 г','Молочные продукты','74.90',42),
    ('4600000000003','Хлеб деревенский · 400 г','Хлеб и выпечка','69.00',38),
    ('4600000000004','Яблоки зелёные · упаковка 1 кг','Овощи и фрукты','159.90',57),
    ('4600000000005','Вода негазированная · 1,5 л','Напитки','49.90',120),
    ('4600000000006','Круассан сливочный · 70 г','Хлеб и выпечка','89.00',24),
    ('4600000000007','Сыр полутвёрдый · 200 г','Молочные продукты','189.90',31),
    ('4600000000008','Томаты · упаковка 500 г','Овощи и фрукты','139.90',46),
    ('4600000000009','Сок яблочный · 1 л','Напитки','119.90',64),
    ('4600000000010','Рис длиннозёрный · 900 г','Бакалея','109.90',78),
    ('4600000000011','Кефир 2,5% · 1 л','Молочные продукты','89.90',35),
    ('4600000000012','Багет пшеничный · 250 г','Хлеб и выпечка','59.90',0),
    ('4600000000013','Груши · упаковка 1 кг','Овощи и фрукты','219.90',29),
    ('4600000000014','Овсяные хлопья · 500 г','Бакалея','79.90',91),
    ('4600000000015','Чай чёрный · 25 пакетиков','Напитки','129.90',54),
    ('4600000000016','Творог 5% · 200 г','Молочные продукты','109.90',27),
]


def seed():
    passwords = {role: os.environ[f'{role.upper()}_PASSWORD'] for role in ('manager','cashier','auditor')}
    if any(len(p)<12 for p in passwords.values()):
        raise ValueError('Initial passwords must contain at least 12 characters')
    pool = create_pool(); pool.open(wait=True)
    try:
        with pool.connection() as conn:
            for role, name in [('manager','Менеджер магазина'),('cashier','Кассир магазина'),('auditor','Аудитор магазина')]:
                conn.execute('''INSERT INTO app_users(username,display_name,password_hash,role)
                    VALUES (%s,%s,%s,%s) ON CONFLICT(username) DO NOTHING''', (role,name,hash_password(passwords[role]),role))
            actor = conn.execute("SELECT id FROM app_users WHERE username='manager'").fetchone()['id']
            for barcode,name,category,price,stock in PRODUCTS:
                row=conn.execute('''INSERT INTO products(barcode,name,category,price,stock) VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT(barcode) DO NOTHING RETURNING id''',(barcode,name,category,price,stock)).fetchone()
                if row and stock:
                    conn.execute('INSERT INTO stock_movements(product_id,actor_id,delta,reason) VALUES (%s,%s,%s,%s)',(row['id'],actor,stock,'Начальный учебный остаток'))
    finally:
        pool.close()
    print('Initial dataset ready; existing users and products preserved.')


if __name__ == '__main__':
    seed()
