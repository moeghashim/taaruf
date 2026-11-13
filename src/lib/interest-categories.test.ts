import { expect, test } from "vitest";
import { interestCategories, visibleWorkflowReviews, selectedWorkflowReview } from "./interest-categories";
const row = (interestId: string) => ({interestId, femaleWorkflow:true, direction:"private", counterparty:{label:"Same applicant"}, canWithdraw:false});
const review = (interestId: string) => ({interestId,role:"sister",state:"in_review",canView:true});
test("exact shared workflow only; preserve original row",()=>{
 const a=row("a"),b=row("b"),legacy={...row("legacy"),femaleWorkflow:false};
 expect(interestCategories([], [a,b,legacy], [review("a"),review("independent"),review("legacy")])).toEqual({outbound:[a],privateDocumented:[b,legacy]});
 expect(interestCategories([], [a], [review("a")]).outbound[0]).toBe(a);
});
test("pre-share, wrong role and closed cannot move rows",()=>{
 for(const projection of [[],[{...review("a"),canView:false}],[{...review("a"),role:"brother"}],[{...review("a"),state:"closed"}]]) expect(interestCategories([], [row("a")],projection).outbound).toEqual([]);
});
test("later stages and invitation expiry retain share",()=>{
 for(const fields of [{ownDecision:"pending"},{ownAction:"review"},{ownDecision:"approved"},{paused:true},{reviewExpired:true},{state:"contacts_released"}]) expect(interestCategories([], [row("a")],[{...review("a"),...fields}]).outbound).toHaveLength(1);
});
test("dedupe exact ID, independent same-pair interests and no resurrection",()=>{
 const a=row("a"),b=row("b");
 expect(interestCategories([a],[a,b],[review("a"),review("b"),review("a")])).toEqual({outbound:[a,b],privateDocumented:[]});
 expect(interestCategories([],[],[review("reset")])).toEqual({outbound:[],privateDocumented:[]});
});

test("shared mutual is inbound for both roles, never inferred before share", () => {
 for (const role of ["sister", "brother"]) {
  const mutual = {...review("canonical"), role, mutualInterest:true};
  expect(visibleWorkflowReviews([mutual], "inbound")).toEqual([mutual]);
  expect(visibleWorkflowReviews([mutual], "outbound")).toEqual([]);
  expect(visibleWorkflowReviews([{...mutual,canView:false}], "inbound")).toEqual([]);
 }
 expect(visibleWorkflowReviews([review("ordinary")], "outbound")).toHaveLength(1);
});
test("receipt stays outbound without becoming a review and explicit selection wins", () => {
 const receipt = {...row("sent"), receiptOnly:true, counterparty:null};
 expect(interestCategories([], [receipt], []).outbound).toEqual([receipt]);
 const final = {...review("final"), ownAction:"review", ownActionStage:"final" as const};
 const mutual = {...review("mutual"),mutualInterest:true};
 expect(selectedWorkflowReview([mutual,final],null,false)).toBe("final");
 expect(selectedWorkflowReview([mutual,final],"mutual",true)).toBe("mutual");
 expect(selectedWorkflowReview([mutual,final],null,true)).toBeNull();
 expect(selectedWorkflowReview([mutual,final],"unknown",true)).toBe("unknown");
});

 test("explicit stale, expired and absent reviews always reach detail authority", () => {
   for (const state of ["expired", "revoked", "closed", "declined", "withdrawn"]) {
     const visible = visibleWorkflowReviews([{...review("stale"), state}], "outbound");
     expect(visible).toEqual([]);
     expect(selectedWorkflowReview(visible, "stale", true)).toBe("stale");
   }
   expect(selectedWorkflowReview([], "missing", true)).toBe("missing");
   expect(selectedWorkflowReview([], null, true)).toBeNull();
 });
