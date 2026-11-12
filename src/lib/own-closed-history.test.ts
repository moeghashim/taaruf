import { expect, test } from "vitest";
import { ownClosedHistory } from "./own-closed-history";
test("mixed histories, numbering and empty state use only server-owned receipts", () => {
 const rows = [{ownDecision:"declined"}, {ownDecision:"withdrawn"}, {ownDecision:null}, {ownDecision:"pending"}, {ownDecision:"approved"}, {}];
 expect(ownClosedHistory(rows)).toEqual(rows.slice(0,2));
 expect(ownClosedHistory(rows.slice(2))).toEqual([]);
});
