# Plan: Matchmaking System for Taaruf (Updated)

## Context
The matchmaking system is being built incrementally. A parallel work stream has already shipped significant infrastructure that is **different from the original plan** — instead of a user-login portal where attendees self-serve, the team chose an **admin-mediated, token-based architecture**. This plan documents what already exists, what's still missing, and what needs to change to align with management's latest decisions (3-interest cap, profile-completion gate, neutral decline notifications).

---

## What's Already Built (in `main`)

### Backend (Convex)

**`convex/registrations.ts`** — extended with:
- Profile-completion fields: `ethnicity`, `prayerCommitment`, `hijabResponse`, `spouseRequirement1/2/3`, `shareableBio`, `photoSharingPermission`, `imageStorageIds`, `interestSubmission`, `interestSubmissionNumbers`, `applicantNotesToAdmin`
- Profile lifecycle: `profileAccessToken`, `profileCompletionStatus` (`not_started` | `in_progress` | `completed`), `profileCompletedAt`, `profileLastUpdatedAt`, `profileUpdateRequestedAt`, `profileUpdateEmailSent`, `profileUpdateEmailSentAt`, `profileUpdateEmailError`
- Search availability: `searchStatus` (`active` | `paused` | `inactive`), `searchStatusNote`
- Active match link: `activeMatchId`
- Auto-syncs interest submissions from profile updates (numbers entered → interests rows created)

**`convex/interests.ts`** — interest lifecycle:
- Statuses: `new`, `queued`, `active`, `converted_to_match`, `deferred`, `withdrawn`, `declined`, `closed`
- Admin statuses: `pending`, `requested`, `declined`, `matched`
- Sources: `admin_entered`, `email`, `whatsapp`, `platform_submission`
- Visibility: `internal_only` (female→male, hidden from male) vs `admin_actionable` (male→female, visible to admin to action)
- Mutations: `create`, `updateStatus`, `updateAdminStatus`, `updateNotes`, `updateRank`, `remove`, `progressFirst` (FIFO queue advance), `convertToMatch`
- Auto-pairs mutual interest when admin creates the matching second interest

**`convex/matches.ts`** — confirmed matches:
- Statuses: `new`, `reviewing`, `contact_shared`, `declined`, `paused`, `closed`
- Initiated by: `admin_recommendation` or `interest_signal`
- Tracks notification sent timestamp + errors
- Mutations: `getById`, `resetPair`, `markNotificationSent`

**`convex/profileShares.ts`** — admin-controlled profile sharing:
- Tokenized URL (`shareToken`) so attendees view shared profiles without an account
- `includeImages` toggle controls whether photos are shared
- Statuses: `drafted`, `shared`, `viewed`, `interested`, `declined`, `follow_up_needed`, `closed`
- Mutations: `create`, `getByShareToken`, `markViewed`

### Frontend

**Public pages**
- `/profile/[token]` — Token-based profile completion form. New registrants get an emailed link to fill out their extended profile (ethnicity, prayer commitment, hijab, 3 requirements, bio, photos, photo sharing preference).
- `/share/[token]` — Token-based shared profile viewer. Lets a recipient view someone else's profile (name hidden, optionally with photos based on owner's `includeImages` consent).

**Admin pages** (`/admin/(shell)/...` — new admin shell + sidebar):
- `dashboard` — overview metrics
- `profiles` — registration list and detail panel
- `pending` — pending registrations
- `inbox` — interest signals to action
- `interests` — interests management (visual stub for now)
- `pipeline` — match pipeline (visual stub)
- `workbench` — admin matching workspace (visual stub)
- `events` — events placeholder (visual stub)
- `settings` — admin settings

**Admin API routes**
- `/api/admin/send-profile-link` — sends a profile-completion link by email
- `/api/admin/create-profile-share` — creates a `profileShares` record + tokenized URL
- `/api/admin/notify-match` — emails both parties when a match is created

**Design system**
- `docs/admin/design.md` — design tokens (cream/emerald palette, Cormorant Garamond display, Inter Tight UI)
- Admin uses warm editorial style with `pill-*` color tokens for status badges

### Registration Form
- Now collects extended profile fields at registration (no longer a 2-step flow — they fill everything during signup)
- Photo upload (1–3 images, stored in Convex storage)
- Photo sharing permission: `yes` | `no` | `ask_me_first`
- Interest submission as free text + optional list of numbers

---

## What's Different from the Original Plan

| Original Plan | What Was Built |
|---|---|
| User login via email + 6-digit code | **Token-based access** — no user accounts; attendees access via emailed tokens |
| Self-service portal where attendees express interest | **Admin-mediated** — admins enter interests on behalf of attendees, share profiles manually |
| Events table to scope matches | **No events yet** — flat pool (deferred) |
| `interests.status: pending → sent → accepted/declined` | More granular: `new → queued → active → converted_to_match` (plus `deferred`, `withdrawn`, `declined`, `closed`) |
| `matches.status: active/ended` | More granular: `new`, `reviewing`, `contact_shared`, `declined`, `paused`, `closed` |
| Photo sharing in-app within a match | **Photo consent set at registration** + `profileShares.includeImages` flag controls whether photos go in shared profile |
| Same-event matching only | Not yet enforced — flat pool |
| Mutual interest auto-match | ✅ Implemented (admin creates the matching second interest, auto-pairs) |
| One match at a time | Partial — `activeMatchId` field exists but enforcement TBD |
| Anonymized profile review | ✅ Via `/share/[token]` (name hidden) |

---

## Management's Decisions (From Latest Feedback)

1. **3 active interests at a time** per attendee — currently `interestSubmissionNumbers` stores up to 3 numbers, but the cap isn't enforced as a hard rule yet
2. **Profile completion required** before any matching activity — the `profileCompletionStatus` field exists but isn't yet enforced as a gate on interests/matches
3. **Decline notifications** — the requester should be told (with neutral language: "no longer active" / "closed") so they can move on; currently `interests.status: declined` exists but no notification flow
4. **Anonymized profile uses extended profile data** (not original event data) — `/share/[token]` already does this

---

## What Still Needs to Be Built

### Phase 0: Pre-Implementation Setup

Before touching feature code, do this housekeeping so the working tree is clean and Phase A doesn't regress lint.

**Track these as durable project files** (commit them):
- `AGENTS.md` — durable repo instructions for Convex work (canonical)
- `convex/tsconfig.json` — Convex project config, useful for typechecking
- `CLAUDE.md` — **shrink to a one-line pointer** like `See AGENTS.md.` Do not maintain duplicate content; the two files will drift. Keeping a tiny stub satisfies Claude Code's filename convention without duplicate-source-of-truth risk.

**Ignore these local agent/tooling artifacts** (add to `.gitignore`):
```
.claude/
.agents/
skills/
skills-lock.json
```

**Stage only the durable files** in the first cleanup commit. Do not commit anything from `.claude/worktrees/` (those are scratch worktrees from prior sessions).

**Lint baseline:** `npm run lint` currently fails. Some failures come from `.claude/worktrees` (resolved by the gitignore above). Real project code also has pre-existing lint issues in:
- `convex/interests.ts`
- `convex/registrations.ts`
- The two scripts under `scripts/`

**Goal: leave the repo with `npm run lint` passing on `main`.** That's a hard requirement, not a stretch goal — once we add CI (likely soon), a permanently-failing lint baseline blocks every PR.

Specifically:
- Phase A modifies `convex/interests.ts` and `convex/registrations.ts`, so clean their lint issues as part of Phase A's diff.
- For `scripts/`: either fix the lint issues in a separate small commit, **or** add `scripts/` to `.eslintignore` if the agent confirms those files are operational/throwaway. Pick one — do not leave them broken.
- **Do not** do a sweeping codebase-wide lint cleanup beyond the above. Keep changes scoped.

### Phase A: Enforce Management's Rules

**Architectural requirement:** All interest creation paths — including manual admin-created interests (`convex/interests.ts:create`) and profile-update auto-created interests (`convex/registrations.ts:syncSubmittedInterestNumbers`) — **must route through shared Convex helpers** so they obey the same:
- Profile-completion gate
- 3-active-interest cap
- Duplicate check (no second open interest for the same from→to pair)
- Active-match queuing behavior (`new` vs `queued` based on either party's `activeMatchId`)

Recommended structure: a new internal module (e.g., `convex/interestRules.ts`) exporting helpers like `assertCanCreateInterest(ctx, fromId, toId)` and `decideInitialStatus(ctx, fromId, toId)`. Both call sites import these. This prevents drift between manual-entry and auto-entry paths.

**Production rollout — backfill existing registrations (do this BEFORE flipping any gate)**

The April event has dozens of registrations from before the extended profile fields existed. Most do not have `ethnicity`, `prayerCommitment`, `hijabResponse`, `spouseRequirement1/2/3`, `shareableBio`, or `photoSharingPermission` filled in. If the profile-completion gate ships without addressing them, **every existing registrant gets locked out of matching the moment Phase A deploys**.

The implementing agent must pick **one** rollout strategy and document the choice in the PR description:

1. **Backfill script** — a one-shot Convex action that iterates registrations and sets `profileCompletionStatus: "completed"` if the registrant has all required fields, otherwise leaves them `not_started` and triggers a profile-completion email. Safest for an in-flight cohort.
2. **Email-then-enforce** — send a profile-completion email to every active registrant first, wait a chosen window (e.g. 7 days), then flip the gate. Better for fresh consent but slower.
3. **Grandfather existing pending interests** — Phase A enforcement only applies to NEW interests created after deploy. Existing rows continue to flow through the old admin paths. Lowest disruption, but now we maintain two regimes — only acceptable as a short-term bridge.

Default recommendation: **strategy 1 (backfill)** combined with admin spot-check. Add the backfill action under `convex/migrations/` (or a clearly named folder) so it's discoverable and re-runnable.

**`activeMatchId` denormalization — pick one, do not half-do both**

The schema already has `registrations.activeMatchId` as a denormalized pointer. Two options for Phase A:

1. **Keep the pointer, enforce the invariant.** Every code path that creates/closes a match also updates both registrations' `activeMatchId`. Add a Convex query `verifyActiveMatchInvariant()` that scans for drift (registrations pointing to non-active matches, or matches in `contact_shared` whose participants don't both point back). Run it as a periodic check or expose it on the admin settings page.
2. **Drop the denormalization.** Compute "is this person in an active match?" from the `matches` table on demand, using an index like `matches.by_status_and_male` / `by_status_and_female`. Slightly more reads per query but no drift risk. Requires removing `activeMatchId` from the schema and any code that reads it.

The current code already sets `activeMatchId` in some places, so option 1 is the lower-disruption path. **Phase A should pick option 1 explicitly** and add the invariant check. Do not start writing to `activeMatchId` in some new paths while leaving others untouched — that's how the drift starts.

**Tests — Phase A is a state machine, ship tests with it**

Phase A's helpers govern queue, dequeue, mutual-interest auto-pair, and decline cascading. This is exactly the kind of code that breaks silently. The implementing agent must add Convex unit tests covering at minimum:

- Profile-completion gate: `from` incomplete, `to` incomplete, both incomplete (each should reject with a clear error)
- 3-cap: at boundary 3, decline frees a slot, withdrawn frees a slot, `closed` frees a slot, `converted_to_match` frees a slot
- Duplicate check: two open interests for the same `from→to` pair are rejected; a previously declined pair can be re-attempted only if business rules allow (cross-reference open question #1)
- Active-match queuing: target has `activeMatchId` → new interest lands as `queued`; closing the match promotes the oldest queued to `active`
- FIFO progression in `progressFirst`: ensure deterministic order by `createdAt`
- Mutual-interest auto-pair: A creates interest in B; B creates interest in A → both convert to a match in one transaction; both registrations get `activeMatchId` set; any other queued interests for either party stay queued

Tests live under `convex/__tests__/` (or whichever convention the existing tests use). If no Convex test infra exists yet, add it — Convex supports `@convex-test/dev` for in-memory testing.

1. **Profile-completion gate**
   - Block `interests.create` if either side's `profileCompletionStatus !== "completed"`
   - Block `profileShares.create` if owner's profile incomplete
   - Show a "Complete your profile to start matching" banner on the profile completion page

2. **3-active-interest cap**
   - In `interests.create`, count the requester's open interests (`new`, `queued`, `active`, `deferred`)
   - Reject with a clear error if already 3
   - Free up slots automatically when status moves to `declined`, `withdrawn`, `closed`, or `converted_to_match`

3. **Decline notification (neutral language)**
   - When `interests.updateAdminStatus` or `interests.updateStatus` transitions to `declined`, trigger an email to the requester
   - Email copy: "Your interest in #{N} has been closed. You may now express interest in someone else." — no "rejected", no reason, no exposure of the other side's response
   - Mirror in attendee-facing UI when one is built

4. **One-active-match enforcement**
   - When a match enters `contact_shared` status, set `registrations.activeMatchId` for both parties
   - When `interests.create` runs, set status to `queued` (instead of `new`) if either party has an `activeMatchId`
   - When a match closes, run `progressFirst` to promote the oldest queued interest

### Phase B: Events (Deferred but Recommended)

1. Add `events` table: `name`, `date`, `description`, `status`, `maleSlots`, `femaleSlots`
2. Backfill existing registrations to a default "April 12 2026" event
3. Scope `interests.create` to require both registrations belong to the same `eventId`
4. Add event filter to admin dashboard
5. Per-event registration numbers (stable, stored — not derived from creation order)

### Phase C: Attendee Self-Service Portal (Optional Future)

The current admin-mediated model works for small scale. If attendee self-service becomes desirable later, this can be added without breaking the existing token-based flow.

1. Email + 6-digit code login (`portalAuth.ts`)
2. `/portal` dashboard — shows their profile, interests sent/received, active match
3. `/portal/interest` — enter a number (max 3 active)
4. `/portal/request/[id]` — accept/decline incoming interest
5. The token-based `/profile/[token]` and `/share/[token]` pages remain for unauthenticated flows (e.g., admins still email shared profiles to attendees who haven't logged in)

### Phase D: Remove the Legacy Dashboard (Final Step)

The legacy single-page admin dashboard is currently kept reachable at `/admin/legacy` because the new shell at `/admin/(shell)/...` did not yet re-skin every feature (interests queue, profile shares, match notifications, image thumbnails, applicant numbers, profile status filter).

**Once Phases A and B are complete and every legacy-only feature has a working equivalent in the new shell**, do this as the final cleanup step:

1. Confirm feature parity:
   - Interests queue → in `/admin/(shell)/interests` and/or `inbox`
   - Profile shares → admin can create + track from the new shell
   - Match notifications → triggerable from the new shell
   - Image thumbnails → visible in profile detail panes
   - Applicant numbers → shown in registration list and profile detail
   - Profile completion status filter → present in the new profiles list
   - All actions in `admin-dashboard.tsx` (approve/reject/delete, slot caps, payment reconciliation, CSV export, admin notes) → available in the new shell
2. Delete `src/app/admin/legacy/page.tsx`
3. Delete `src/components/admin-dashboard.tsx` (the monolithic legacy component)
4. Remove the "viewing the legacy admin" banner / cross-link
5. Verify no other code imports the removed files (`grep -r "admin-dashboard\|admin/legacy" src/`)
6. Update any docs that still reference `/admin/legacy`

**Verification:** Visit `/admin/legacy` → should 404. Confirm every workflow in the legacy dashboard's checklist still works in the new shell before deleting.

---

## Files That Need Changes (Phase A)

- `convex/interests.ts`
  - Add `assertProfileCompleted(ctx, registrationId)` helper
  - Add `assertOpenInterestCap(ctx, fromRegistrationId, max=3)` helper
  - Use both in the `create` mutation
  - Trigger decline notification on status transitions

- `convex/registrations.ts`
  - Add `setActiveMatch(registrationId, matchId)` and `clearActiveMatch(registrationId)` mutations
  - Already has the field; just needs lifecycle wiring

- `convex/matches.ts`
  - When status transitions to `contact_shared`: set `activeMatchId` on both registrations
  - When status transitions to `closed` or `declined`: clear `activeMatchId` and call `interests.progressFirst` for both parties

- `src/lib/email.ts`
  - Add `sendInterestClosedEmail({ requesterEmail, requesterName, targetNumber })` template

- `src/app/api/admin/notify-decline/route.ts` (NEW) — admin endpoint to send the close notification (or wire into the existing status-update mutation)

---

## Verification

1. **Profile-completion gate**: Try to create an interest with an incomplete profile → should error
2. **3-cap**: Create 3 interests for one applicant, try a 4th → should error. Decline one → can now create another.
3. **Decline notification**: Decline an interest → requester receives email with neutral language. Check email log.
4. **One-match-at-a-time**: Move match A→B to `contact_shared` → both registrations have `activeMatchId` set → new interests for either land as `queued`. Close the match → queued interests are promoted to `active` (FIFO).
5. **Existing admin flow**: All existing admin pages continue to work — no regression in `/admin/(shell)/profiles`, `inbox`, etc.

---

## Open Questions (Now Re-prioritized)

1. **Re-interest after match ends**: If A & B matched and the match closes, can A re-express interest in B?
2. **Notification cadence**: Multiple incoming interests → one email per, or batched?
3. **Match auto-expiry**: Should `contact_shared` matches auto-close after 30 days of inactivity?
4. **Event scoping**: Build Phase B (events) before or after Phase A (rule enforcement)? Phase A is unblocked by Phase B and more urgent given management's feedback.
5. **Photo behavior on profile share**: Currently the admin chooses `includeImages` per share. Should this default to the owner's `photoSharingPermission` preference automatically?
