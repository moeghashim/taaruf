<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Deployment

### Auto-deploy Convex when needed — do not ask

The user has standing authorization: **whenever a change touches anything under `convex/` (functions, schema, crons, http routes, generated `ai/` files), deploy it as part of finishing the task.** Do not stop to ask, and do not leave Convex out-of-sync with `main`.

How to deploy:

- Dev deployment (`clever-meerkat-940`, set via `CONVEX_DEPLOYMENT` in `.env.local`) — this is the deployment actually serving `www.1plus1match.com`. Push with `npx convex dev --once`.
- Prod deployment (`tidy-panda-370`) — currently effectively unused, but keep it in sync. Push with `npx convex deploy --yes` (the `--yes` skips the interactive prompt, which the agent terminal can't answer).

Order doesn't matter; do both. After deploy, smoke-test at least one of the changed functions with `npx convex run <module>:<fn> '<json-args>'` (add `--prod` for prod) so you have evidence it's live, and mention the deployment in the final summary so the user knows it landed.

The only time to pause and ask is if a deploy would run a **destructive or non-reversible data operation** — e.g. a schema change that drops a field, a migration mutation that rewrites existing rows, or a backfill that can't be undone. In that case, stop and confirm before deploying.

## Invariants — do not break

### Public applicant numbers are permanent and never reused

`registrations.publicApplicantNumber` is the permanent public identifier humans use as "Applicant #". Once a registration is created and a number is assigned, that number must never change and must never be reissued to any other registration — not even if the original registration is deleted.

How this is enforced:

- **Issuance.** Only [convex/registrations.ts](convex/registrations.ts)'s `nextPublicApplicantNumber` helper allocates new public numbers. It reads a monotonic high-water-mark from the `settings` table (key `publicApplicantNumberHighWaterMark`), takes `max(persistedHwm, liveMax, liveCount) + 1`, and patches the HWM in the same mutation. The counter only moves up.
- **Deletion.** `deleteRegistration` deliberately leaves the HWM untouched. A deleted applicant's number is permanently retired.
- **Immutability.** No mutation should ever patch `publicApplicantNumber` on an existing row after the one-time creation-order backfill. The `create` mutation is the normal production code path that writes it.
- **Legacy field.** `registrations.applicantNumber` is deprecated/internal compatibility data. Do not show it to admins or applicants as "Applicant #".
- **Tests.** See [convex/registrations.test.ts](convex/registrations.test.ts). Do not weaken these — if you need to evolve the rule, talk to the user first.

If you are about to: introduce an admin endpoint that edits `publicApplicantNumber`, recompute numbers from scratch, "fix gaps" left by deletions, or migrate the field — **stop and ask**. Those are all violations of this invariant.

### Email uniqueness on registration

Emails on `registrations` are unique. The checkout API and the `create` mutation both reject a second registration with the same email (case-insensitive trim). The applicant-facing flow surfaces this with a sign-in link rather than a generic error.
