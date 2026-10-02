from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg import errors

from .db import PoolTimeout


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
                    for error in exc.errors()
                ]
            },
        )

    @app.exception_handler(errors.UniqueViolation)
    async def duplicate_error(request, exc):
        return JSONResponse(
            status_code=409,
            content={"detail": "Запись с таким уникальным значением уже существует"},
        )

    @app.exception_handler(errors.CheckViolation)
    async def constraint_error(request, exc):
        return JSONResponse(
            status_code=409,
            content={"detail": "Операция нарушает ограничение данных"},
        )

    async def busy_error(request, exc):
        return JSONResponse(
            status_code=503,
            content={"detail": "Сервис занят. Повторите запрос с тем же идентификатором"},
            headers={"Retry-After": "2"},
        )

    for exception_type in (
        PoolTimeout,
        errors.LockNotAvailable,
        errors.DeadlockDetected,
        errors.QueryCanceled,
    ):
        app.add_exception_handler(exception_type, busy_error)
