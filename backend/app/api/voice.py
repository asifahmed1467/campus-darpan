"""Voice typing that works in every browser: the phone records a short clip and we turn it into text with
Whisper on Groq (free tier). Needs GROQ_API_KEY in the environment; without it the site falls back to the
browser's own speech recognition. Clips are never stored."""
import os
import time
from collections import defaultdict, deque

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

router = APIRouter(prefix="/api/voice", tags=["voice"])

MAX_BYTES = 2_000_000            # about 30 seconds of compressed speech
_hits: dict[str, deque] = defaultdict(deque)


def _key() -> str:
    return os.getenv("GROQ_API_KEY", "").strip()


def _limit(ip: str, per_min: int = 8):
    q, now = _hits[ip], time.time()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= per_min:
        raise HTTPException(429, "Too many voice requests. Wait a minute and try again.")
    q.append(now)


@router.get("/status")
def status():
    from ..services import llm
    return {"server": bool(_key()), "ai_last_error": llm.last_error or None}


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
