---
version: alpha
name: Taaruf Admin
description: Warm editorial design system for Taaruf's matchmaking back-office. Cream + emerald palette, Cormorant Garamond display, Inter Tight UI.
colors:
  bg: "#F7F4EC"
  bg-tint: "#F0ECE0"
  panel: "#FFFFFF"
  ink: "#14201A"
  ink-2: "#35453C"
  mute: "#6B7A72"
  line: "#E1DBCB"
  line-2: "#EFEAD9"
  primary: "#2E4A3E"
  primary-2: "#406556"
  primary-on: "#F7F4EC"
  gold: "#B08A3E"
  rose: "#9C3E3A"
  amber: "#C78A2D"
  green: "#3B7A54"
  blue: "#3B5F7A"
  pill-green-bg: "#E8F1EB"
  pill-green-border: "#C5DCCD"
  pill-amber-bg: "#FBF0DA"
  pill-amber-text: "#8A5E1B"
  pill-amber-border: "#EEDAAA"
  pill-rose-bg: "#F7E5E4"
  pill-rose-border: "#EACAC8"
  pill-blue-bg: "#E5EEF5"
  pill-blue-border: "#C6D6E3"
  pill-gold-bg: "#F5EBD0"
  pill-gold-text: "#7A5E25"
  pill-gold-border: "#E3D3A3"
  who-f-bg: "#F4E7E6"
  who-f-text: "#8A3B37"
  who-m-bg: "#E5EBE7"
  who-m-text: "#2E4A3E"
typography:
  page-title:
    fontFamily: Cormorant Garamond
    fontSize: 42px
    fontWeight: "500"
    lineHeight: "1"
    letterSpacing: -0.01em
  page-title-mobile:
    fontFamily: Cormorant Garamond
    fontSize: 30px
    fontWeight: "500"
    lineHeight: "1"
    letterSpacing: -0.01em
  panel-title:
    fontFamily: Cormorant Garamond
    fontSize: 22px
    fontWeight: "500"
    letterSpacing: -0.01em
  stat-figure:
    fontFamily: Cormorant Garamond
    fontSize: 40px
    fontWeight: "500"
    lineHeight: "1"
    letterSpacing: -0.02em
  donut-figure:
    fontFamily: Cormorant Garamond
    fontSize: 32px
    fontWeight: "500"
    lineHeight: "1"
  pull-quote:
    fontFamily: Cormorant Garamond
    fontSize: 15px
    fontWeight: "500"
    lineHeight: 1.5
    letterSpacing: 0
  body-lg:
    fontFamily: Inter Tight
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 1.5
  body-md:
    fontFamily: Inter Tight
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter Tight
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 1.4
  label-md:
    fontFamily: Inter Tight
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 1.4
  label-sm:
    fontFamily: Inter Tight
    fontSize: 10px
    fontWeight: "500"
    lineHeight: 1.2
    letterSpacing: 0.16em
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: "400"
    letterSpacing: 0.04em
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: "500"
    letterSpacing: 0.04em
rounded:
  none: 0px
  sm: 4px
  DEFAULT: 6px
  md: 6px
  lg: 8px
  xl: 12px
  full: 99px
spacing:
  unit: 4px
  hairline: 2px
  xxs: 4px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 28px
  page-content: 28px
  page-content-mobile: 16px
  panel-head: 14px 20px
  panel-body: 20px
  stat-card: 18px 20px
  table-cell: 12px 16px
  sidebar-rail: 240px
  sidebar-rail-collapsed: 64px
  detail-pane: 520px
components:
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: 0
  panel-head:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.panel-title}"
    padding: 14px 20px
  page-head-title:
    textColor: "{colors.ink}"
    typography: "{typography.page-title}"
  stat-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.stat-card}"
  stat-figure:
    textColor: "{colors.ink}"
    typography: "{typography.stat-figure}"
  stat-label:
    textColor: "{colors.mute}"
    typography: "{typography.label-sm}"
  btn-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-on}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  btn-primary-hover:
    backgroundColor: "#24392F"
  btn-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  btn-secondary-hover:
    backgroundColor: "{colors.bg-tint}"
  btn-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-2}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  btn-ghost-hover:
    backgroundColor: "{colors.bg-tint}"
  btn-sm:
    typography: "{typography.body-sm}"
    padding: 5px 10px
  pill-base:
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 3px 9px
  pill-plain:
    backgroundColor: "{colors.bg-tint}"
    textColor: "{colors.ink-2}"
  pill-green:
    backgroundColor: "{colors.pill-green-bg}"
    textColor: "{colors.green}"
  pill-amber:
    backgroundColor: "{colors.pill-amber-bg}"
    textColor: "{colors.pill-amber-text}"
  pill-rose:
    backgroundColor: "{colors.pill-rose-bg}"
    textColor: "{colors.rose}"
  pill-blue:
    backgroundColor: "{colors.pill-blue-bg}"
    textColor: "{colors.blue}"
  pill-gold:
    backgroundColor: "{colors.pill-gold-bg}"
    textColor: "{colors.pill-gold-text}"
  sidebar:
    backgroundColor: "{colors.panel}"
    width: "{spacing.sidebar-rail}"
    padding: 10px 0
  sidebar-collapsed:
    width: "{spacing.sidebar-rail-collapsed}"
  nav-item:
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 6px 10px
    textColor: "{colors.ink-2}"
  nav-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-on}"
  nav-item-hover:
    backgroundColor: "{colors.bg-tint}"
  topbar:
    backgroundColor: "{colors.panel}"
    padding: 14px 28px
    height: 60px
  table-header-cell:
    backgroundColor: "{colors.bg-tint}"
    textColor: "{colors.mute}"
    typography: "{typography.label-sm}"
    padding: 12px 16px
  table-cell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    padding: 12px 16px
  table-row-hover:
    backgroundColor: "{colors.bg-tint}"
  detail-pane:
    backgroundColor: "{colors.panel}"
    width: "{spacing.detail-pane}"
  detail-pane-backdrop:
    backgroundColor: rgba(20, 32, 26, 0.3)
  fact-key:
    textColor: "{colors.mute}"
    typography: "{typography.label-sm}"
  fact-value:
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  pull-quote:
    backgroundColor: "{colors.bg-tint}"
    textColor: "{colors.ink-2}"
    typography: "{typography.pull-quote}"
    rounded: "{rounded.md}"
    padding: 14px
  donut-track:
    backgroundColor: "{colors.line-2}"
  donut-fill:
    backgroundColor: "{colors.primary}"
  qcard:
    backgroundColor: "{colors.panel}"
    padding: 16px 20px
  qcard-rank:
    textColor: "{colors.primary}"
    typography: "{typography.donut-figure}"
  tab:
    typography: "{typography.body-md}"
    textColor: "{colors.mute}"
    padding: 10px 14px
  tab-active:
    textColor: "{colors.primary}"
  filter-chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 6px 10px
  filter-chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
---

## Overview

Taaruf's admin surface is the back-office for a Muslim matchmaking service led by Bader Ghashim and Danielle Gore. The visual language is **warm, editorial, faith-forward** — closer to a slow magazine layout than a SaaS dashboard. Operators spend long sessions reading applicant essays, weighing matches, and writing notes; the design optimizes for calm focus over information density.

The brand voice is reverent without being ornate. Cormorant Garamond carries the human, italicized greetings and section names ("Assalāmu *ʿalaykum*", *Profiles* & registrations); Inter Tight does the heavy lifting in the UI; JetBrains Mono surfaces every quantitative datum so numbers always feel deliberate. The color palette stays earthy — cream paper, deep emerald ink, muted gold and rose accents — so screens feel less like glowing software and more like an artisan ledger.

Every page follows the same skeleton: a sidebar of nav groups on the left, a thin topbar with breadcrumb + search + primary action, and a content well of bordered panels. Dialogs are avoided in favor of a right-side detail pane that slides in over context, preserving the operator's place in the list.

## Colors

The palette is split into three pairs by role.

- **Cream surface + emerald ink.** `bg` (#F7F4EC) is the base, `panel` (#FFFFFF) is the elevated surface, `ink` (#14201A) is body text, and `primary` (#2E4A3E) is the accent for active states, primary buttons, and italicized titles. Avoid pure black anywhere; ink stays slightly green to read warmer.

- **Three borders, one tint.** `line` (#E1DBCB) divides panels from the cream background; `line-2` (#EFEAD9) divides rows inside a panel; `bg-tint` (#F0ECE0) is the table-header / hover-state fill. Use them in that order — anything more layered reads chaotic.

- **Five status tones.** `green`, `amber`, `rose`, `blue`, `gold` exist only inside pills, button danger text, and trend arrows. Each has a desaturated paper-toned background variant (`pill-*-bg`) and a dark text variant (`pill-*-text`) so chips stay legible on the cream surface. Status semantics: green = approved/paid/active, amber = pending/reviewing, rose = rejected/declined/destructive, blue = informational/queued, gold = waitlisted/featured.

Gender accents live in the avatar circles only: rose-tinted (`who-f-*`) for sisters, emerald-tinted (`who-m-*`) for brothers. Never extend gender color to rows, headers, or pills.

## Typography

Three families, three jobs.

- **Cormorant Garamond (serif, 500 weight + italic).** Page titles (`page-title`, 42 → 30 px on mobile), panel headers (`panel-title`, 22 px), large numerics in stat cards and donuts (`stat-figure` 40 px, `donut-figure` 32 px), and italic pull-quotes for applicant essays. The italic accent inside titles (`<em>`) tints to `primary` — this is the system's only ornamental flourish.

- **Inter Tight (sans, 400/500/600).** Default UI font at 13 px (14 px on mobile). Used for navigation, table cells, buttons, body copy, and form fields. Section headings inside the detail pane use `label-sm` (10 px, uppercase, 0.16em tracking) in `mute` color.

- **JetBrains Mono (mono, 400/500).** Every number that's a fact, not a label: registration numbers, dates, scores, counts in tab badges, "X seats left" status lines, trend deltas in stat cards. The mono treatment signals "this is data, you can trust it as-typed."

Line height is 1.5 across body sizes, 1.0 on large display sizes, 1.4 on labels.

## Layout

A two-column shell at every viewport ≥769 px:

- **Sidebar** (240 px expanded, 64 px collapsed). Sticky to the viewport, scrolls internally when nav exceeds height. Brand mark + name pinned at top, nav groups in the middle, admin avatar + name pinned at the bottom via `margin-top: auto`. Hamburger button in the topbar toggles collapse on desktop and opens the sidebar as a drawer on mobile.
- **Main column.** A sticky topbar (60 px) followed by a content well padded `28 px` on desktop, `16 px` on mobile.

Inside the content well, content lives inside `panel` cards (white, `rounded.lg`, `1px solid line`). Pages compose panels with these grids:

- **Stats row** — 4 columns at desktop, 2 at tablet (769–1100 px), 1 on mobile.
- **Two-col split** — `2fr 1fr` for "main panel + side panel" layouts (Dashboard's needs-attention queue + registration pool donuts). Stacks below 1100 px.
- **Pipeline kanban** — 5 equal columns at desktop, scrolls horizontally below 1100 px, stacks at mobile.

Section spacing inside the content well is `28 px` between major blocks; gaps between cards in a grid are `16 px` desktop, `12 px` mobile. The detail pane slides in from the right at `520 px`, full-width on mobile, with a `rgba(20, 32, 26, 0.3)` backdrop.

## Elevation & Depth

The system is paper-flat. Depth comes from borders and a single hover tint, not shadows.

- **Level 0** — the cream background.
- **Level 1** — bordered panels (`panel`) sit on the cream with a `1px solid line` border, no shadow. The border alone establishes the surface.
- **Level 2** — the detail pane drawer floats above the page with `box-shadow: -20px 0 40px -20px rgba(0,0,0,0.15)` cast from its left edge, plus the dim backdrop. This is the only true shadow in the system; reserve it for modal overlays.

Hover affordances use a single fill change to `bg-tint`, never a shadow lift. Active nav items invert to `primary` background + cream text. Buttons darken on hover (primary → #24392F; ghost → `bg-tint`); they never scale, lift, or glow.

## Shapes

A tight radius scale that prefers the same value almost everywhere.

- `none` (0) — table dividers, internal panel separators.
- `sm` (4 px) — rare, only for inline tag chips inside dense tables.
- `DEFAULT` / `md` (6 px) — buttons, inputs, filter chips, nav items, icon buttons. **This is the default and you should reach for it first.**
- `lg` (8 px) — panels, stat cards, detail-pane drawer.
- `xl` (12 px) — pull-quote cards inside the detail pane only.
- `full` (99 px) — pills, avatars, count badges, nav-count badges.

Avatars are always perfect circles. Border weights stay at `1 px` everywhere; `2 px` is reserved for the active tab underline.

## Components

### Panel

The base content container. White surface, `1px solid line` border, `rounded.lg`. Headers (`panel-head`) are 14 × 20 px padded with a `1px solid line-2` bottom divider; the header's `<h3>` uses `panel-title` (Cormorant 22 px). Tools (filter buttons, view-all link) right-align in the header.

### Stat card

A 4-column tile that pairs an uppercase `stat-label`, a large `stat-figure`, and an optional supporting `sub` line. A 60 × 24 px sparkline anchors the top-right corner at 60% opacity. Trend deltas inside the sub line use `mono-md` font: green for positive, rose for negative.

### Pill / StatusPill

Status chip with a 6 px colored dot pseudo-element + label. Six tones: `plain`, `green`, `amber`, `rose`, `blue`, `gold`. Each tone has a paper-toned background, a darker text color, and a matching dot. `StatusPill` is a thin wrapper that maps a known status string (e.g. `"approved"`, `"pending"`, `"contact_shared"`) to the right tone + human label.

### Button

Three variants: `btn-primary` (emerald fill, cream text), `btn` (white fill, ink text, line border), `btn-ghost` (transparent, ink-2 text). All share `padding: 8px 14px`, `rounded.md`, `13 px / 500` Inter Tight. `btn-sm` reduces to `5 × 10 px` and 11 px text. Inline icons sit at 14 px to the left of the label with an 8 px gap.

### Sidebar nav item

Row with a 16 px monoline icon (currentColor stroke, 1.5 px), a label, and an optional count badge (`mono-sm`, `pill`-shaped). Active state inverts to `primary` background + cream text + the count badge picks up a translucent white background. Hover swaps to `bg-tint`. When the rail is collapsed, labels and section headers hide, items center on the icon, and the count badge becomes a tiny absolute-positioned bubble at the top-right.

### Table

Header cells use `bg-tint` background, `label-sm` font in `mute` color. Body rows divide with `1px solid line-2`, no row backgrounds. `row-click` rows hover to `bg-tint` and use `cursor: pointer`. Cells are 12 × 16 px padded. Numeric columns (registration #, dates, scores) use `mono-md`.

### Filter chip + tab

Filter chips (`filt`) are pill-rounded buttons with a 1 px border. Active state inverts to `ink` background + cream text — the deepest contrast in the UI, used sparingly to mark a single active filter per axis. Tabs (`tab`) live above the filter row, draw their active state with a 2 px `primary` underline plus tinted text. Both expose a `cnt` badge (mono, pill) for live counts.

### Detail pane

Right-edge drawer. 520 px wide on desktop, `100vw` on mobile. Header strip uses the same `dp-head` pattern: 16 × 20 px padded, 1 px bottom border, with the profile's WhoCell on the left and a close icon on the right. The body scrolls internally. Section labels inside the body use `label-sm` (uppercase, 0.16em tracking, mute color, 10 px margin-bottom). Pull-quote bio cards use `pull-quote` styling — italic Cormorant 15 px on `bg-tint`, `rounded.md`, 14 px padded. Action bar pinned at the bottom of the body with a 16 px top border-padding.

### WhoCell

Avatar (32 px circle) + name (`label-md`, ink) + sub-text (11 px, mute) in a flex row. Avatar tints by gender — rose for sisters, emerald for brothers — and shows initials. Image support hooks into the same shape via `imageStorageIds` once profiles carry photos.

### Donut

140 × 140 px ring chart. Track is `line-2` at 10 px stroke-width; fill is `primary` at the same width with `stroke-linecap: round`. Center label uses `donut-figure` (32 px Cormorant) with the cap denominator in mute color, and a `label-sm` caption beneath ("SISTERS", "BROTHERS").

### Sparkline

60 × 24 px polyline at 1.2 px stroke. No axes, no fill, no tooltips — purely decorative trend hint inside stat cards. Color matches the metric semantics (`primary` for neutral, `amber` for warnings, `gold` for capacity, etc.).

### Coming-soon panel

Center-aligned placeholder with an italic Cormorant lede ("Coming soon.", "All caught up.", "No matches.") and a single supporting paragraph. Used inside any panel that has no data to show, so empty states feel intentional rather than broken.

## Do's and Don'ts

**Do**

- Reach for `rounded.md` (6 px) by default. Use `rounded.lg` for panels and `rounded.full` for pills only.
- Wrap one or two words inside titles with `<em>` to pick up the italic emerald accent (e.g. `<em>Profiles</em> &amp; registrations`). Italicizing whole sentences kills the accent's punch.
- Use mono font for every standalone number (counts, scores, dates, IDs, "X of Y" readouts). Body sentences with embedded numbers stay in Inter Tight.
- Use `bg-tint` as the single hover/active/header fill. Multiple shades of cream confuse hierarchy.
- Open profile detail in the right-side drawer, not a centered modal. Drawers preserve the operator's place in the list.
- Prefer empty states (`coming-soon` panel) over hidden panels when a surface has no data — the structural cue helps operators learn the layout.

**Don't**

- Don't introduce gradients, glows, or drop shadows beyond the single drawer shadow. The system is paper-flat by intent.
- Don't render pure white panels on a white-page background. The cream `bg` is what makes panel borders read.
- Don't use the gender accent colors outside avatars. Tinting full rows or headers by gender turns the table into a chart.
- Don't add a fourth border tone or a second hover tint. If you need more depth, reach for a panel boundary.
- Don't use Cormorant for body copy or Inter Tight for large numerics. The role split is structural — swapping them collapses the visual hierarchy.
- Don't truncate applicant essays with ellipses in the table. Keep them in the detail pane where they have room to breathe.
