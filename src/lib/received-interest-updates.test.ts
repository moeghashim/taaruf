import { describe, expect, it } from "vitest";
import { receivedInterestUpdates, type InterestNoticeInput, type ReviewNoticeInput } from "./received-interest-updates";
const interest = (id = "same"): InterestNoticeInput => ({ interestId: id, direction: "inbound", status: "in_progress", flowStatus: "in_progress", canRespond: false, canFinalApprove: false, ownFinalApproval: "pending", contactSharedAt: null, counterparty: {} });
const review = (role = "brother"): ReviewNoticeInput => ({ interestId: "same", role, state: "in_review", ownAction: "review", canView: true });
for (const role of ["brother", "sister"]) describe("notifications: " + role, () => {
 for (const state of ["closed","declined","rejected","withdrawn","revoked","expired","kept_open","keep_open"]) it("suppresses " + state + " despite stale actions/contacts", () => {
  const shared={...interest(),canRespond:true,contactSharedAt:1,counterparty:{email:"synthetic@example.test"}};
  expect(receivedInterestUpdates([{...shared,status:state}],[])).toEqual([]);
  expect(receivedInterestUpdates([{...shared,flowStatus:state}],[])).toEqual([]);
  expect(receivedInterestUpdates([shared],[{...review(role),state}],["same"])).toEqual([]);
 });
 it("keeps idle and own keep-open quiet without revealing counterpart decisions",()=>{
  expect(receivedInterestUpdates([interest(),{...interest("sent"),direction:"outbound"}],[])).toEqual([]);
  expect(receivedInterestUpdates([{...interest(),canRespond:true,ownInitialDecision:"keep_open"}],[])).toEqual([]);
  expect(receivedInterestUpdates([],[{...review(role),ownAction:null}])).toEqual([]);
 });
 it("does not celebrate finals or unverified/unavailable releases",()=>{
  expect(receivedInterestUpdates([{...interest(),ownFinalApproval:"approved",counterparty:{email:"synthetic@example.test"}}],[])).toEqual([]);
  for(const patch of [{state:"in_review"},{canView:false},{reviewExpired:true},{paused:true}]) expect(receivedInterestUpdates([],[{...review(role),state:"contacts_released",ownAction:null,...patch}],["same"])).toEqual([]);
  expect(receivedInterestUpdates([],[{...review(role),state:"contacts_released",ownAction:null}])).toEqual([]);
 });
 it("preserves incoming and final actions with workflow authority and exact IDs",()=>{
  const initial=receivedInterestUpdates([{...interest(),canRespond:true}],[])[0];expect(initial.heading).toBe("You Have Received An Interest");
  expect(receivedInterestUpdates([{...interest(),canFinalApprove:true}],[])[0].heading).toBe("Your review is needed");
  const final=receivedInterestUpdates([interest(),interest()],[{...review(role),ownActionStage:"final"}]);
  expect(final).toHaveLength(1);expect(final[0]).toMatchObject({heading:"Your review is needed",action:"Review profile and respond",priority:0});
  expect(final[0].href).toBe("/me?femaleReview=same#"+(role==="sister"?"outbound":"inbound")+"-interests");
  expect(JSON.stringify(final)).not.toMatch(/approved|match created/i);
 });
 it("targets single and multiple authorized matches in both workflows",()=>{
  const shared={...interest("ordinary /1"),direction:role==="sister"?"inbound":"outbound",contactSharedAt:1,counterparty:{phone:"5550100"}};
  const workflow={...review(role),interestId:"workflow /2",state:"contacts_released",ownAction:null};
  for(const notices of [receivedInterestUpdates([shared],[]),receivedInterestUpdates([],[workflow],["workflow /2"]),receivedInterestUpdates([shared],[workflow],["workflow /2"])]) {
   for(const notice of notices)expect(notice).toMatchObject({heading:"A match has been created!",copy:"Review the profile to see the shared contact details.",action:"Review profile",priority:1});
  }
  const notices=receivedInterestUpdates([shared],[workflow],["workflow /2"]);expect(notices).toHaveLength(2);expect(notices[0].href).toContain("connection=ordinary%20%2F1");expect(notices[1].href).toContain("femaleReview=workflow%20%2F2");
 });
});
