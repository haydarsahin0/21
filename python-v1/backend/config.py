"""Ortam degiskenlerinden okunan ayarlar."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

load_dotenv(ROOT / ".env")

LLM_BASE_URL = os.getenv(
    "LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"
).rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.5-flash-lite")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")

CACHE_TTL_DAYS = int(os.getenv("CACHE_TTL_DAYS", "90"))

DB_PATH = ROOT / os.getenv("DB_PATH", "data/sozluk.db")

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

FRONTEND_DIR = ROOT / "frontend"

# Desteklenen hedef diller. Anahtar arayuze ve prompta birlikte gider;
# yeni dil eklemek icin tek yapman gereken buraya bir satir yazmak.
LANGUAGES = {
    "de": {"name": "Almanca", "native": "Deutsch"},
    "en": {"name": "Ingilizce", "native": "English"},
    "fr": {"name": "Fransizca", "native": "Francais"},
    "es": {"name": "Ispanyolca", "native": "Espanol"},
    "it": {"name": "Italyanca", "native": "Italiano"},
    "ru": {"name": "Rusca", "native": "Russkiy"},
    "ar": {"name": "Arapca", "native": "Arabiyya"},
}

DEFAULT_LANGUAGE = "de"
