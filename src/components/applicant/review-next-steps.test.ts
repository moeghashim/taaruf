import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewNextSteps } from "./review-next-steps";
const paragraphs=(stage:"initial"|"workflow-initial"|"final",recipientGender?:string)=>[...renderToStaticMarkup(ReviewNextSteps({stage,recipientGender})).matchAll(new RegExp("<p>(.*?)</p>", "g"))].map(m=>m[1]);
for(const gender of ["male","female"])for(const stage of ["initial","workflow-initial"] as const)test(gender+" exact four paragraphs "+stage,()=>{
 const possessive=gender==="male"?"her":"his";
 expect(paragraphs(stage,gender)).toEqual([
 "This applicant has expressed interest in getting to know you better.",
 "If you accept, you’ll be able to see "+possessive+" full bio, and "+(gender==="male"?"she":"he")+"’ll be able to see yours. Accepting does not create a match and does not share any contact details.",
 "A match is only created after you both read each other’s bios and give your final approval, and the admin approves.",
 "If you decline, this connection will be closed and no contact details will be shared."]);
});
for(const gender of ["male","female",undefined])test("final exact requested guidance "+gender,()=>expect(paragraphs("final",gender)).toEqual([
 "If you’re interested after reading their bio, approve to move toward a match and share contact details.",
 "Your approval alone does not create a match or share contact details. A match is only created once you both approve and the admin approves.",
 "If you decline, this connection will be closed and no contact details will be shared."]));
test("unknown initial recipient retains neutral copy",()=>expect(paragraphs("initial")[0]).toBe("Accept to continue to the bio review stage. You can then review the bio before giving your final approval. Accepting now does not share contact details."));

test("workflow initial neutral copy distinguishes final approval",()=>{
 expect(paragraphs("workflow-initial")[0]).toBe("Accept to unlock the bio, then review it before giving your separate final approval. Initial acceptance is not final approval and does not share contact details.");
});
