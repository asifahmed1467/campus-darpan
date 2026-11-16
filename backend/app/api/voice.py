"""Voice typing that works in every browser: the phone records a short clip and we turn it into text with
Whisper on Groq (free tier). Needs GROQ_API_KEY in the environment; without it the site falls back to the
browser's own speech recognition. Clips are never stored."""
import os
import time
from collections import defaultdict, deque

import httpx
import hashlib
import re
from collections import OrderedDict

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/voice", tags=["voice"])

MAX_BYTES = 2_000_000            # about 30 seconds of compressed speech
_hits: dict[str, deque] = defaultdict(deque)


def _key() -> str:
    return os.getenv("GROQ_API_KEY", "").strip()


def _limit(ip: str, per_min: int = 8):  # noqa: D401
    q, now = _hits[ip], time.time()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= per_min:
        raise HTTPException(429, "Too many voice requests. Wait a minute and try again.")
    q.append(now)


@router.get("/status")
def status():
    from ..services import llm
    return {"server": bool(_key()), "ai_models": llm._models["list"] or None, "ai_last_error": llm.last_error or None,
            "tts_last_error": tts_state or None}


@router.post("/transcribe")
async def transcribe(request: Request, audio: UploadFile = File(...), lang: str = Form("en")):
    key = _key()
    if not key:
        raise HTTPException(503, "Voice typing on the server is not set up.")
    _limit(request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip())
    data = await audio.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(400, "No sound was recorded.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The recording is too long. Keep it under 30 seconds.")
    name = audio.filename or "speech.webm"
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                files={"file": (name, data, audio.content_type or "audio/webm")},
                data={"model": "whisper-large-v3-turbo", "language": "bn" if lang == "bn" else "en",
                      "response_format": "json", "temperature": "0"},
            )
    except httpx.HTTPError:
        raise HTTPException(502, "The speech service did not answer. Try again.")
    if r.status_code in (401, 403):
        raise HTTPException(503, "The speech service key was refused.")
    if r.status_code == 429:
        raise HTTPException(429, "The speech service is busy. Try again in a minute.")
    if r.status_code >= 400:
        raise HTTPException(502, "The speech service could not read that recording. Try again.")
    text = (r.json().get("text") or "").strip()
    return {"text": text}


# ---- Natural voice for English answers: Orpheus on Groq (same key). Bangla keeps the phone's own voice. ----
TTS_MODEL, TTS_VOICE = "canopylabs/orpheus-v1-english", "hannah"
_tts_cache: "OrderedDict[str, bytes]" = OrderedDict()   # the same sentences are asked for often; keep the last 300
tts_state: dict = {}


class Speak(BaseModel):
    text: str = Field(min_length=1, max_length=200)     # Orpheus takes up to 200 characters per request


@router.post("/speak")
async def speak(body: Speak, request: Request):
    key = _key()
    if not key:
        raise HTTPException(503, "Natural voice is not set up.")
    text = body.text.strip()
    if re.search(r"[\u0980-\u09FF]", text):
        raise HTTPException(400, "Natural voice is English only.")
    h = hashlib.sha1(text.encode()).hexdigest()
    if h in _tts_cache:
        _tts_cache.move_to_end(h)
        return Response(_tts_cache[h], media_type="audio/wav", headers={"Cache-Control": "public, max-age=86400"})
    _limit("tts:" + request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip(), 40)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post("https://api.groq.com/openai/v1/audio/speech", headers={"Authorization": f"Bearer {key}"},
                                  json={"model": TTS_MODEL, "voice": TTS_VOICE, "input": text, "response_format": "wav"})
    except httpx.HTTPError:
        raise HTTPException(502, "The voice service did not answer.")
    if r.status_code >= 400:
        tts_state.update(status=r.status_code, detail=r.text[:200].replace(key, "***"))
        raise HTTPException(502 if r.status_code != 429 else 429, "The natural voice is not available right now.")
    tts_state.clear()
    _tts_cache[h] = r.content
    if len(_tts_cache) > 300:
        _tts_cache.popitem(last=False)
    return Response(r.content, media_type="audio/wav", headers={"Cache-Control": "public, max-age=86400"})
