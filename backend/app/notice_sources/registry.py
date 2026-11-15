"""Builds the enabled sources from the NOTICE_SOURCES setting. Add a new source type here and nowhere else."""
from __future__ import annotations

import json
import logging

from .. import config
from .base import NoticeSource
from .email_inbox import EmailInboxSource
from .html_list import HtmlListSource
from .json_api import JsonApiSource
from .rss import RssSource

log = logging.getLogger("notice_sources")


def build_source(spec: dict) -> NoticeSource:
    kind = spec.get("type")
    name = spec.get("name") or kind
    if kind == "rss":
        return RssSource(name, spec["url"], spec.get("authorized_by"))
    if kind == "json":
        return JsonApiSource(name, spec["url"], spec.get("items_path", ""), spec.get("fields"),
                             spec.get("auth_env"), spec.get("authorized_by"))
    if kind == "html_list":
        return HtmlListSource(name, spec["url"])
    if kind == "email":
        return EmailInboxSource(name)
    raise ValueError(f"Unknown source type '{kind}'")


def load_sources(raw: str | None = None) -> list[NoticeSource]:
    try:
        specs = json.loads(config.NOTICE_SOURCES if raw is None else raw)
        assert isinstance(specs, list)
    except Exception:
        log.error("NOTICE_SOURCES is not a valid JSON list; no sources enabled")
        return []
    out = []
    for spec in specs:
        try:
            out.append(build_source(spec))
        except Exception as e:
            log.error("Skipping source %s: %s", spec.get("name"), e)
    return out
