"""SQLite uzerinde iki is yapiyoruz: sorgu onbellegi ve kelime defteri.

Onbellek, ucretsiz kotanin en onemli koruyucusu. Ayni kelimeyi ikinci kez
aradiginda API'ye hic gidilmiyor; gunluk 1000 istek boylece cok daha uzun
yetiyor.
"""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from . import config
from .schema import LookupResult, SavedWord

SCHEMA = """
CREATE TABLE IF NOT EXISTS cache (
    language   TEXT NOT NULL,
    word       TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (language, word)
);

CREATE TABLE IF NOT EXISTS saved_words (
    language   TEXT NOT NULL,
    word       TEXT NOT NULL,
    turkish    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (language, word)
);

CREATE TABLE IF NOT EXISTS history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    language   TEXT NOT NULL,
    word       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _connect():
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with _connect() as conn:
        conn.executescript(SCHEMA)


def normalize_word(word: str) -> str:
    return " ".join(word.strip().split()).lower()


def get_cached(word: str, language: str) -> Optional[LookupResult]:
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=config.CACHE_TTL_DAYS)
    ).isoformat()
    with _connect() as conn:
        row = conn.execute(
            "SELECT payload FROM cache WHERE language = ? AND word = ? "
            "AND created_at >= ?",
            (language, normalize_word(word), cutoff),
        ).fetchone()

    if row is None:
        return None

    result = LookupResult.model_validate(json.loads(row["payload"]))
    result.cached = True
    return result


def put_cached(word: str, language: str, result: LookupResult) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO cache (language, word, payload, created_at) "
            "VALUES (?, ?, ?, ?)",
            (
                language,
                normalize_word(word),
                result.model_dump_json(),
                _now(),
            ),
        )


def add_history(word: str, language: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO history (language, word, created_at) VALUES (?, ?, ?)",
            (language, normalize_word(word), _now()),
        )


def recent(limit: int = 20) -> List[SavedWord]:
    """Son aranan kelimeler, tekrarlar teklenmis halde."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT language, word, MAX(created_at) AS created_at FROM history "
            "GROUP BY language, word ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()

    return [
        SavedWord(word=r["word"], language=r["language"], created_at=r["created_at"])
        for r in rows
    ]


def save_word(word: str, language: str, turkish: str = "") -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO saved_words (language, word, turkish, created_at) "
            "VALUES (?, ?, ?, ?)",
            (language, normalize_word(word), turkish, _now()),
        )


def unsave_word(word: str, language: str) -> None:
    with _connect() as conn:
        conn.execute(
            "DELETE FROM saved_words WHERE language = ? AND word = ?",
            (language, normalize_word(word)),
        )


def list_saved(language: Optional[str] = None) -> List[SavedWord]:
    query = "SELECT language, word, turkish, created_at FROM saved_words"
    params: tuple = ()
    if language:
        query += " WHERE language = ?"
        params = (language,)
    query += " ORDER BY created_at DESC"

    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()

    return [SavedWord(**dict(row)) for row in rows]


def is_saved(word: str, language: str) -> bool:
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM saved_words WHERE language = ? AND word = ?",
            (language, normalize_word(word)),
        ).fetchone()
    return row is not None
