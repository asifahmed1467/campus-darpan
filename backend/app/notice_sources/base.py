"""The one interface every notice source implements. Swap sources without touching the rest of the app."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date


class SourceError(Exception):
    """A source could not be read right now (network, bad format, not permitted). The cycle logs it and moves on."""


@dataclass(frozen=True)
class RawNotice:
    title: str
    url: str                       # link to the official notice page (required)
    published: date | None = None
    summary: str | None = None
    category: str | None = None
    attachment_url: str | None = None
    body: str | None = None


class NoticeSource(ABC):
    name: str = "source"
    kind: str = "base"

    @abstractmethod
    def fetch(self) -> list[RawNotice]:
        """Return the notices the source currently lists. Raise SourceError on failure. Must not write to the DB."""

    def describe(self) -> dict:
        """Safe-to-show description (never include secrets)."""
        return {"name": self.name, "type": self.kind}
