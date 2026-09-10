\set ON_ERROR_STOP on
SET search_path=market,public;
EXPLAIN (ANALYZE,BUFFERS) SELECT id,name,price,stock FROM products WHERE active AND id>50000 ORDER BY id LIMIT 24;
EXPLAIN (ANALYZE,BUFFERS) SELECT id,name FROM products WHERE barcode='9900000050000';
EXPLAIN (ANALYZE,BUFFERS) SELECT id,name FROM products WHERE active AND category='Напитки' AND id>50000 ORDER BY id LIMIT 24;
EXPLAIN (ANALYZE,BUFFERS) SELECT id,name FROM products WHERE active AND lower(name COLLATE unicode_case) LIKE '%98765%' ORDER BY id LIMIT 24;
EXPLAIN (ANALYZE,BUFFERS) SELECT * FROM receipts WHERE cashier_id=2 AND id<80000 ORDER BY id DESC LIMIT 24;
