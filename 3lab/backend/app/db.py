import os
import queue
import threading
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row


class PoolTimeout(TimeoutError):
    pass


class ConnectionPool:
    """Small bounded synchronous pool with transaction cleanup on every request."""
    def __init__(self, conninfo, kwargs, min_size=1, max_size=10, timeout=5, open=False):
        self.conninfo, self.kwargs = conninfo, kwargs
        self.timeout = timeout
        self.slots = threading.BoundedSemaphore(max_size)
        self.idle = queue.LifoQueue(max_size)

    def open(self, wait=True, timeout=15):
        self.idle.put(psycopg.connect(self.conninfo, connect_timeout=int(timeout), **self.kwargs))

    @contextmanager
    def connection(self):
        if not self.slots.acquire(timeout=self.timeout):
            raise PoolTimeout('Connection pool is busy')
        conn = None
        try:
            try:
                conn = self.idle.get_nowait()
                if conn.closed or conn.broken:
                    conn.close(); conn = None
            except queue.Empty:
                pass
            if conn is None:
                conn = psycopg.connect(self.conninfo, connect_timeout=5, **self.kwargs)
            try:
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
        finally:
            if conn is not None and not conn.closed and not conn.broken:
                self.idle.put_nowait(conn)
            elif conn is not None:
                conn.close()
            self.slots.release()

    def close(self):
        # Lifespan shutdown occurs after requests finish.
        while True:
            try:
                self.idle.get_nowait().close()
            except queue.Empty:
                return


def create_pool():
    return ConnectionPool(
        conninfo=os.environ.get('DATABASE_URL', ''),
        kwargs={
            'host': os.environ.get('DB_HOST', 'localhost'),
            'port': os.environ.get('DB_PORT', '5432'),
            'dbname': os.environ.get('DB_NAME', 'supermarket'),
            'user': os.environ.get('DB_USER', 'market_app'),
            'password': os.environ.get('DB_PASSWORD', ''),
            'row_factory': dict_row,
            'options': '-c search_path=market,public -c statement_timeout=5000 -c lock_timeout=3000',
        } if not os.environ.get('DATABASE_URL') else {'row_factory': dict_row, 'options': '-c search_path=market,public -c statement_timeout=5000 -c lock_timeout=3000'},
        min_size=1, max_size=10, timeout=5, open=False,
    )


def connection(request):
    return request.app.state.pool.connection()
