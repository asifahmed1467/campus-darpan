"""A JSON API with configurable field names, for when the university offers one."""
from __future__ import annotations

import os
from datetime import date, datetime

from .base import NoticeSource, RawNotice, SourceError
from .http import polite_get

DEFAULT_FIELDS = {"title": "title", "url": "url", "published": "date", "summary": "summary",
                  "category": "category", "attachment_url": "attachment_url"}


def _dig(obj, path: str):
    for part in path.split(".") if path else []:
        if isinstance(obj, list):
            try:
                obj = obj[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
    return obj


def _date(v) -> date | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_items(data, items_path: str, fields: dict) -> list[RawNotice]:
    items = _dig(data, items_path) if items_path else data
    if not isinstance(items, list):
        raise SourceError(f"No list found at '{items_path or '(root)'}' in the JSON response")
    f = {**DEFAULT_FIELDS, **fields}
    out = []
    for it in items:
        title, url = _dig(it, f["title"]), _dig(it, f["url"])
        if not title or not url:
            continue
        out.append(RawNotice(title=str(title), url=str(url), published=_date(_dig(it, f["published"])),
                             summary=_dig(it, f["summary"]), category=_dig(it, f["category"]),
                             attachment_url=_dig(it, f["attachment_url"])))
    return out


class JsonApiSource(NoticeSource):
    kind = "json"

    def __init__(self, name: str, url: str, items_path: str = "", fields: dict | None = None,
                 auth_env: str | None = None, authorized_by: str | None = None):
        self.name, self.url, self.items_path = name, url, items_path
        self.fields, self.auth_env, self.authorized_by = fields or {}, auth_env, authorized_by

    def fetch(self) -> list[RawNotice]:
        headers = {}
        if self.auth_env:  # the token lives in an environment variable, never in config JSON
            token = os.getenv(self.auth_env)
            if not token:
                raise SourceError(f"Environment variable {self.auth_env} is not set")
            headers["Authorization"] = f"Bearer {token}"
        r = polite_get(self.url, respect_robots=not self.authorized_by, headers=headers)
        try:
            data = r.json()
        except ValueError as e:
            raise SourceError("Response is not valid JSON") from e
        return parse_items(data, self.items_path, self.fields)

    def describe(self) -> dict:
        return {**super().describe(), "url": self.url, "items_path": self.items_path,
                "robots_check": not self.authorized_by, "authorized_by": self.authorized_by}
