import hashlib
import hmac
import secrets


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    derived = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
    return f'scrypt${salt}${derived.hex()}'


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, _ = stored.split('$')
        return algorithm == 'scrypt' and hmac.compare_digest(hash_password(password, salt), stored)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
