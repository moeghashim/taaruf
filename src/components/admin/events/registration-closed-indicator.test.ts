import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RegistrationClosedIndicator, registrationIsClosed } from "./registration-closed-indicator";
for (const deadline of [undefined, 0, 1000, 1001]) test("no closed indicator for unset/open deadline "+deadline,()=>{
 expect(registrationIsClosed(deadline,1000)).toBe(false);
 expect(renderToStaticMarkup(createElement(RegistrationClosedIndicator,{closesAt:deadline,now:1000}))).toBe("");
});
test("past deadline shows read-only label alongside unchanged scheduled state",()=>{
 const state=Object.freeze({status:"scheduled",registrationClosesAt:999});
 const html=renderToStaticMarkup(createElement("div",null,createElement("span",null,"Scheduled"),createElement(RegistrationClosedIndicator,{closesAt:state.registrationClosesAt,now:1000})));
 expect(html).toContain("Scheduled");expect(html).toContain('class="pill rose"');expect(html).toContain("Registration closed");expect(html).not.toContain("button");expect(state.status).toBe("scheduled");
});
