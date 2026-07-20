"""Local file-based storage for IBKR Flex connections entered through the
platform's UI, as an alternative to editing docker-compose.yml by hand.

Stored in a JSON file next to the SQLite database — same directory, same
pattern as `auth_secret.key` in app/auth.py — never in the database, so it
never rides along in the daily backups/ folder the README tells users to
sync to OneDrive/Drive. `ibkr.flex_connections()` merges these with the
legacy environment-variable connections (IBKR_FLEX_TOKEN[_N]), which keep
working unchanged for anyone who already set them up that way.
"""

from __future__ import annotations

import json
import os
import threading
import uuid

_lock = threading.Lock()


def _file_path() -> str:
    from app.database import DATABASE_URL  # local import: avoid cycles at module load

    data_dir = os.path.dirname(os.path.abspath(DATABASE_URL.replace("sqlite:///", "", 1))) or "."
    return os.path.join(data_dir, "ibkr_connections.json")


def _load_raw() -> list[dict]:
    path = _file_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_raw(rows: list[dict]) -> None:
    path = _file_path()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(rows, f, indent=2)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def list_connections() -> list[dict]:
    """Raw rows including the token — internal use only (ibkr.py)."""
    return _load_raw()


def list_connections_masked() -> list[dict]:
    """Same rows with the token masked — safe to return from the API."""
    out = []
    for row in _load_raw():
        token = row.get("token", "")
        masked = f"••••{token[-4:]}" if len(token) > 4 else "••••"
        out.append({
            "id": row["id"], "label": row["label"],
            "query_id": row["query_id"], "token_masked": masked,
        })
    return out


def add_connection(label: str, token: str, query_id: str) -> dict:
    row = {"id": uuid.uuid4().hex, "label": label.strip() or "Sans nom", "token": token.strip(), "query_id": query_id.strip()}
    with _lock:
        rows = _load_raw()
        rows.append(row)
        _save_raw(rows)
    return row


def delete_connection(connection_id: str) -> bool:
    with _lock:
        rows = _load_raw()
        remaining = [r for r in rows if r["id"] != connection_id]
        if len(remaining) == len(rows):
            return False
        _save_raw(remaining)
        return True


def get_connection(connection_id: str) -> dict | None:
    for row in _load_raw():
        if row["id"] == connection_id:
            return row
    return None
