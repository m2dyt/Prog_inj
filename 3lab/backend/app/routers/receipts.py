from fastapi import APIRouter, Depends, Query, Request

from ..db import connection
from ..dependencies import SafeId, current_user, permit
from ..schemas import ReceiptCreate, ReceiptOut
from ..services import receipts

router = APIRouter(prefix="/api/receipts", tags=["receipts"])


@router.post("", response_model=ReceiptOut, status_code=201)
def create_receipt(
    body: ReceiptCreate,
    request: Request,
    user=Depends(permit("cashier", "manager")),
):
    with connection(request) as conn:
        return receipts.create(conn, body, user)


@router.get("")
def list_receipts(
    request: Request,
    before: int = Query(9007199254740991, gt=0, le=9007199254740991),
    limit: int = Query(24, ge=1, le=100),
    user=Depends(current_user),
):
    with connection(request) as conn:
        return receipts.fetch_page(conn, before=before, limit=limit, user=user)


@router.get("/{receipt_id}", response_model=ReceiptOut)
def get_receipt(receipt_id: SafeId, request: Request, user=Depends(current_user)):
    with connection(request) as conn:
        return receipts.read(conn, receipt_id, user)


@router.post("/{receipt_id}/pay", response_model=ReceiptOut)
def pay_receipt(
    receipt_id: SafeId,
    request: Request,
    user=Depends(permit("cashier", "manager")),
):
    with connection(request) as conn:
        return receipts.pay(conn, receipt_id, user)


@router.post("/{receipt_id}/cancel", response_model=ReceiptOut)
def cancel_receipt(
    receipt_id: SafeId,
    request: Request,
    user=Depends(permit("cashier", "manager")),
):
    with connection(request) as conn:
        return receipts.cancel(conn, receipt_id, user)
