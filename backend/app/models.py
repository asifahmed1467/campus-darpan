from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _now():
    return datetime.now(timezone.utc)


class Faculty(Base):
    __tablename__ = "faculty"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    name_norm: Mapped[str] = mapped_column(String(200), index=True)
    email: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    faculty_code: Mapped[str | None] = mapped_column(String(10), index=True, nullable=True)  # FST/FE/FBA/FASS/FHLS
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(200), nullable=True)
    room: Mapped[str | None] = mapped_column(String(50), nullable=True)
    building: Mapped[str | None] = mapped_column(String(50), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    profile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    slots: Mapped[list["TsfSlot"]] = relationship(back_populates="faculty", cascade="all, delete-orphan")


class TsfSlot(Base):
    """One weekly block. day: SUN=0 .. SAT=6. Times are minutes since midnight (Asia/Dhaka)."""
    __tablename__ = "tsf_slots"
    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculty.id", ondelete="CASCADE"), index=True)
    semester: Mapped[str] = mapped_column(String(50), index=True)
    day: Mapped[int] = mapped_column(Integer)
    start_min: Mapped[int] = mapped_column(Integer)
    end_min: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(20))  # CLASS / CONSULTATION / ADMIN
    course: Mapped[str | None] = mapped_column(String(100), nullable=True)
    section: Mapped[str | None] = mapped_column(String(20), nullable=True)
    room: Mapped[str | None] = mapped_column(String(50), nullable=True)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    faculty: Mapped[Faculty] = relationship(back_populates="slots")


class TsfUpload(Base):
    """History of every TSF upload so a bad upload can be inspected / re-applied."""
    __tablename__ = "tsf_uploads"
    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculty.id", ondelete="CASCADE"), index=True)
    semester: Mapped[str] = mapped_column(String(50))
    payload: Mapped[list] = mapped_column(JSON)
    uploaded_by: Mapped[str] = mapped_column(String(100))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Semester(Base):
    __tablename__ = "semesters"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class Holiday(Base):
    __tablename__ = "holidays"
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True)
    name: Mapped[str] = mapped_column(String(200))


class Notice(Base):
    __tablename__ = "notices"
    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(600), unique=True)
    title: Mapped[str] = mapped_column(String(500))
    published_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(60), default="feed")  # name of the NoticeSource that supplied it
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    attachment_url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class Admin(Base):
    __tablename__ = "admins"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="editor")  # super_admin / editor
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Document(Base):
    """Pages/PDF text the Ask-AIUB assistant answers from (each answer cites url)."""
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(600), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    text: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Visitor(Base):
    """Anonymous visitor id per day -> unique visitor counts. No personal data."""
    __tablename__ = "visitors"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date)
    vid: Mapped[str] = mapped_column(String(40))
    __table_args__ = (UniqueConstraint("day", "vid"), Index("ix_visitors_day", "day"))


class AskLog(Base):
    __tablename__ = "ask_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(String(500))
    mode: Mapped[str] = mapped_column(String(20))  # faculty / docs / none
    answered: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class IngestRun(Base):
    """One attempt to read one notice source (the scrape log)."""
    __tablename__ = "ingest_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(60), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running")  # ok / error / skipped
    found: Mapped[int] = mapped_column(Integer, default=0)
    new: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class InboundEmail(Base):
    """A forwarded notice email received on the webhook. Nothing from students' own mailboxes ever lands here."""
    __tablename__ = "inbound_emails"
    id: Mapped[int] = mapped_column(primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    message_id: Mapped[str | None] = mapped_column(String(300), unique=True, nullable=True)
    sender: Mapped[str] = mapped_column(String(300))
    subject: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), index=True)  # accepted / quarantined / rejected / published
    reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    attachment_url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    published_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    notice_id: Mapped[int | None] = mapped_column(ForeignKey("notices.id", ondelete="SET NULL"), nullable=True)


class PushSubscription(Base):
    """A browser that asked to be notified. Anonymous: no student account is involved."""
    __tablename__ = "push_subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    endpoint: Mapped[str] = mapped_column(String(800), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    tags: Mapped[list] = mapped_column(JSON, default=list)  # empty = every notice
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failures: Mapped[int] = mapped_column(Integer, default=0)


class NotificationLog(Base):
    """One row per notice that was pushed: who it reached. Also the guard against sending a notice twice."""
    __tablename__ = "notification_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    notice_id: Mapped[int] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"), unique=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    recipients: Mapped[int] = mapped_column(Integer, default=0)
    delivered: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    removed: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
