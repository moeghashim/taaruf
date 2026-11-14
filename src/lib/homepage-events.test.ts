import { expect, test, vi } from "vitest";
import { openHomepageEvents } from "./homepage-events";
test("closed November promotion absent; unrelated open event retained in original order",async()=>{
 const closed=Object.freeze({eventCode:"nov26",title:"November"}),open=Object.freeze({eventCode:"next",title:"Next event"}),events=Object.freeze([closed,open]);
 const lookup=vi.fn(async(code:string)=>code==="nov26"?null:{eventCode:code});
 expect(await openHomepageEvents(events,lookup)).toEqual([open]);expect(events).toEqual([closed,open]);expect(lookup.mock.calls).toEqual([["nov26"],["next"]]);
});
test("all closed yields no promotions; empty list makes no requests",async()=>{const lookup=vi.fn(async()=>null);expect(await openHomepageEvents([{eventCode:"nov26"}],lookup)).toEqual([]);lookup.mockClear();expect(await openHomepageEvents([],lookup)).toEqual([]);expect(lookup).not.toHaveBeenCalled();});
test("open cards preserve exact content and identity",async()=>{const event={eventCode:"other",title:"Unrelated",maleWaitlisted:false};const out=await openHomepageEvents([event],async()=>({}));expect(out[0]).toBe(event);});
