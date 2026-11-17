---
name: ক্যাম্পাসদর্পণ (Campus Darpan)
description: Your Campus, Connected. A live, glanceable campus plan for AIUB students.
colors:
  teal-ink: "#0C2430"
  campus-paper: "#EEF5F5"
  brand-teal: "#0F5C6E"
  free-green: "#167A49"
  busy-orange: "#BF3F0C"
  needle-amber: "#F5A623"
  violet: "#6B4E9B"
  hairline: "#CFDDDF"
  slate-mute: "#4F6B75"
  sheet: "#FFFFFF"
  track: "#D9E7E8"
  warn-ochre: "#7A5200"
  focus-blue: "#2B6BFF"
  night-ink: "#E8EDF7"
  night-paper: "#0B1120"
  night-brand: "#3C76EC"
  night-sheet: "#141D32"
  night-inverse: "#243460"
  night-hairline: "#2A3652"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, Hind Siliguri, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Bricolage Grotesque Variable, Hind Siliguri, system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Hind Siliguri, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Bricolage Grotesque Variable, Hind Siliguri, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
rounded:
  md: "8px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.brand-teal}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.teal-ink}"
  button-quiet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "44px"
  chip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "36px"
  chip-pressed:
    backgroundColor: "{colors.teal-ink}"
    textColor: "{colors.sheet}"
  field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
---

# Design System: ক্যাম্পাসদর্পণ (Campus Darpan)

## Overview

**Creative North Star: "The Campus Plan"**

The interface reads like a live, annotated campus floor plan. A faint dotted grid sits behind every page, status is a colored dot, and the signature moment is a "now" needle that sweeps across each teacher's day strip to the current time. Information is the star: who is free, what was posted, where a room is.

The mood is confident, clear and lightly playful. A trustworthy teal (navy in dark mode) carries the structure, amber marks "now" and emphasis, green and orange carry free and busy. Small moments of delight (the needle sweep, an amber highlighter under the headline, a pulsing live dot) are earned by meaning, not decoration. Bangla and English share one type system and the same weight on the page.

Light (Blueprint Teal) and dark (the original navy look) themes are both first-class, switched by `data-theme` and remembered in `localStorage`.

**Key Characteristics:**
- Dotted plan grid on a cool paper ground; white sheets float above it.
- Teal structure, amber "now", green and orange for state.
- Display type is Bricolage Grotesque; Bangla and body copy are Hind Siliguri.
- 44px minimum touch targets; focus rings always visible.
- Every animation has a `prefers-reduced-motion` fallback.

## Colors

A cool, teal-leaning palette with two signal colors. Values below are the light theme (Blueprint Teal); the dark theme keeps the original navy identity and remaps the same roles (see Dark theme).

### Primary
- **Brand Teal** (#0F5C6E): primary buttons, headline emphasis, hover borders on cards and chips, the browser theme color.

### Secondary
- **Needle Amber** (#F5A623): the "now" needle, the scroll-progress bar, heading underline, highlighter sweep, favorite star. Used as a mark, never as a large fill.

### Tertiary
- **Free Green** (#167A49): teacher is free; pulsing live dot; "clear" road state.
- **Busy Orange** (#BF3F0C): teacher is busy or in class; heavy-traffic state.
- **Violet** (#6B4E9B): reserved accent for a distinct category (schedule types and map layers).
- **Warn Ochre** (#7A5200): text on amber backgrounds and the "slow" state, chosen for contrast.

### Neutral
- **Teal Ink** (#0C2430): body text; also the inverse surface (pressed chips, room badges) and hover color for primary buttons.
- **Campus Paper** (#EEF5F5): page background, under the dot grid.
- **Sheet** (#FFFFFF): cards, fields, buttons, chips.
- **Hairline** (#CFDDDF): borders and dividers.
- **Track** (#D9E7E8): progress tracks, skeleton base, icon tiles.
- **Slate Mute** (#4F6B75): secondary text and placeholders.
- **Focus Blue** (#2B6BFF): the 3px focus ring and field glow.

### Dark theme
Night Paper (#0B1120) ground, Night Sheet (#141D32) cards, Night Ink (#E8EDF7) text, Night Hairline (#2A3652) borders, and a brighter Night Brand (#3C76EC). Pressed and inverse surfaces become Night Inverse (#243460). Green, orange, amber and violet are lifted for contrast on the dark ground.

### Named Rules
**The Signal Colors Rule.** Green, orange and amber each mean one thing (free, busy, now). Never use them as decoration.
**The Amber Is A Mark Rule.** Amber is a thin line, a needle or a highlighter band. It is never a button fill or a card background.

## Typography

**Display Font:** Bricolage Grotesque Variable (with Hind Siliguri, system-ui, sans-serif)
**Body Font:** Hind Siliguri (with system-ui, sans-serif)

**Character:** A characterful grotesque for headings and labels over a Bangla-capable humanist body face. The fallback chain puts Hind Siliguri second so Bangla headings never fall to a system font. Numerals are tabular everywhere, so times line up.

### Hierarchy
- **Display** (700, 2.6rem on mobile, larger on desktop, 1.08, -0.02em): home headline, limited to about 14 characters per line.
- **Headline** (600, 1.08, -0.02em, balanced wrapping): h1 to h3 on all pages.
- **Body** (400, 17px, 1.55, pretty wrapping): all running text; Bangla-safe size.
- **Label** (600, about 0.875rem): chips, buttons, status labels, set in the display face.

### Named Rules
**The Bangla First-Class Rule.** Any new text style must be checked in Bangla as well as English; never set Bangla in the display face alone and never below 16px.

## Layout

A single centered column on mobile with generous vertical rhythm (`space-y-14` between home sections), widening to a two-column hero (about 1.05fr / 1fr) at the large breakpoint. A bottom navigation bar with four icon destinations (Faculty, Notices, Ask, Rooms) serves phones; the header carries the logo, language switch, sound toggle and theme toggle. Content scrolls under a sticky header with 5rem scroll padding. Tailwind's default breakpoints apply.

## Elevation & Depth

Mostly flat and tonal. Depth comes from white sheets on tinted paper with hairline borders, not shadows. A single soft shadow appears only on hover for interactive cards.

### Shadow Vocabulary
- **Card hover** (`box-shadow: 0 10px 24px -16px rgb(var(--c-shadow) / .45)`): cards lift 2px and the border shifts to brand at 50% on hover.
- **Field focus** (`box-shadow: 0 0 0 4px rgb(var(--c-focus) / .18)`): a soft halo on focused inputs.

### Named Rules
**The Flat At Rest Rule.** Surfaces carry no shadow at rest; shadow answers a pointer.

## Shapes

Gently rounded and friendly. Buttons, fields and cards use an 8px radius; chips, avatars and status dots are fully round. Borders are 1px hairlines. Teacher avatars are initials in a round tile; room badges are small inverse-colored tags.

## Components

### Buttons
- **Shape:** 8px radius, 44px minimum height, 16px by 10px padding, label in the display face at semibold.
- **Primary:** Brand Teal fill with white text; hover shifts to Teal Ink; a soft light sweep crosses it on hover.
- **Quiet:** white sheet with a hairline border; hover turns the border to brand.
- **Press:** scales to 0.97.
- **Disabled:** 50% opacity, not-allowed cursor.

### Chips
- **Style:** fully round, white sheet, hairline border, 36px tall, semibold small text.
- **State:** `aria-pressed="true"` inverts to Teal Ink with white text. Hover lifts 2px and turns the border to brand.

### Inputs / Fields
- **Style:** white sheet, hairline border, 8px radius, 44px tall, muted placeholder.
- **Focus:** 3px Focus Blue outline plus a 4px soft halo.

### Navigation
- **Style:** a header with the Campus Darpan mark (a hover tilt) and three small toggles, plus a four-item bottom bar with line icons. The active item's icon bounces once. A 3px amber scroll bar tracks reading progress.

### Faculty Row (signature)
A tappable row: initials avatar, name, a status label with a colored dot (green pulses when free), room badge, favorite star, and a day strip showing classes with the amber "now" needle. On hover an amber bar grows at the left edge and the avatar tilts.

### Day Strip with Needle (signature)
A horizontal timeline of the teacher's day. The amber needle sweeps from the left edge to the current time once on load. It is the system's one defining animation.

### Notice Ticker
A mask-faded, slowly scrolling strip of the newest notices that pauses on hover, focus or touch.

### Today Card
A "Right now" card of icon-led rows (exams, weather, holiday, notices, road conditions), each with a small tinted icon tile; it floats gently.

## Do's and Don'ts

### Do:
- **Do** keep touch targets at least 44px (chips 36px) and keep the 3px focus ring visible.
- **Do** use Free Green, Busy Orange and Needle Amber only for free, busy and now.
- **Do** wrap every new animation in a `prefers-reduced-motion` fallback, as the existing ones are.
- **Do** build with the existing CSS variables (`--c-*`) so light and dark themes both work.
- **Do** check Bangla and English text at the same size and weight.

### Don't:
- **Don't** add a shadow at rest; reserve shadow for hover and focus.
- **Don't** use amber as a fill for buttons or large areas.
- **Don't** add new looping ambient motion; the needle sweep, live dot and notice ticker are the meaningful ones.
- **Don't** hard-code hex values in components; use the Tailwind color names backed by `--c-*`.
- **Don't** set Bangla text in a system fallback font or below 16px.
