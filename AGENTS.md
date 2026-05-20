<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Invariants — do not break

### Applicant numbers are permanent and never reused

`registrations.applicantNumber` is a permanent public identifier. Once a registration is created and a number is assigned, that number must never change and must never be reissued to any other registration — not even if the original registration is deleted.

How this is enforced:

- **Issuance.** Only [convex/registrations.ts](convex/registrations.ts)'s `nextApplicantNumber` helper allocates new numbers. It reads a monotonic high-water-mark from the `settings` table (key `applicantNumberHighWaterMark`), takes `max(persistedHwm, liveMax) + 1`, and patches the HWM in the same mutation. The counter only moves up.
- **Deletion.** `deleteRegistration` deliberately leaves the HWM untouched. A deleted applicant's number is permanently retired.
- **Immutability.** No mutation should ever patch `applicantNumber` on an existing row. The `create` mutation is the only production code path that writes it.
- **Tests.** See [convex/registrations.test.ts](convex/registrations.test.ts). Do not weaken these — if you need to evolve the rule, talk to the user first.

If you are about to: introduce an admin endpoint that edits `applicantNumber`, recompute numbers from scratch, "fix gaps" left by deletions, or migrate the field — **stop and ask**. Those are all violations of this invariant.

### Email uniqueness on registration

Emails on `registrations` are unique. The checkout API and the `create` mutation both reject a second registration with the same email (case-insensitive trim). The applicant-facing flow surfaces this with a sign-in link rather than a generic error.
