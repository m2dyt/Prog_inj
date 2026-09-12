from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from .db import connection, create_pool
from .errors import register_error_handlers
from .routers import auth, products, receipts


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = create_pool()
    app.state.pool.open(wait=True, timeout=15)
    yield
    app.state.pool.close()


app = FastAPI(
    title="ИС супермаркета — вариант 36",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
register_error_handlers(app)
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(receipts.router)


@app.get("/api/health", tags=["service"])
def health(request: Request):
    with connection(request) as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}
