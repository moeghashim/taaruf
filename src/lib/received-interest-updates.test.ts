import { describe, expect, it } from "vitest";
import { receivedInterestUpdates, approvedCopy, type InterestNoticeInput, type ReviewNoticeInput } from "./received-interest-updates";
const interest = (id = "same"): InterestNoticeInput => ({ interestId: id, direction: "inbound", status: "active", flowStatus: "in_review", canRespond: false, canFinalApprove: false, ownFinalApproval: "pending", contactSharedAt: null, counterparty: {} });
const review = (role = "brother"): ReviewNoticeInput => ({ interestId: "same", role, state: "in_review", ownAction: "review", canView: true });
describe("authoritative received interest ribbon", () => {
  for (const role of ["brother", "sister"]) it("deduplicates actual interest identity for " + role, () => {
    const notices = receivedInterestUpdates([interest(), interest()], [review(role)]);
    expect(notices).toHaveLength(1); expect(notices[0].copy).toBe("This connection is awaiting your review.");
    expect(notices[0].href).toBe("/me?femaleReview=same#inbound-interests");
    expect(notices[0].heading).toBe(role === "brother" ? "You Have Received An Interest" : "Your review is needed");
  });
  it("retains distinct event interests even with identical counterpart data", () => {
    expect(receivedInterestUpdates([interest(), interest("other-event")], [review()])).toHaveLength(2);
  });
  it("prioritizes initial then final response", () => {
    expect(receivedInterestUpdates([{ ...interest(), canRespond: true }], [])[0].heading).toBe("You Have Received An Interest");
    expect(receivedInterestUpdates([{ ...interest(), canFinalApprove: true }], [])[0].heading).toBe("Your review is needed");
    expect(receivedInterestUpdates([{ ...interest(), ownFinalApproval: "approved" }], [])[0].copy).toBe(approvedCopy);
  });
  it("transitions review to approval to verified contacts to neutral closure", () => {
    const approved = { ...review(), ownAction: null, ownDecision: "approved" };
    expect(receivedInterestUpdates([interest()], [approved])[0].copy).toBe(approvedCopy);
    const released = { ...approved, state: "contacts_released" };
    expect(receivedInterestUpdates([], [released])[0].heading).not.toBe("Contacts are ready");
    expect(receivedInterestUpdates([], [released], ["same"])[0].heading).toBe("Contacts are ready");
    const closed = receivedInterestUpdates([interest()], [{ ...released, state: "closed", ownAction: "review" }], ["same"])[0];
    expect(closed.heading).toBe("Connection closed"); expect(closed.href).toBeUndefined();
  });
  it("does not resurrect paused or expired reviews", () => {
    expect(receivedInterestUpdates([], [{ ...review(), paused: true }])[0].heading).toBe("Connection paused");
    expect(receivedInterestUpdates([], [{ ...review(), reviewExpired: true }])[0].href).toBeUndefined();
  });
});

describe("sent interest heading", () => {
  const sent = { ...interest("sent"), direction: "outbound" };
  it("changes only the generic outgoing heading, not body or button", () => {
    const inbound = receivedInterestUpdates([interest("sent")], [])[0];
    const outbound = receivedInterestUpdates([sent], [])[0];
    expect(outbound).toEqual({ ...inbound, heading: "You Have Sent an Interest", href: "/me?connection=sent#outbound-interests" });
    expect(receivedInterestUpdates([{ ...sent, direction: "private" }], [])[0].heading).toBe("Interest update");
  });
  it("keeps mixed and multiple connections directionally accurate", () => {
    const notices = receivedInterestUpdates([sent, { ...sent, interestId: "sent2" }, { ...interest("received"), canRespond: true }], []);
    expect(notices.map(item => item.heading)).toEqual(["You Have Received An Interest", "You Have Sent an Interest", "You Have Sent an Interest"]);
  });
  for (const [patch, heading] of [
    [{ canFinalApprove: true }, "Your review is needed"],
    [{ canRespond: true }, "You Have Received An Interest"],
    [{ paused: true }, "Connection paused"],
    [{ contactSharedAt: 1, counterparty: { email: "synthetic@example.test" } }, "Contacts are ready"],
    ...["closed", "declined", "withdrawn", "revoked", "expired"].map(status => [{ status }, "Connection closed"]),
  ] as [Partial<InterestNoticeInput>, string][]) it("preserves lifecycle heading " + JSON.stringify(patch), () => {
    expect(receivedInterestUpdates([{ ...sent, ...patch }], [])[0].heading).toBe(heading);
  });
  it("preserves workflow authority rather than infer direction from portal gender", () => {
    for (const role of ["brother", "sister"]) {
      const workflow = { ...review(role), interestId: "sent" };
      expect(receivedInterestUpdates([sent], [workflow])).toEqual(receivedInterestUpdates([], [workflow]));
      expect(receivedInterestUpdates([sent], [{ ...workflow, ownAction: null }])[0].heading).toBe("Interest update");
    }
  });
});
