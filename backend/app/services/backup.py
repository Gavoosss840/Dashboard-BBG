"""Automatic SQLite backups.

Uses the sqlite3 online-backup API (safe while the database is in use) to
copy the live database into BACKUP_DIR as a timestamped file, keeping the
most recent KEEP_BACKUPS copies. In Docker, BACKUP_DIR is bind-mounted to
./backups on the host machine, so backups survive even a
`docker compose down -v` — and that folder can be synced to
OneDrive/Drive for an off-machine copy.
"""

from __future__ import annotations

import datetime as dt
import os
import sqlite3

from sqlalchemy.orm import Session

from app import models
from app.database import DATABASE_URL

KEEP_BACKUPS = 30


def sqlite_path() -> str:
    return DATABASE_URL.replace("sqlite:///", "", 1)


def backup_dir() -> str:
    configured = os.environ.get("BACKUP_DIR")
    if configured:
        return configured
    return os.path.join(os.path.dirname(os.path.abspath(sqlite_path())) or ".", "backups")


def run_backup(db: Session) -> models.SyncLog:
    log = models.SyncLog(kind="backup", started_at=dt.datetime.utcnow())
    db.add(log)
    db.commit()

    try:
        src_path = sqlite_path()
        dest_dir = backup_dir()
        os.makedirs(dest_dir, exist_ok=True)
        stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_path = os.path.join(dest_dir, f"boulet_capital_{stamp}.db")

        src = sqlite3.connect(src_path)
        dest = sqlite3.connect(dest_path)
        with dest:
            src.backup(dest)
        dest.close()
        src.close()

        # Rotation: keep only the newest KEEP_BACKUPS files
        backups = sorted(
            f for f in os.listdir(dest_dir)
            if f.startswith("boulet_capital_") and f.endswith(".db")
        )
        removed = 0
        for old in backups[:-KEEP_BACKUPS]:
            os.remove(os.path.join(dest_dir, old))
            removed += 1

        size_mb = os.path.getsize(dest_path) / (1024 * 1024)
        log.status = "success"
        log.message = (
            f"Sauvegarde créée: {os.path.basename(dest_path)} ({size_mb:.1f} Mo). "
            f"{min(len(backups), KEEP_BACKUPS)} sauvegardes conservées"
            + (f", {removed} ancienne(s) supprimée(s)." if removed else ".")
        )
    except Exception as exc:
        log.status = "error"
        log.message = str(exc)
    log.finished_at = dt.datetime.utcnow()
    db.commit()
    return log
