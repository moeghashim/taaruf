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
