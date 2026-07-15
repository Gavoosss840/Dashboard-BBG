"""Lightweight auto-migration for SQLite — no Alembic for a tool this size.

`Base.metadata.create_all()` only creates missing TABLES; it never adds
columns to a table that already exists. Every time a model gains a field
(as happened with `hashed_password`, `entry_fee_pct`, `exit_fee_pct`), an
existing local database silently keeps the old shape and any query
touching the new column raises "no such column" — surfacing as confusing
UI bugs (e.g. the bootstrap-vs-login screen picking the wrong one because
the check itself errored out). This scans the models against the actual
schema on every startup and adds whatever columns are missing.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase


def ensure_schema(engine: Engine, base: type[DeclarativeBase]) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # brand-new table — create_all already handled it
            existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                default_sql = _default_clause(column)
                conn.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{default_sql}')
                )


def _default_clause(column) -> str:
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return ""
    value = default.arg
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f" DEFAULT '{escaped}'"
    if isinstance(value, bool):
        return f" DEFAULT {int(value)}"
    if isinstance(value, (int, float)):
        return f" DEFAULT {value}"
    return ""
