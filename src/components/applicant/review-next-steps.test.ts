import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewNextSteps } from "./review-next-steps";
const paragraphs=(stage:"initial"|"workflow-initial"|"final",recipientGender?:string)=>[...renderToStaticMarkup(ReviewNextSteps({stage,recipientGender})).matchAll(new RegExp("<p>(.*?)</p>", "g"))].map(m=>m[1]);
for(const gender of ["male","female"])for(const stage of ["initial","workflow-initial"] as const)test(gender+" exact four paragraphs "+stage,()=>{
 const possessive=gender==="male"?"her":"his";
 expect(paragraphs(stage,gender)).toEqual([
 "This applicant has expressed interest in getting to know you better.",
 "If you accept, "+possessive+" full bio will become available for you to review. Accepting does not create a match and does not share any contact details.",
 "A match is only created after you review "+possessive+" bio and give your final approval, "+(gender==="male"?"she gives hers":"he gives his")+", and the admin approves.",
 "If you decline, this connection will be closed and no contact details will be shared."]);
});
for(const gender of ["male","female",undefined])test("final unchanged "+gender,()=>expect(paragraphs("final",gender)).toEqual([
 "Confirm your interest after reviewing the profile and bio. Your approval does not automatically share contact details.",
 "Contact sharing requires both applicants’ agreement and final admin approval.",
 "Decline closes this connection without sharing contact details."]));
test("unknown initial recipient retains neutral copy",()=>expect(paragraphs("initial")[0]).toBe("Accept to continue to the bio review stage. You can then review the bio before giving your final approval. Accepting now does not share contact details."));

test("workflow initial neutral copy distinguishes final approval",()=>{
 expect(paragraphs("workflow-initial")[0]).toBe("Accept to unlock the bio, then review it before giving your separate final approval. Initial acceptance is not final approval and does not share contact details.");
});
