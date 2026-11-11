# Progress Log

Append-only learning log for commits and deploys. Add new entries only at the end of this file. Do not edit or delete previous entries.

## Entry Template

## <ISO timestamp>
- Trigger: <commit|deploy>
- Learning: <required learning>
- Context: <commit message or release bump/version>
- Branch: <branch>
- Actor: <git user.name <git user.email>>
- Changed Paths:
  - <path> (commit entries only)

## 2026-04-09T19:13:00.000Z
- Trigger: commit
- Learning: Starting each repo with its own append-only progress log makes parallel website work easier to track without mixing histories across projects.
- Context: docs(progress): add append-only progress log
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - progress.md
## 2026-04-09T19:23:22.000Z
- Trigger: commit
- Learning: Making core narrative fields mandatory improves registration quality and gives the team enough context to review applicants meaningfully.
- Context: feat(register): require about me field
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/registration-form.tsx
  - progress.md
## 2026-04-09T19:24:56.000Z
- Trigger: commit
- Learning: Requiring both self-description and spouse-preference fields leads to more useful profiles for screening and matching decisions.
- Context: feat(register): require spouse preferences field
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/registration-form.tsx
  - progress.md
## 2026-04-13T20:27:50.000Z
- Trigger: commit
- Learning: Reusing the repo’s existing profile-link foundation is faster, but the backend needed to be hardened around persistent update tracking and Convex storage IDs before the UI work could safely expand.
- Context: feat(profile): add backend groundwork for extended profile updates
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/schema.ts
  - convex/registrations.ts
  - src/app/api/profile/[token]/route.ts
  - progress.md
## 2026-04-13T20:31:37.000Z
- Trigger: commit
- Learning: Expanding the registration form first with required structured profile fields and Convex-backed image uploads creates a clean foundation before retrofitting admin outreach and backfill flows.
- Context: feat(register): add extended profile fields and image uploads
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/registration-form.tsx
  - src/app/api/create-checkout-session/route.ts
  - progress.md
## 2026-04-13T20:34:38.000Z
- Trigger: commit
- Learning: Converting the existing profile-link draft into a real update workflow required simplifying the admin surface, batching profile-update emails, and keeping profile completion on secure persistent links instead of ad hoc one-off actions.
- Context: feat(profile): add admin update-profile emails and completion flow
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/profile-completion-form.tsx
  - src/app/api/admin/send-profile-link/route.ts
  - src/lib/email.ts
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-13T21:07:39.000Z
- Trigger: commit
- Learning: Resend can return delivery failures as structured error payloads without throwing, so email helpers must inspect  before marking messages as sent.
- Context: fix(email): handle resend api errors explicitly
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/lib/email.ts
  - progress.md
## 2026-04-13T23:48:55.000Z
- Trigger: commit
- Learning: Admin list rows and detail dialogs need signed Convex image URLs from the query layer, otherwise uploaded profile photos exist in storage but never render in the dashboard.
- Context: feat(admin): show applicant image thumbnails and detail photos
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/registrations.ts
  - src/app/profile/[token]/page.tsx
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-13T23:59:59.000Z
- Trigger: commit
- Learning: Applicant numbering in admin needs a stable sort order, so the list now uses  ascending and derives a persistent 1-based number from that order.
- Context: feat(admin): add applicant numbers to main view
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-14T00:04:40.000Z
- Trigger: commit
- Learning: Shadcn tab triggers and card descriptions on the admin page needed explicit text color classes, otherwise inactive labels became too low-contrast to read against the background.
- Context: fix(admin): improve inactive label contrast
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-14T19:23:41.000Z
- Trigger: commit
- Learning: Interest tracking needs to live separately from matches, with strict backend validation for opposite-gender-only interest, duplicate open-interest blocking, and explicit conversion from interest records into match records.
- Context: feat(interests): add backend groundwork for interest tracking
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/interests.ts
  - convex/schema.ts
  - progress.md
## 2026-04-14T19:26:22.000Z
- Trigger: commit
- Learning: The first admin UI phase for interest tracking needs two simple workflows to unlock momentum quickly: a manual create-interest form and a queue view with status changes and convert-to-match actions.
- Context: feat(interests): add admin interest queue ui
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-14T19:29:43.000Z
- Trigger: commit
- Learning: Reconciliation becomes much clearer when admins can see inbound and outbound interests directly inside the applicant detail view, with a visible alert when multiple inbound interests compete for the same person.
- Context: feat(interests): add applicant interest panels
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-14T19:35:02.000Z
- Trigger: commit
- Learning: Reconciliation works better as an explicit "progress first" backend action that activates one interest while automatically queueing competing inbound and outbound open interests around the same applicants.
- Context: feat(interests): add reconciliation workflow
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/interests.ts
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-14T20:06:46.000Z
- Trigger: commit
- Learning: Match notifications work best as an admin-triggered email action on linked matches, with explicit send-status tracking on the match record so admins can see whether both applicants were already notified.
- Context: feat(matches): add admin-triggered match notifications
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/matches.ts
  - convex/schema.ts
  - src/app/api/admin/notify-match/route.ts
  - src/components/admin-dashboard.tsx
  - src/lib/email.ts
  - progress.md
## 2026-04-14T20:09:46.000Z
- Trigger: commit
- Learning: The full applicant profile reads much better as a right-side slideout than a centered popup, especially once interest panels and reconciliation context are part of the detail view.
- Context: feat(admin): use slideout for profile details
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-14T22:22:14.000Z
- Trigger: commit
- Learning: Full-height slideout dialogs need an always-visible absolute close button on mobile; the previous sticky close control could become unreachable or unclickable in the profile detail view.
- Context: fix(dialog): keep slideout close button usable on mobile
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/ui/dialog.tsx
  - progress.md
## 2026-04-15T00:09:57.000Z
- Trigger: commit
- Learning: New registrations that already submit the full extended profile must be marked  at creation time, and admin profile-update sends should skip those completed records to avoid unnecessary outreach.
- Context: fix(profile): mark new full registrations completed
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/registrations.ts
  - src/app/api/admin/send-profile-link/route.ts
  - progress.md
## 2026-04-15T00:16:37.000Z
- Trigger: commit
- Learning: Mobile slideouts need a fixed header plus an inner scroll region using dynamic viewport height; relying on the whole dialog container to scroll can trap the bottom of long profile content.
- Context: fix(admin): make profile slideout scroll on mobile
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-15T00:18:12.000Z
- Trigger: commit
- Learning: For tall mobile slideouts, the scrollable body needs `min-h-0`, a non-growing header, and extra safe-area bottom padding or the final actions can remain unreachable even when overflow is enabled.
- Context: fix(admin): let mobile slideout reach final actions
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-15T00:31:58.000Z
- Trigger: commit
- Learning: Match notifications need explicit delivery diagnostics. The admin route should log per-recipient provider results, return a non-200 status when any recipient fails, and the dashboard should surface stored notification errors instead of only showing successful sends.
- Context: fix(matches): surface notification delivery failures
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/lib/email.ts
  - src/app/api/admin/notify-match/route.ts
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-28T18:42:20.000Z
- Trigger: commit
- Learning: Moving profile updates into the authenticated applicant dashboard removes the confusing separate profile-link path and requires the live app to use the same admin visual system and session-scoped Convex mutations.
- Context: feat(applicant): add dashboard profile editing
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/applicantProfile.ts
  - convex/_generated/api.d.ts
  - src/app/api/applicant/profile/route.ts
  - src/app/globals.css
  - src/app/layout.tsx
  - src/app/login/page.tsx
  - src/app/me/page.tsx
  - src/lib/convex.ts
  - progress.md
## 2026-04-15T02:00:33.000Z
- Trigger: commit
- Learning: All outbound email in Taaruf must use the single verified sender `contact@1plus1match.com`; allowing fallback to the old taarufusa.com sender causes delivery failures for match notifications.
- Context: fix(email): use contact@1plus1match.com sender
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/lib/email.ts
  - progress.md
## 2026-04-15T02:53:07.000Z
- Trigger: commit
- Learning: In the admin profile slideout, inbound interests should show the sender's rank for that recipient, and interest cards should be navigable so admins can jump directly into the related applicant profile without closing and searching again.
- Context: feat(admin): improve profile interest navigation
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-15T03:13:21.000Z
- Trigger: commit
- Learning: Applicants need an optional free-text field to submit interest notes directly from their profile or registration flow, and admins need to see that stored field in profile details without making it part of required profile completion.
- Context: feat(profile): add optional interest submission field
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/schema.ts
  - convex/registrations.ts
  - src/app/api/create-checkout-session/route.ts
  - src/app/api/profile/[token]/route.ts
  - src/components/profile-completion-form.tsx
  - src/components/registration-form.tsx
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-15T03:15:33.000Z
- Trigger: commit
- Learning: The profile update interest prompt should explicitly reference prior events and ask for participant number or name so applicants know exactly what kind of follow-up information to provide.
- Context: copy(profile): clarify prior-event interest prompt
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/profile-completion-form.tsx
  - progress.md
## 2026-04-15T03:29:39.000Z
- Trigger: commit
- Learning: The optional registration interest prompt should reference prior workshop attendance and reassure female participants that their interests are never shared, so the purpose and privacy boundary are both explicit.
- Context: copy(registration): clarify workshop interest prompt
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/registration-form.tsx
  - progress.md
## 2026-04-15T03:35:11.000Z
- Trigger: commit
- Learning: The incomplete-profile reminder email should clearly state that introductions and interest review cannot move forward until profile completion, and it should mention that applicants can now submit prior-event interests directly in the update form.
- Context: copy(email): refresh profile completion reminder
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/lib/email.ts
  - progress.md
## 2026-04-15T16:15:42.000Z
- Trigger: commit
- Learning: Interest tracking needs a separate admin-facing status layer (`pending`, `requested`, `declined`, `matched`) that stays clearly visible and editable in the dashboard without replacing the existing internal workflow states used for reconciliation and conversion.
- Context: feat(interests): add admin-facing status tracking
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/schema.ts
  - convex/interests.ts
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-15T16:32:41.000Z
- Trigger: commit
- Learning: Interest records need dedicated editable notes in the dashboard so admins can capture decline reasons, outreach details, and next steps directly on the interest itself rather than burying that context elsewhere.
- Context: feat(interests): add editable notes
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/interests.ts
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-15T17:44:00.000Z
- Trigger: commit
- Learning: A schema placeholder is not the same as a usable feature. For profile sharing, admins need an end-to-end flow in the dashboard plus a secure share page, otherwise the capability is effectively invisible.
- Context: feat(profile-shares): add admin share flow
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/profileShares.ts
  - src/app/api/admin/create-profile-share/route.ts
  - src/app/api/share/[token]/route.ts
  - src/app/share/[token]/page.tsx
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-16T02:07:37.000Z
- Trigger: commit
- Learning: Shared profile links should minimize identity exposure by default. For privacy-sensitive review flows, omit direct identifiers like the person's name unless explicitly required.
- Context: fix(profile-shares): hide shared profile name
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/app/api/share/[token]/route.ts
  - src/app/share/[token]/page.tsx
  - progress.md
## 2026-04-16T02:16:33.000Z
- Trigger: commit
- Learning: Saving an interest submission as plain profile text is not enough. When the user supplies a participant number or exact name in profile update, the system should create a corresponding outbound interest record so admin views stay operationally correct.
- Context: fix(profile): sync submitted interests to outbound records
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/registrations.ts
  - progress.md
## 2026-04-16T03:05:59.000Z
- Trigger: commit
- Learning: The profile slideout must make interest status obvious at a glance. Inbound and outbound items need prominent status badges there, not only in the main interest-tracking view.
- Context: feat(admin): clarify profile interest statuses
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-16T14:24:25.000Z
- Trigger: commit
- Learning: Historical free-text interest submissions need audit and backfill tooling because once the product starts creating real outbound interests on save, older profile records may still lag behind until repaired.
- Context: chore(scripts): add interest submission audit helpers
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - scripts/check_unlogged_interest_submissions.js
  - scripts/backfill_interest_submissions.js
  - progress.md
## 2026-04-16T18:52:43.000Z
- Trigger: commit
- Learning: The registrations homepage needs both approval-status and gender filters available together. Removing one makes day-to-day admin triage slower and harder.
- Context: fix(admin): restore registration gender filter
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-17T02:03:22.000Z
- Trigger: commit
- Learning: Mobile users should not need to manually highlight long URLs inside readonly inputs. Admin-generated share links need explicit copy/open actions to work reliably on phones.
- Context: fix(admin): add mobile-friendly profile share actions
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-18T23:00:58.000Z
- Trigger: commit
- Learning: Registrations need profile-completion status filtering alongside gender and approval filters so admins can quickly isolate completed or in-progress profiles without manual scanning.
- Context: feat(admin): add profile status filter
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-19T15:57:10.000Z
- Trigger: commit
- Learning: Profile-to-profile navigation inside the slideout needs explicit history state. Simply swapping the selected profile id can close the current dialog instead of behaving like in-place navigation.
- Context: fix(admin): restore profile navigation between interests
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-20T01:28:48.000Z
- Trigger: commit
- Learning: Previous-event interests are much more reliable when collected as structured applicant numbers instead of free text. That lets the backend create outbound interests deterministically and avoids fragile parsing.
- Context: feat(profile): use applicant number fields for prior interests
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/schema.ts
  - convex/registrations.ts
  - src/app/api/profile/[token]/route.ts
  - src/components/profile-completion-form.tsx
  - progress.md
## 2026-04-20T01:31:12.000Z
- Trigger: commit
- Learning: Interest cleanup needs an explicit admin delete path. Otherwise stale or mistaken interests linger in the queue and create noise for matching decisions.
- Context: feat(interests): allow admin deletion
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/interests.ts
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-20T01:34:50.000Z
- Trigger: commit
- Learning: Browser image support is not enough for community uploads. HEIC/HEIF needs conversion to a web-safe format at upload time, and unsupported formats need clear user-facing errors.
- Context: feat(images): support heic uploads with validation
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - package.json
  - package-lock.json
  - src/lib/image-upload.ts
  - src/components/registration-form.tsx
  - src/components/profile-completion-form.tsx
  - progress.md
## 2026-04-20T01:43:08.000Z
- Trigger: commit
- Learning: Orphaned interest records can survive after related registrations are gone. The admin dashboard should hide those broken rows instead of rendering confusing "Unknown" pairs.
- Context: fix(admin): hide orphaned interests in dashboard
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-20T01:48:33.000Z
- Trigger: commit
- Learning: Applicants sometimes need to pass context directly to organizers outside the structured profile fields. A dedicated applicant-to-admin note field in the profile flow is better than overloading admin-only notes.
- Context: feat(profile): add applicant notes to admin
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/schema.ts
  - convex/registrations.ts
  - src/app/api/profile/[token]/route.ts
  - src/components/profile-completion-form.tsx
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-23T02:42:41.000Z
- Trigger: commit
- Learning: The interests queue works better when admins can reason about a pair once, jump straight into either profile, and immediately see if either applicant is already requested or matched elsewhere.
- Context: feat(admin): improve interest queue triage
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin-dashboard.tsx
  - progress.md
## 2026-04-28T17:18:04.000Z
- Trigger: commit
- Learning: Starting the applicant-facing interest flow from the existing number-submission and interest-rule foundation should reduce conflict with the admin-mediated setup while still adding login, status visibility, and gender-specific privacy.
- Context: implementation start: applicant interest management flow
- Branch: codex/admin-icons-profile-photos
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - progress.md
## 2026-04-28T17:27:58.000Z
- Trigger: commit
- Learning: The applicant portal can ship incrementally by using hashed magic-link sessions and the existing interest records, while a separate `interestFlows` table carries applicant-facing decisions without disrupting the current admin queue.
- Context: feat(applicant): add interest portal foundation
- Branch: codex/admin-icons-profile-photos
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/schema.ts
  - convex/applicantAuth.ts
  - convex/applicantInterests.ts
  - convex/interestRules.ts
  - convex/interests.test.ts
  - src/app/api/applicant/login/route.ts
  - src/app/api/applicant/login/verify/route.ts
  - src/app/api/applicant/logout/route.ts
  - src/app/api/applicant/me/route.ts
  - src/app/api/applicant/interests/route.ts
  - src/app/login/page.tsx
  - src/app/me/page.tsx
  - src/lib/applicant-session.ts
  - src/lib/email.ts
  - progress.md
## 2026-05-12T16:34:03.000Z
- Trigger: commit
- Learning: Admins need interest visibility directly inside the applicant profile drawer, not just in the interests tab. A compact snapshot plus inbound/outbound cards reduces tab switching during review.
- Context: feat(admin): surface interest statuses in profile drawer
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/admin/profiles/profile-detail.tsx
  - progress.md
## 2026-05-17T01:01:54.350Z
- Trigger: meeting follow-up
- Learning: The 2026-05-15 meeting tasks need to be split into small approval-ready cards, each with an explicit e2e acceptance check, before implementation starts.
- Context: public kanban board for 15-05-26 meeting notes
- Branch: main
- Actor: Codex
- Changed Paths:
  - src/app/kanban/15-05-26/page.tsx
  - src/app/kanban/15-05-26/tasks.ts
  - e2e/kanban.spec.ts
  - playwright.config.ts
  - package.json
  - package-lock.json
  - progress.md
## 2026-05-20T00:00:00.000Z
- Trigger: applicant feedback on /register/May26
- Learning: Event titles that embed the event code ("May26 Pre-Mariage Workshop") create a confusing duplicate date next to the formatted start/end range. Stripping the eventCode prefix at render time keeps admin-set titles intact while showing a single authoritative date on the public page. Also: the /register page lacked a clear "I'm already in the program" path, and the checkout endpoint happily started a Stripe session for an already-registered email instead of redirecting them to login.
- Context: feat(register): add sign-in link, block duplicate emails before checkout, clean event-title date duplication
- Branch: main
- Actor: Moe Ghashim <moe@bannaa.co>
- Changed Paths:
  - convex/registrations.ts
  - src/app/api/create-checkout-session/route.ts
  - src/app/register/[eventCode]/page.tsx
  - src/components/registration-form.tsx
  - progress.md
## 2026-05-20T01:00:00.000Z
- Trigger: applicant-number stability concern
- Learning: Applicant numbers are permanent IDs that should never be re-issued, even when a registration is deleted. The previous `nextApplicantNumber` derived the next value from the live max only, so deleting the most recent registration would have given that number to the next sign-up. Switched to a monotonic high-water-mark persisted in the `settings` table (key `applicantNumberHighWaterMark`); the helper still scans live registrations defensively to recover from any out-of-band insert, but the counter can only move forward. Added a registrations test file pinning the invariant.
- Context: feat(registrations): permanent applicant numbers backed by a persistent HWM counter
- Branch: main
- Actor: Moe Ghashim <moe@bannaa.co>
- Changed Paths:
  - convex/registrations.ts
  - convex/registrations.test.ts
  - progress.md
## 2026-05-20T02:00:00.000Z
- Trigger: make the applicant-number invariant unmissable for future agents
- Learning: A correct implementation isn't enough — future agents (and humans) need to see the rule before they touch the code. Surfaced the invariant in three reinforcing places: a top-level "Invariants — do not break" section in AGENTS.md, a comment on the `applicantNumber` field in the schema, and a header comment on convex/registrations.ts. Also added a defensive `by_applicantNumber` collision check inside `nextApplicantNumber` so any future regression that lets the counter drift throws at the DB boundary instead of inserting a duplicate.
- Context: docs+enforce(registrations): make applicant-number invariant visible to agents and enforced at DB boundary
- Branch: main
- Actor: Moe Ghashim <moe@bannaa.co>
- Changed Paths:
  - AGENTS.md
  - convex/registrations.ts
  - convex/schema.ts
  - progress.md
## 2026-05-20T03:00:00.000Z
- Trigger: deploy backlog + standing authorization request from user
- Learning: The Convex deployment names are inverted from what's intuitive: `clever-meerkat-940` is set as `CONVEX_DEPLOYMENT` and labeled "dev" in `.env.local` but is actually the deployment serving `www.1plus1match.com` (it has all the real applicants). `tidy-panda-370` is labeled "prod" but currently holds only a single MIGRATION_TEST row. Both should always be kept in lockstep with `main`. Pushed both, smoke-tested the new `registrations:getByEmail` query against prod, and codified the user's standing "don't ask before deploying Convex" authorization in AGENTS.md plus a feedback memory.
- Context: deploy+docs(convex): push outstanding changes to both deployments and document auto-deploy rule
- Branch: main
- Actor: Moe Ghashim <moe@bannaa.co>
- Changed Paths:
  - AGENTS.md
  - progress.md

## 2026-05-29T18:45:12.000Z
- Trigger: deploy
- Learning: Event seat approval and attendance confirmation must be modeled as separate axes. eventRegistrations.registrationStatus now tracks only seat/admin state (approved, pending, rejected, withdrawn), while confirmationStatus tracks situational attendance confirmation (confirmed, not_confirmed, cancelled). Self-registration confirms automatically; waitlist/admin carryover grants a seat without confirmation.
- Context: separate event approval status from confirmation status
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - convex/schema.ts
  - convex/events.ts
  - convex/eventRules.ts
  - convex/registrations.ts
  - convex/events.test.ts
  - convex/interests.test.ts
  - src/components/admin/events/events-page-client.tsx
  - src/components/admin/primitives/status-pill.tsx
  - src/app/me/page.tsx
  - src/app/api/applicant/events/route.ts
  - src/lib/email.ts
  - progress.md


## 2026-10-15
- Recorded approval workflow in AGENTS.md: issue approval -> implementation and preview; preview approval -> live deployment. Live Convex deployments are gated too.
- Isolated #15/#16 release under .worktrees/release-15-16; 53 tests and TypeScript pass without unrelated local edits.

## 2026-10-20
- Implemented approved issue fixes in isolated tree: attendance/interest privacy, workflow clarity/contact sharing, approval reversal, metrics, degree options, photo diagnostics; added regression tests and preview isolation safeguards. No live deployment.

## 2026-10-20
- Issue 37 local-only: aligned check-in sources, first-name verification, three event-scoped submission slots, bypass guard, synthetic race/browser tests; see docs/issue-37-local-review.md.

## 2026-10-20
- Issue #38 supersedes #30: Events approved+attended sender-only gate; retired separate writer/UI without deleting history, added cookie bridge and tests. Combined #37/#38 review in docs/issue-38-local-review.md. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-10-20
- PR #39 preview build: declared and locked @playwright/test in package.json/package-lock.json; missing dependency was masked by shared local node_modules. Updated review documentation. 77 tests and isolated-URL production build pass; no backend/config changes. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-10-21
- Local event-only waitlist implementation: shared gender-capacity/FIFO helper, authenticated explicit event approval bridge, checkout/admin/portal queue handling, removed profile waitlist views, additive legacy compatibility only; tests and migration decision gate documented in docs/event-only-waitlists-review.md. No live changes.

- Parent audit correction: 23 existing eventWaitlistEntries (16 Approved/6 Pending profile links + 1 orphan), zero global/event waitlisted statuses. Removed unnecessary global schema widening; old records remain read-only/event-visible with orphan IDs; no Pending migration or profile changes. Staged queue compatibility documented.

## 2026-10-23
- Added persisted-status event receipt helper, portal/checkout/webhook/payment-repair integration, warm manual approval copy and 26 mocked tests; vitest config includes source tests. Backend retry/session-link follow-ups in docs/signup-receipt-review.md. No emails/deploys. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-03
- Removed remaining gender availability numbers from homepage rendering, preserving open/waitlist labels and admin counts; added public-render regression coverage and JSX test transform. Preview approval required before production. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-03
- Repair inert admin New match control with guarded suggestion creation, synthetic regression tests, and same-page selection; production remains preview-gated.

- Verified New match against real loopback Convex + Next + desktop/mobile browsers; fixed browser-facing origin validation and proved live backend source parity.

- Addressed independent auth review and added standalone-suggestion consent regression.

## 2026-11-04
- Correct New Match service credential mismatch; prove actual submit through both side-by-side requirements with isolated production-like credentials.

## 2026-11-06
- Integrate scoped PR55 on live 784bb73 with reactive eligibility and stale/cancellation safety; provenance recorded in docs/pr55-scoped-release.md. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-06
- Issue58: added recipient-specific submission photo choice, owner revocation, atomic retry behavior, UI and 261-test validation on isolated ac5db90 lineage. Actual synthetic backend/browser passed portal behavior; independent review found inherited authorization blockers, so draft only and no live deployment.
- Added explicit authenticated per-submission test reset, retained audit and quota indexes, stale-action/share guards, safe deletion feedback and backend/bridge regressions; preview-only, no live data reset. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-08
- Resumed issue58 on current PR60/PR63 lineage; added authenticated server transport, backend authorization, durable photo ownership and atomic consent-aware URL reads. Preserved reset implementations and data; isolated347-test gate and final review/runtime validation, no live deployment pending operational decisions.

## 2026-11-08
- Issue #64: isolated female website-flow implementation from PR61 candidate; excluded synthetic runtime artifacts from Git and TypeScript compilation. No live deployment.

## 2026-11-08
- Extended issue #64 final contact approval to male and reciprocal flows with shared durable outbox, authenticated admin release, reciprocal consent synchronization, truthful UI, and synthetic coverage; no live operations.
- Prepared centralized monotonic capability cutoff and authenticated recovery in convex auth/profile/share/settings paths; integrated explicit saved Yes/No editors, tests and release documentation. No production activation. <!-- project: github.com/moeghashim/clawscrewskill -->
## 2026-11-09
- Reconciled event participant profile drawer onto source-hash-verified production 9987fcc; preserved live API bridges/capacity behavior, fixed clean-editor remote-note synchronization, and added synthetic regression tests/provenance documentation. Production held for composition review.

- Locally integrated exact PR61/65 provenance with live PR78 drawer; retained authenticated admin transport and PR65 interest presentation. New conflict resolution requires independent review and certification; no publication. <!-- project: github.com/moeghashim/clawscrewskill -->

- Adapted PR78 synthetic regression fixture to exercise the unchanged authenticated admin transport, added unauthenticated backend denial assertions, and validated drawer interactions at desktop/mobile widths. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Extracted PR #77 display-only confirmation badge removal and synthetic browser regression tests from aa7caabb553bfdf72d0d6e92e2ed9c243475a2a5 onto verified live 26accc9ef8d39ad7120b7347fe412e86eb144d3c. Preserves live PR61/65, drawer, reset helper and all backend behavior; no production deployment.

- Omar2865/2870: remove repeated photo question, snapshot saved profile permission only for new interests, preserve historical recipient grants/denials/revocations, and extend synthetic tests. Production/recovery remain held. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Ported issue67 event-registration filter onto verified PR84 live ancestry; preserved ethnicity/photo/reset protections. Added authenticated paginated event catalog/membership, deduplication, combined filters, retry states and tests. No live deployment.

- Replace recursive audit copies with complete-row SHA256 references in singleInterestTestReset; retain original history and drift/idempotency guards. Add size/repeated-reset regressions; 705 tests, typecheck, lint and isolated real-backend rollback proof pass. No production deploy. <!-- project: github.com/moeghashim/clawscrewskill -->

- Added fixed-ID admin-only #219↔#220 reset with confirmation, atomic audited preview, access retirement and pair-only quota restoration. 708 tests, build/typecheck/lint and isolated runtime repeated normal submissions in both directions plus mobile/desktop endpoint proof pass. No production changes. <!-- project: github.com/moeghashim/clawscrewskill -->

- Clarified sister initial interest success with exact user3021 admin-review copy; preserved all other action outcomes and added polite atomic status. Added 24 mocked browser regressions (1440/390/320px); 708 unit tests, typecheck, build and independent review pass. No backend/workflow or production changes. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Added prominent applicant review invitations and a deduplicated brother-review email stage in the existing outbox, with synthetic provider/browser regressions; preview-only, no live deployment or email.

- PR91 release3068: merge the src alias into convex/tsconfig.json for API bridge test typechecking; all existing compiler settings preserved. Convex/root typechecks, 731 tests and enabled-typecheck backend dry-run pass; 51 candidate runtime modules byte-identical before/after repair, 50 live modules unchanged. Independent review approved. Fresh exact-SHA DCO certification required before deployment; no production/config/email changes. <!-- project: github.com/moeghashim/clawscrewskill -->

- Task3043: event ribbon, explicit provenance normalization, separate No recorded event, complete paginated workbench reads, stale-selection clearing and scoped detail actions; added unit/browser regressions and workflow documentation. Preview-only; global gates and prior reset/copy/email behavior preserved. <!-- project: github.com/moeghashim/clawscrewskill -->

- Profile3052/3055: unified review Age facts, explicit full-text Requirements and responsive uncropped photos; frontend-only atop verified live PR92. Independent static review and 735 tests/root+Convex types/Turbopack build pass. Browser harness initially sampled lazy images before decode; corrected test waits, no application fix. Screenshot visual-inspection tool denied project paths; computed-layout and saved screenshots available. No production/data/email/config changes. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Clarify sister final-approval notice in female-reviews.tsx using the existing prominent invitation style; add scoped wrapping CSS and synthetic 320/390/1280 consent/navigation/stale-state regression coverage. No backend or workflow changes.
- Request3176: ported education editing, shared options and validation from PR42 onto verified PR93 live baseline; preserved capability/image security and added synthetic persistence/API/browser coverage. Preview only; no live writes.
- Event capacity controls: allow lowering caps without changing existing registrations, add explicit authenticated one-person waitlist force-to-Pending with warning, preserve ordinary capacity/FIFO/auth rules. Added backend and bridge regressions; 744 tests, root/Convex types, scoped lint, production build and real synthetic local-backend/browser checks pass. Preview-only; no live cap/data/deployment changes. <!-- project: github.com/moeghashim/clawscrewskill -->
- Independent capacity review follow-up: preserve save feedback across data refresh; explicitly explain and test mixed decrease/increase all-row preservation, both genders and expired reservations. No backend behavioral change from reviewed implementation. <!-- project: github.com/moeghashim/clawscrewskill -->

- Contacts-ready3218: preserve latest serving ffe260e ancestry; show both portals a prominent notice only after authorized detail GET returns permitted contact fields; focus reauthorized details CTA, fail closed, add six synthetic responsive/privacy/pagination tests. No backend/config/email/production changes. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Integrated authorized contact notice c14e265 and scoped focus-click e154e8c onto serving ffe260e in female-reviews.tsx; preserved contact gates and revalidation geometry, added stale-response/pending-POST browser coverage. No backend/config/email/live changes.
## 2026-11-10
- Add separately gated future-only sister final-approval email, recipient/acceptance freshness checks and synthetic tests; no production send, activation or deployment.

## 2026-11-10
- Added narrowly scoped combined brother/sister notification mode with independent cutoffs, stale recipient/sender retry cancellation, coexistence/security tests and activation checklist; no production changes.
## 2026-11-10
- Restore workbench New match as private Save draft; block draft bearer disclosure/notifications and availability reservation; preserve legacy contact-release provenance. Synthetic regression/browser checks; preview-only, no live deployment.

## 2026-11-10
- Implemented issue97 background matchmaking in convex lifecycle/schema, applicant tab/API, admin Present/release/followups and dedicated gated notification sender; added privacy/withdrawal/idempotency/race/mobile regression coverage. Preview only; no live backend/data/email changes.
## 2026-11-10
- Issue #46 isolated preview: private birthdays, owner profile editing, current-age projections/clock and privacy/legacy/eligibility tests; no live deployment. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Split applicant portal into four history-aware views; preserve forms/actions, legacy destinations and DOB privacy; add synthetic navigation/action coverage. <!-- project: github.com/moeghashim/clawscrewskill -->
- Applied Layla3403 DOB records/privacy copy and aligned six profile basics in one responsive grid; no required-field or age-validation changes. <!-- project: github.com/moeghashim/clawscrewskill -->
- Added isolated whole-profile rejection-notice transactional outbox, protected opt-in activation, immutable retries/reconciliation, synthetic tests, admin explanation and release documentation; no live activation.
- Restrict applicant event logistics using current profile eligibility; retain status-only history, hide stale portal details on refresh, and add synthetic API/browser tests. No public-site, notification, live-data or deployment changes.
- Combined rejection notice and logistics candidate: preserved lifetime dedup policy; hardened non-JSON rate-limit handling and synthetic browser external-origin blocking after independent review. Preview only, no activation or live deployment.

## 2026-11-10
- Added durable 15-minute rejection-notice grace and safe unsent re-rejection reset, authenticated admin status/reversal feedback, fake-clock/concurrency/legacy tests and synthetic browser coverage; preserved email text, bounded idempotent retries and live activation gate.

## 2026-11-10
- Completed isolated joined Chromium/real Next routes/real convex-test functions rejection E2E; retained evidence/joined harness and local-joined-result.md, no production code/config/sender changes. <!-- project: github.com/moeghashim/clawscrewskill -->

- Integrated confirmed Layla3350 grace policy additively; reran890 unit tests, joined real-route/function browser E2E,9 synthetic browser cases, types/lint/build; independent review PASS. No real mail/data/config/deploy changes. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Prepared rejection3391 additive release above feature97 and corrected birthday28b8aed; full1021 tests/types/lint/build plus9 synthetic browser and joined route gates passed; dedicated sender variables absent; production untouched pending parent slot. <!-- project: github.com/moeghashim/clawscrewskill -->

## 2026-11-10
- Applicant copy3395: removed internal draft explanation; kept match presentation guidance. No admin draft behavior change.
