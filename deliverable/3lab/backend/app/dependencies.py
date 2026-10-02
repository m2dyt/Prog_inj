from typing import Annotated

from fastapi import Depends, HTTPException, Path, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import connection
from .security import token_hash

bearer = HTTPBearer(auto_error=False)
SafeId = Annotated[int, Path(gt=0, le=9007199254740991)]


def current_user(
    request: Request,
    auth: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if not auth or len(auth.credentials) > 256:
        raise HTTPException(401, "Требуется вход", headers={"WWW-Authenticate": "Bearer"})
    with connection(request) as conn:
        user = conn.execute(
            """SELECT u.id, u.username, u.display_name, u.role FROM sessions s
            JOIN app_users u ON u.id=s.user_id
            WHERE s.token_hash=%s AND s.expires_at>now() AND u.active""",
            (token_hash(auth.credentials),),
        ).fetchone()
    if not user:
        raise HTTPException(
            401,
            "Сессия истекла или недействительна",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def permit(*roles):
    def dependency(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Недостаточно прав")
        return user

    return dependency
