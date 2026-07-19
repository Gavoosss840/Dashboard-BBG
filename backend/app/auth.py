import datetime as dt
import os
import secrets
import time

import bcrypt
import jwt

_LEGACY_DEFAULT = "boulet-capital-dev-secret-change-me"


def _load_secret_key() -> str:
    """Signing key for sessions. Env var wins; otherwise a random key is
    generated once and persisted next to the database, so there is never a
    shared default that someone could use to forge a session token."""
    env = os.environ.get("AUTH_SECRET_KEY")
    if env and env != _LEGACY_DEFAULT:
        return env

    from app.database import DATABASE_URL  # local import: avoid cycles at module load

    data_dir = os.path.dirname(os.path.abspath(DATABASE_URL.replace("sqlite:///", "", 1))) or "."
    key_path = os.path.join(data_dir, "auth_secret.key")
    try:
        if os.path.exists(key_path):
            with open(key_path) as f:
                key = f.read().strip()
            if key:
                return key
        key = secrets.token_hex(32)
        os.makedirs(data_dir, exist_ok=True)
        with open(key_path, "w") as f:
            f.write(key)
        try:
            os.chmod(key_path, 0o600)
        except OSError:
            pass
        return key
    except OSError:
        # Data dir not writable (shouldn't happen) — fall back to a per-process
        # random key: sessions won't survive a restart, but nothing is forgeable.
        return secrets.token_hex(32)


SECRET_KEY = _load_secret_key()
ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 24 * 14  # 2 weeks

# ---- Login rate limiting (in-memory, per email) ----
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 15 * 60
_failed_logins: dict[str, list[float]] = {}


def is_locked_out(email: str) -> int:
    """Seconds remaining in lockout, or 0 if the account may attempt login."""
    now = time.time()
    attempts = [t for t in _failed_logins.get(email, []) if now - t < LOCKOUT_WINDOW_SECONDS]
    _failed_logins[email] = attempts
    if len(attempts) >= MAX_FAILED_ATTEMPTS:
        return int(LOCKOUT_WINDOW_SECONDS - (now - attempts[0]))
    return 0


def record_failed_login(email: str) -> None:
    _failed_logins.setdefault(email, []).append(time.time())


def reset_failed_logins(email: str) -> None:
    _failed_logins.pop(email, None)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": dt.datetime.utcnow() + dt.timedelta(hours=TOKEN_TTL_HOURS),
        "iat": dt.datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
