import { expect, test } from "vitest";
import { interestLifecycle, isArchivedInterest } from "./interest-lifecycle";

test.each([
  "Admin action — Share brother #44’s profile for review",
  "Waiting on sister #246 — Initial bio decision",
  "Waiting on brother #227 — Final approval (sister approved)",
  "Waiting on sister #246 — Final approval (brother approved)",
  "Waiting on both — Final approval: brother #327 and sister #222",
  "Admin action — Review and release contacts (both final approvals saved)",
  "Queued — Sister #283 has another active connection; Waiting on brother #127 — Final approval (sister approved)",
  "Admin check — Final approval provenance missing",
])("preserves canonical sentence-case projection: %s", label => {
  expect(interestLifecycle({status:"active", workbenchReview:{label}})).toBe(label);
  expect(isArchivedInterest({status:"active", workbenchReview:{label}})).toBe(false);
});
test.each(["new","active","queued","deferred"] as const)("old backend %s never invents actors", status => {
  expect(interestLifecycle({status})).toBe("Admin check — Canonical review/approval details unavailable; compatible backend required");
});
test.each(["closed","declined","withdrawn"] as const)("terminal fallback %s retained", status => {
  expect(interestLifecycle({status})).toBe(status[0].toUpperCase()+status.slice(1));
  expect(isArchivedInterest({status})).toBe(true);
});

test('paused released history retains Inbox classification independently of copy',()=>{
 const match={status:'paused',contactGate:'contacts_released'} as import('../../convex/_generated/dataModel').Doc<'matches'>;
 expect(isArchivedInterest({status:'converted_to_match',match,workbenchReview:{label:'Paused — Linked match paused'}})).toBe(false);
 expect(isArchivedInterest({status:'converted_to_match',match:{...match,status:'contact_shared'}})).toBe(true);
});
