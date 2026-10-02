\set ON_ERROR_STOP on
-- psql variables: app_password, admin_password. Run only against a fresh database.
BEGIN;
CREATE ROLE market_owner NOLOGIN;
CREATE ROLE market_reader NOLOGIN;
CREATE ROLE market_app LOGIN PASSWORD :'app_password';
CREATE ROLE market_admin LOGIN PASSWORD :'admin_password';
GRANT market_owner TO market_admin;
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO market_app, market_admin, market_reader', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA market AUTHORIZATION market_owner;
SET ROLE market_owner;
SET search_path TO market, public;
-- ICU keeps Cyrillic case conversion independent of the host's C locale.
CREATE COLLATION unicode_case (provider = icu, locale = 'und', deterministic = true);

CREATE TABLE app_users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username varchar(50) NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9_]{2,49}$'),
    display_name varchar(100) NOT NULL,
    password_hash text NOT NULL,
    role varchar(12) NOT NULL CHECK (role IN ('manager', 'cashier', 'auditor')),
    active boolean NOT NULL DEFAULT true
);
CREATE TABLE sessions (
    token_hash char(64) PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours')
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE products (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (id <= 9007199254740991),
    barcode varchar(14) NOT NULL UNIQUE CHECK (barcode ~ '^[0-9]{8,14}$'),
    name varchar(160) NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
    category varchar(60) NOT NULL CHECK (length(btrim(category)) BETWEEN 2 AND 60),
    price numeric(8,2) NOT NULL CHECK (price > 0 AND price <= 999999.99),
    stock integer NOT NULL DEFAULT 0 CHECK (stock BETWEEN 0 AND 1000000000),
    active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_active_id_idx ON products(id) WHERE active;
CREATE INDEX products_category_id_idx ON products(category, id) WHERE active;
CREATE INDEX products_name_trgm_idx ON products USING gin (lower(name COLLATE unicode_case) public.gin_trgm_ops) WHERE active;

CREATE TABLE receipts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (id <= 9007199254740991),
    request_id uuid NOT NULL UNIQUE,
    payload_hash char(64) NOT NULL,
    cashier_id bigint NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    status varchar(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','paid','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz,
    CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);
CREATE INDEX receipts_cashier_id_idx ON receipts(cashier_id, id DESC);
CREATE INDEX receipts_created_idx ON receipts(created_at DESC, id DESC);

CREATE TABLE receipt_items (
    receipt_id bigint NOT NULL REFERENCES receipts(id) ON DELETE RESTRICT,
    product_id bigint NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name varchar(160) NOT NULL,
    barcode varchar(14) NOT NULL,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
    unit_price numeric(8,2) NOT NULL CHECK (unit_price > 0 AND unit_price <= 999999.99),
    line_total numeric(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    PRIMARY KEY (receipt_id, product_id)
);
CREATE INDEX receipt_items_product_idx ON receipt_items(product_id, receipt_id);

CREATE TABLE stock_movements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    actor_id bigint NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    receipt_id bigint REFERENCES receipts(id) ON DELETE RESTRICT,
    delta integer NOT NULL CHECK (delta <> 0),
    reason varchar(200) NOT NULL CHECK (length(btrim(reason)) >= 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (receipt_id, product_id)
);
CREATE INDEX stock_movements_product_time_idx ON stock_movements(product_id, created_at DESC);

CREATE FUNCTION guard_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Terminal receipt is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'paid' AND NOT EXISTS (SELECT 1 FROM market.receipt_items WHERE receipt_id = OLD.id) THEN
        RAISE EXCEPTION 'Cannot pay an empty receipt' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER receipt_state_guard BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION guard_receipt();

CREATE FUNCTION guard_receipt_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
    SELECT status INTO parent_status FROM market.receipts WHERE id = NEW.receipt_id FOR UPDATE;
    IF parent_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Items require a draft receipt' USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(*) FROM market.receipt_items WHERE receipt_id = NEW.receipt_id) >= 100 THEN
        RAISE EXCEPTION 'Receipt is limited to 100 lines' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER receipt_item_guard BEFORE INSERT ON receipt_items FOR EACH ROW EXECUTE FUNCTION guard_receipt_item();

GRANT USAGE ON SCHEMA market TO market_app, market_reader;
GRANT SELECT ON products, receipts, receipt_items, stock_movements TO market_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA market TO market_app;
GRANT INSERT ON products, receipts, receipt_items, stock_movements, sessions TO market_app;
GRANT UPDATE (barcode, name, category, price, stock, active, version, updated_at) ON products TO market_app;
GRANT UPDATE (status, paid_at) ON receipts TO market_app;
GRANT DELETE ON sessions TO market_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA market TO market_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA market FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE market_owner IN SCHEMA market REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
COMMIT;
