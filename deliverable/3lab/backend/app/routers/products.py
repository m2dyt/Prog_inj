from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..db import connection
from ..dependencies import SafeId, current_user, permit
from ..schemas import ProductCreate, ProductOut, ProductPage, ProductUpdate, StockAdjustment
from ..services import products

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=ProductPage)
def list_products(
    request: Request,
    q: str = Query("", max_length=160),
    category: str = Query("", max_length=60),
    after: int = Query(0, ge=0, le=9007199254740991),
    limit: int = Query(24, ge=1, le=100),
    include_archived: bool = False,
    user=Depends(current_user),
):
    if include_archived and user["role"] != "manager":
        raise HTTPException(403, "Архив доступен менеджеру")
    q, category = q.strip(), category.strip()
    if q and len(q) < 3:
        raise HTTPException(422, "Введите не менее трёх символов для поиска")
    with connection(request) as conn:
        return products.fetch_page(
            conn,
            q=q,
            category=category,
            after=after,
            limit=limit,
            include_archived=include_archived,
        )


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductCreate,
    request: Request,
    user=Depends(permit("manager")),
):
    with connection(request) as conn:
        return products.create(conn, body)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: SafeId,
    body: ProductUpdate,
    request: Request,
    user=Depends(permit("manager")),
):
    with connection(request) as conn:
        return products.update(conn, product_id, body)


@router.post("/{product_id}/stock", response_model=ProductOut)
def adjust_stock(
    product_id: SafeId,
    body: StockAdjustment,
    request: Request,
    user=Depends(permit("manager")),
):
    with connection(request) as conn:
        return products.adjust_stock(conn, product_id, body, user["id"])
