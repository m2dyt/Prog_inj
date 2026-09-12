import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..db import connection
from ..dependencies import bearer, current_user
from ..schemas import Login
from ..security import hash_password, token_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
DUMMY_HASH = hash_password("invalid-user-dummy-password")


@router.post("/login")
def login(body: Login, request: Request, response: Response):
    with connection(request) as conn:
        user = conn.execute(
            "SELECT * FROM app_users WHERE username=%s", (body.username,)
        ).fetchone()
        valid = verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
        if not valid or not user or not user["active"]:
            raise HTTPException(401, "Неверный логин или пароль")
        token = secrets.token_urlsafe(32)
        conn.execute("DELETE FROM sessions WHERE expires_at <= now()")
        expiry = conn.execute(
            "INSERT INTO sessions(token_hash,user_id) VALUES (%s,%s) RETURNING expires_at",
            (token_hash(token), user["id"]),
        ).fetchone()["expires_at"]
    response.headers["Cache-Control"] = "no-store"
    return {"access_token": token, "token_type": "bearer", "expires_at": expiry}


@router.get("/me")
def me(user=Depends(current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, auth=Depends(bearer), user=Depends(current_user)):
    with connection(request) as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash=%s", (token_hash(auth.credentials),))
