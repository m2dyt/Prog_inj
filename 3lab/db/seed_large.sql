\set ON_ERROR_STOP on
-- Only for a disposable test database! Run as market_admin after app.seed.
-- Refuses production-like database names; writes a uniquely prefixed synthetic dataset.
DO $$ BEGIN
  IF current_database() !~ '(test|bench)$' THEN
    RAISE EXCEPTION 'Use a separate database whose name ends in test or bench';
  END IF;
END $$;
SET search_path=market,public;
BEGIN;
INSERT INTO products(barcode,name,category,price,stock)
SELECT '99'||lpad(n::text,11,'0'), 'Нагрузочный товар '||n,
       CASE WHEN n%2=0 THEN 'Бакалея' ELSE 'Напитки' END,
       (100+(n%10000))::numeric/100, 1000
FROM generate_series(1,100000) n
ON CONFLICT(barcode) DO NOTHING;
-- UUIDs are deterministic; reruns do not create duplicate receipts.
INSERT INTO receipts(request_id,payload_hash,cashier_id)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       repeat('0',64), (SELECT id FROM app_users WHERE username='cashier')
FROM generate_series(1,100000) n
ON CONFLICT(request_id) DO NOTHING;
INSERT INTO receipt_items(receipt_id,product_id,product_name,barcode,quantity,unit_price)
SELECT r.id,p.id,p.name,p.barcode,1,p.price
FROM generate_series(1,100000) n
CROSS JOIN generate_series(0,4) offset_n
JOIN receipts r ON r.request_id=('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
JOIN products p ON p.barcode='99'||lpad((((n-1)*5+offset_n)%100000+1)::text,11,'0')
ON CONFLICT(receipt_id,product_id) DO NOTHING;
INSERT INTO stock_movements(product_id,actor_id,delta,reason)
SELECT p.id,(SELECT id FROM app_users WHERE username='manager'),1000,'Нагрузочный начальный остаток'
FROM products p WHERE p.barcode LIKE '99%' AND p.name LIKE 'Нагрузочный товар %'
AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.product_id=p.id);
COMMIT;
ANALYZE market.products;
ANALYZE market.receipts;
ANALYZE market.receipt_items;
ANALYZE market.stock_movements;
SELECT 'products' AS object, count(*) FROM products
UNION ALL SELECT 'receipts',count(*) FROM receipts
UNION ALL SELECT 'receipt_items',count(*) FROM receipt_items;
SELECT relname,pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables WHERE schemaname='market' ORDER BY relname;
