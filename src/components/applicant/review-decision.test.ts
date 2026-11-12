import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewDecision } from "./review-decision";
for (const decision of [undefined,"pending","accepted"]) test("no final status for "+decision,()=>expect(renderToStaticMarkup(ReviewDecision({decision,awaitingAdmin:true}))).toBe(""));
for (const decision of ["approved","declined","withdrawn"]) for (const awaitingAdmin of [true,false]) test(decision+" admin gate "+awaitingAdmin,()=>{const html=renderToStaticMarkup(ReviewDecision({decision,awaitingAdmin}));expect(html).toContain("Your decision:");expect(html).toContain(decision);expect(html.includes("Contact details will be shared")).toBe(decision==="approved"&&awaitingAdmin);});
