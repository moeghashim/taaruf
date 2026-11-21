import { describe, expect, it } from "vitest";
import { terminalConnectionAction, withoutSelectedConnection, unavailableConnection } from "./connection-refresh";
describe("connection refresh", () => {
  it.each([{action:"respond",decision:"decline"},{action:"final_approval",approved:false},{action:"withdraw"},{action:"close_connection"}])("retires committed terminal action %j", body => expect(terminalConnectionAction({...body,interestId:"one"})).toBe("one"));
  it.each([{action:"respond",decision:"accept"},{action:"respond",decision:"keep_open"},{action:"final_approval",approved:true},{action:"pause_connection"},{action:"submit_number"}])("keeps nonterminal selection %j", body => expect(terminalConnectionAction({...body,interestId:"one"})).toBeNull());
  it("preserves other params and hash",()=>expect(withoutSelectedConnection("https://example.test/me?connection=one&femaleReview=other#inbound-interests","one")).toBe("/me?femaleReview=other#inbound-interests"));
  it("never clears newer selection",()=>expect(withoutSelectedConnection("https://example.test/me?connection=new#profile","old")).toBeNull());
  it("only recovers explicit unavailable detail, not auth or generic errors",()=>{expect(unavailableConnection(404,"Connection unavailable.")).toBe(true);for(const code of [400,401,403,409,500])expect(unavailableConnection(code,"Connection unavailable.")).toBe(false);expect(unavailableConnection(404,"Unknown")).toBe(false);});
});
