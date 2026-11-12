import {expect,test} from "vitest";
import {isResolvedInterest} from "./interest-lifecycle";
import type {Doc} from "../../convex/_generated/dataModel";
const id="match" as Doc<"matches">["_id"];
test("grey only actual linked conversion, never initial acceptance or dangling links",()=>{
 const match={_id:id} as Doc<"matches">;
 expect(isResolvedInterest({status:"active",matchId:id,match})).toBe(false);
 expect(isResolvedInterest({status:"converted_to_match",matchId:id,match:null})).toBe(false);
 expect(isResolvedInterest({status:"converted_to_match",matchId:id,match})).toBe(true);
 expect(isResolvedInterest({status:"converted_to_match",matchId:"other" as typeof id,match})).toBe(false);
});
