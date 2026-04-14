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
