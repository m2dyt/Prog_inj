from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator

Id = Annotated[StrictInt, Field(gt=0, le=9007199254740991)]
Money = Annotated[Decimal, Field(gt=0, le=Decimal('999999.99'), max_digits=8, decimal_places=2, allow_inf_nan=False)]


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Login(Input):
    username: str = Field(min_length=3, max_length=50, pattern=r'^[a-z][a-z0-9_]*$')
    password: str = Field(min_length=1, max_length=128)

    @field_validator('password', mode='before')
    @classmethod
    def preserve_password(cls, value):
        # Passwords are not normalized; override inherited whitespace stripping.
        return value

    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)


class ProductCreate(Input):
    barcode: str = Field(pattern=r'^[0-9]{8,14}$')
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=60)
    price: Money


class ProductUpdate(ProductCreate):
    version: Annotated[StrictInt, Field(ge=1)]
    active: StrictBool


class StockAdjustment(Input):
    delta: Annotated[StrictInt, Field(ge=-1000000, le=1000000)]
    reason: str = Field(min_length=5, max_length=200)

    @field_validator('delta')
    @classmethod
    def nonzero(cls, value):
        if value == 0:
            raise ValueError('Изменение остатка не может быть нулевым')
        return value


class ReceiptLine(Input):
    product_id: Id
    quantity: Annotated[StrictInt, Field(ge=1, le=10000)]


class ReceiptCreate(Input):
    request_id: UUID
    items: list[ReceiptLine] = Field(min_length=1, max_length=100)

    @model_validator(mode='after')
    def unique_products(self):
        ids = [item.product_id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError('Товар должен встречаться в чеке только один раз')
        return self


class ProductOut(BaseModel):
    id: int
    barcode: str
    name: str
    category: str
    price: Decimal
    stock: int
    active: bool
    version: int


class ProductPage(BaseModel):
    items: list[ProductOut]
    next_cursor: int | None


class LineOut(BaseModel):
    product_id: int
    product_name: str
    barcode: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class ReceiptOut(BaseModel):
    id: int
    request_id: UUID
    cashier_id: int
    status: Literal['draft', 'paid', 'cancelled']
    created_at: datetime
    paid_at: datetime | None
    total: Decimal
    items: list[LineOut]
