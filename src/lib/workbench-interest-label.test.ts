import { expect, test } from "vitest";
import { conciseWorkbenchStatus as status, workbenchInterestLabel as label } from "./workbench-interest-label";
for (const actor of ["brother", "sister", "both"]) {
  test("final actor " + actor, () => expect(status(`Waiting on ${actor} #12 — Final approval (sister approved)`)).toBe(`Final approval | Waiting on ${actor}`));
  if (actor !== "both") test("initial actor " + actor, () => expect(status(`Waiting on ${actor} #12 — Initial bio decision`)).toBe(`Initial bio review | Waiting on ${actor}`));
}
test("actual direction and authorized names, not gender ordering", () => {
 const fromRegistration = {name:"Amina",publicApplicantNumber:215}, toRegistration = {name:"Omar",publicApplicantNumber:227};
 expect(label({fromRegistration,toRegistration,workbenchReview:{label:"Waiting on brother #227 — Final approval (sister approved)"}})).toBe("#215 Amina → #227 Omar | Final approval | Waiting on brother");
 expect(label({fromRegistration:toRegistration,toRegistration:fromRegistration})).toMatch(/^#227 Omar → #215 Amina/);
});
test("missing and long names remain honest and complete", () => {
 expect(label({fromRegistration:{name:" ",publicApplicantNumber:1}})).toMatch(/^#1 Name unavailable → #\? Name unavailable/);
 const name="Longname ".repeat(40).trim(); expect(label({fromRegistration:{name,publicApplicantNumber:1}})).toContain(name);
});
for(const [input,output] of [
 ["Closed — Interest withdrawn","Closed | No action"],
 ["Paused — Linked match paused","Paused | Admin action: review paused match"],
 ["Contacts released — brother #1 and sister #2","Contacts released | No action"],
 ["Admin action — Review and release contacts (both final approvals saved)","Both finals approved | Admin action: review and release contacts"],
 ["Admin check — Both final approvals saved; linked match missing","Review needed | Admin check: Both final approvals saved; linked match missing"],
 ["Admin check — Legacy final approval lacks explicit provenance; Waiting on both — Final approval", "Final approval unverified | Admin check: verify approval history"],
 ["Queued — brother #1 has another active match; Waiting on both — Final approval", "Queued · Blocked by active match | Admin action: review active match"],
 ["Deferred — Admin check — Queue/defer blocker not recorded; Waiting on both — Final approval", "Deferred · Review needed | Admin check: verify queue status"],
 ["Admin action — Share sister #2’s profile for review", "Initial bio review | Admin action: share sister #2’s profile"],
] as const) test(input,()=>expect(status(input)).toBe(output));

test("active match remains explicit alongside provenance and stale pointers",()=>{
 expect(status("Blocked — brother #1 has another active match; Admin check — Legacy final approval lacks explicit provenance; Waiting on both — Final approval")).toBe("Blocked by active match | Admin action: review active match; verify approval history");
 expect(status("Queued — sister #2 has a stale or unverified active-match pointer; brother #1 has another active match")).toBe("Queued · Blocked by active match | Admin action: review active match; verify match record");
});
test("reverse alias keeps canonical profile-sharing actor",()=>expect(label({fromRegistration:{name:"Omar",publicApplicantNumber:1},toRegistration:{name:"Amina",publicApplicantNumber:2},workbenchReview:{label:"Admin action — Share sister #2’s profile for review"}})).toBe("#1 Omar → #2 Amina | Initial bio review | Admin action: share sister #2’s profile"));
