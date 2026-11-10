# Archive deployment audit — 2026-11-09 20:32 CST

Status: blocked before deployment. No production writes, emails, environment changes, guard changes, or real participant actions. Dirty root preserved. Isolated branch release/archive-live-20261109 starts at bc2bdda61ba1ee0833b12edf3a217dd0812a5394.

## Fresh provenance
Authoritative Vercel alias GET /v4/aliases/www.1plus1match.com identifies dpl_H2Rdjmt6h5nuMRiWZu3VxLs7uMj3, taaruf-4dnzkpit8-bannaa.vercel.app. Deployment API reports READY and bc2bdda. All 219 uploaded source files match git-show bytes by SHA1, zero mismatches. Source subtree only; generated output excluded. Initial comparison incorrectly included generated out/ entries and an empty directory, corrected before drawing conclusions.

Explicit clever-meerkat-940 read-only get_config_hashes at 2026-11-10T02:32:10.248Z matches prior exact baseline3384656 bundle: 35/35 modules, changed=[], remoteOnly=[]. Backend provenance is verified, and differs materially from the frontend checkout: deploying its convex/ directory would remove pairTestReset, reset audit schema and read-only guards. Preserve those functions and fields in any eventual composition.

## Concrete release gate
Fresh GitHub PR76 exact b3ad2cdfbfc027e0064754fe1fd400fead3722b5 check-runs: DCO action_required (CLI fail), missing signoffs for1912cf3d2c44411c3eed58d20c81803f64d26f57 and b3ad2cdfbfc027e0064754fe1fd400fead3722b5. Existing PR76 release instructions require archive-specific truthful certification and explicitly say PR61/65 certification does not cover these commits. Deployment authorization is not a legal DCO certification. Do not bypass by direct CLI deployment, synthetic signoff, or squashing unsigned source into a new release. An authorized human must supply archive-specific certification/remediation under the already-enabled append-only DCO policy. No branch protection exists on main per API404, but that does not negate the explicit release gate or authorize bypass.

## Scope findings for resumed work
PR71 is just a filter stacked on older unauthenticated PR54; do not merge that base. PR76 includes the filter but NO unarchive operation. Its archive transaction closes active matches/interests/flows/shares, withdraws upcoming event registrations, removes waitlist entries and invokes same-event/gender FIFO promotion. It retains history/payment receipts; no automatic refund; in-flight provider sends and issued storage URLs cannot be recalled. Therefore it is not an implementation of requested reversible archive/unarchive without unintended promotions. Unarchive and explicit restoration semantics need scoped implementation/tests, not a claim that PR76 already supplies them.

PR76 also depends on PR61 authenticated bridge/capability infrastructure, which is NOT deployed in the verified35-module backend. Do not import unrelated PR65 workflow. Safe eventual composition must keep frontend bc2bdda event participant drawer, backend3384656 reset protections, add only required compatible auth/archive guards, and test authenticated archive/unarchive/history/queue/no-send behavior synthetically before coordinated deployment. Existing PR76 test counts are historical evidence only, not rerun or newly accepted. No tests/build/browser suite claimed for an implementation that has not been composed.

Raw metadata and comparison evidence stays untracked beside this audit (live-alias.json, live-deployment.json, live-files.json, frontend-parity.json, backend-parity.json, rollback-module-hashes.json). No credentials are included in this audit.
