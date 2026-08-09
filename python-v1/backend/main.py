"""FastAPI uygulamasi: arama ucu, kelime defteri ve statik arayuz."""

from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, llm, store
from .schema import LookupResult, SavedWord


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init()
    yield


app = FastAPI(title="Kelime Sozlugu", version="0.1.0", lifespan=lifespan)


@app.get("/api/languages")
def languages() -> dict:
    return {"default": config.DEFAULT_LANGUAGE, "languages": config.LANGUAGES}


@app.get("/api/lookup", response_model=LookupResult)
async def lookup(
    word: str = Query(..., min_length=1, max_length=80),
    lang: str = Query(config.DEFAULT_LANGUAGE),
    refresh: bool = Query(False, description="Onbellegi atlayip yeniden sorar"),
) -> LookupResult:
    if lang not in config.LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Desteklenmeyen dil: {lang}")

    word = word.strip()
    if not word:
        raise HTTPException(status_code=400, detail="Kelime bos olamaz.")

    store.add_history(word, lang)

    if not refresh:
        cached = store.get_cached(word, lang)
        if cached is not None:
            return cached

    try:
        result = await llm.lookup(word, lang)
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if result.found:
        store.put_cached(word, lang, result)

    return result


@app.get("/api/recent", response_model=List[SavedWord])
def recent(limit: int = Query(20, ge=1, le=100)) -> List[SavedWord]:
    return store.recent(limit)


class SaveRequest(BaseModel):
    word: str
    language: str
    turkish: str = ""


@app.get("/api/saved", response_model=List[SavedWord])
def saved(lang: Optional[str] = None) -> List[SavedWord]:
    return store.list_saved(lang)


@app.post("/api/saved")
def save(request: SaveRequest) -> dict:
    if request.language not in config.LANGUAGES:
        raise HTTPException(status_code=400, detail="Desteklenmeyen dil.")
    store.save_word(request.word, request.language, request.turkish)
    return {"ok": True, "saved": True}


@app.delete("/api/saved")
def unsave(word: str, lang: str) -> dict:
    store.unsave_word(word, lang)
    return {"ok": True, "saved": False}


@app.get("/api/saved/export")
def export_saved(lang: Optional[str] = None) -> FileResponse:
    """Kelime defterini Anki'ye dogrudan alinabilen TSV olarak verir."""
    lines = [f"{w.word}\t{w.turkish}" for w in store.list_saved(lang)]
    out = config.DB_PATH.parent / "kelimeler.tsv"
    out.write_text("\n".join(lines), encoding="utf-8")
    return FileResponse(out, filename="kelimeler.tsv", media_type="text/tab-separated-values")


app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
