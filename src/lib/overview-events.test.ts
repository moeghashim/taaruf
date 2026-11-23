import { expect, test } from "vitest";
import { overviewEvents } from "./overview-events";
test("hide expired pending and unregistered cards while preserving future events and all source records", () => {
 const now=Date.parse("2026-11-23T03:30:00Z");
 const events=[{title:"1 Plus 1 Match Workshop",endsAt:Date.parse("2026-11-15T00:00:00Z"),registration:{status:"pending"}},{title:"Real Talk",endsAt:Date.parse("2026-10-21T04:00:00Z"),registration:null},{title:"Future event",endsAt:now+86400000,registration:null}];
 const before=structuredClone(events);expect(overviewEvents(events,now).map(e=>e.title)).toEqual(["Future event"]);expect(events).toEqual(before);
});
test("ongoing visible; exact end and invalid end hidden; empty safe",()=>{expect(overviewEvents([{endsAt:100},{endsAt:101},{endsAt:NaN}],100)).toEqual([{endsAt:101}]);expect(overviewEvents([],100)).toEqual([]);});
