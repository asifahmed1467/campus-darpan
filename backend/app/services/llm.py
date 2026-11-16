"""Ask AIUB answers written by an AI model on Groq (free tier), grounded only in facts this site already holds.

The model gets a short numbered list of sources (sample answers, AIUB page text the admin added, recent notice titles,
the academic calendar) and must answer from them alone, citing [1], [2]... If it cannot, it says so.
Needs GROQ_API_KEY. Any failure returns None and the caller uses the plain non-AI answer.
"""
import os
import re

import httpx

last_error: dict = {}      # the latest failure (status and a short message, never the key), shown on /api/voice/status

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]   # better first; the small one has a much larger free allowance

SYSTEM = (
    "You are Ask AIUB, a helpful assistant for students of American International University-Bangladesh (AIUB). "
    "You are chatting; use the earlier messages to understand follow-up questions. Answer ONLY from the numbered sources given. If the sources do not contain the answer, say briefly that you don't "
    "have that information yet and suggest checking aiub.edu or the relevant office. Never invent dates, fees, rules, "
    "names or numbers. Keep answers short (2 to 5 sentences), plain and friendly. Cite sources inline like [1]. "
    "Reply in the same language as the question: Bangla (Bengali script) if the question is in Bangla or Banglish, otherwise English."
)


def enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def answer(question: str, sources: list[dict], history: list[dict] | None = None) -> dict | None:
    """sources: [{title, url, text}]. Returns {answer, used: [indexes], model} or None."""
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key or not sources:
        return None
    block = "\n\n".join(f"[{i + 1}] {s['title']}\n{s['text'][:900]}" for i, s in enumerate(sources[:8]))
    messages = [{"role": "system", "content": SYSTEM}]
    for h in (history or [])[-6:]:      # earlier turns, so follow-up questions make sense
        messages.append({"role": h["role"], "content": h["text"][:800]})
    messages.append({"role": "user", "content": f"Sources:\n{block}\n\nStudent's question: {question}"})
    for model in MODELS:
        try:
            r = httpx.post("https://api.groq.com/openai/v1/chat/completions", timeout=20,
                           headers={"Authorization": f"Bearer {key}"},
                           json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 350})
        except httpx.HTTPError as e:
            last_error.update(model=model, error=type(e).__name__)
            continue
        if r.status_code >= 400:
            last_error.update(model=model, status=r.status_code, detail=r.text[:200].replace(key, "***"))
        if r.status_code == 429 or r.status_code >= 500 or r.status_code in (400, 404):
            continue           # busy, down, or this model not available: try the next model
        if r.status_code >= 400:
            return None
        text = (r.json()["choices"][0]["message"]["content"] or "").strip()
        if not text:
            return None
        used = sorted({int(n) - 1 for n in re.findall(r"\[(\d+)\]", text) if 0 < int(n) <= len(sources)})
        return {"answer": text, "used": used, "model": model}
    return None


def says_unknown(text: str) -> bool:
    return bool(re.search(r"(don't|do not|doesn't|does not) have (that|this|enough) information|not (in|covered by) the sources|"
                          r"আমার কাছে (এই|সে) তথ্য নেই|তথ্য নেই", text, re.I))
