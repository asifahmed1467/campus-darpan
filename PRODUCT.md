# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

AIUB students (about 2,000 expected), mostly on phones between classes, doing quick lookups: is a teacher free right now, what is the latest notice, what is the answer to a campus question. Students never sign up. Only 6 to 7 admins log in, to upload teacher schedules (TSFs), manage notices, holidays, semester dates and Ask AIUB pages.

## Product Purpose

ক্যাম্পাসদর্পণ (Campus Darpan), "Your Campus, Connected.", puts AIUB's academic information at one address: live notices, "is this teacher free right now" from each teacher's schedule, voice-or-text Ask AIUB answers with sources, and later a room finder. Success is a student getting a correct answer in seconds without logging in.

## Positioning

Answers are computed from real schedules (free now / until when / next free, Dhaka time, Fri+Sat weekend, holidays, semester dates) and every Ask AIUB answer shows its source. It is not a language-model chatbot yet.

## Operating Context

Built by a student for AIUB; admins are students/staff entering data by hand or by file import (JSON, CSV). Next.js frontend and FastAPI backend, deployed on Render behind Cloudflare. Dhaka timezone. Time-travel (`?at=`) exists for testing only.

## Capabilities and Constraints

- Faculty search with autocomplete and typo tolerance; free-time calculation; admin TSF import with timetable preview.
- Ask AIUB: browser speech in and out (Chrome/Edge), answers only from schedules, the notice list, and admin-added pages, always with a source.
- Live notice alerts, anonymous online counter, Web Push, installable app manifest.
- Room Finder: "coming soon" only; needs floor plans.
- No AIUB notice source is connected; aiub.edu robots rules forbid scraping, so the portal is never scraped.
- Permission to show schedules from the student portal is unresolved.
- Some TSF end times are estimated and unverified.
- Platform stays web; stack is existing (Next.js 15, Tailwind, FastAPI).

## Brand Commitments

Name is ক্যাম্পাসদর্পণ / Campus Darpan. Tagline "Your Campus, Connected." and the Bangla line "AIUB-এর সকল একাডেমিক তথ্য, এক ঠিকানায়।". Bangla and English labels are both required. Fonts currently in the repo: Bricolage Grotesque, Hind Siliguri (incumbent, not a binding commitment).

## Evidence on Hand

Five real TSFs in `backend/seed_tsf_batch_01.json`. 65 automated tests. No real notices, testimonials or usage data exist; do not fabricate them.

## Product Principles

1. Correct and sourced beats clever: never show a free-time or answer the data cannot back.
2. Zero friction for students: no sign-up, instant answers, works on cheap phones and weak networks.
3. Bangla and English are equals, not a translation layer.
4. Be honest about gaps (empty notices, estimated times, coming-soon room finder) rather than faking content.

## Accessibility & Inclusion

Mobile-first, low-end phones and weak networks. Bangla text must render well. Voice input is optional, never the only path.
