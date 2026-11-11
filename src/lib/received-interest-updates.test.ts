import { describe, expect, it } from "vitest";
import { receivedInterestUpdates, approvedCopy, type InterestNoticeInput, type ReviewNoticeInput } from "./received-interest-updates";
const interest = (id = "same"): InterestNoticeInput => ({ interestId: id, direction: "inbound", status: "active", flowStatus: "in_review", canRespond: false, canFinalApprove: false, ownFinalApproval: "pending", contactSharedAt: null, counterparty: {} });
const review = (role = "brother"): ReviewNoticeInput => ({ interestId: "same", role, state: "in_review", ownAction: "review", canView: true });
describe("authoritative received interest ribbon", () => {
  for (const role of ["brother", "sister"]) it("deduplicates actual interest identity for " + role, () => {
    const notices = receivedInterestUpdates([interest(), interest()], [review(role)]);
    expect(notices).toHaveLength(1); expect(notices[0].copy).toBe("This connection is awaiting your review.");
    expect(notices[0].href).toBe("/dashboard?femaleReview=same");
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
