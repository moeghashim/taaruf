// @vitest-environment node
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { query, mutation, send } = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), send: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = query; mutation = mutation; } }));
vi.mock("@/lib/email", () => ({ sendMatchNotificationEmail: send }));
import { POST } from "./route";
beforeEach(() => { vi.stubEnv("ADMIN_PASSWORD", "synthetic"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-service"); vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://synthetic.invalid"); query.mockReset(); mutation.mockReset(); send.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
function request(auth = true) {
 const token = crypto.createHash("sha256").update("synthetic" + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt")).digest("hex");
 return new NextRequest("https://synthetic.invalid/api/admin/notify-match", { method: "POST", headers: { origin: "https://synthetic.invalid", cookie: auth ? "admin_token=" + token : "" }, body: JSON.stringify({ matchId: "draft" }) });
}
test.each(["new", "reviewing", "paused", "closed", "declined"])("rejects %s manual draft before looking up applicants or sending email", async status => {
 query.mockResolvedValue({ _id: "draft", status, interestType: "admin_suggested", initiatedBy: "admin_recommendation" });
 expect((await POST(request())).status).toBe(409);
 expect(query).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled(); expect(mutation).not.toHaveBeenCalled();
});
test("unauthenticated notification never reaches backend", async () => {
 expect((await POST(request(false))).status).toBe(401); expect(query).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

test("automatic contact-sharing gate blocks manual Notify before either provider send", async () => {
 query.mockResolvedValueOnce({_id:"match",interestId:"interest",status:"contact_shared",interestType:"mutual_interest",maleRegistrationId:"male",femaleRegistrationId:"female"}).mockResolvedValueOnce({_id:"male",name:"Synthetic",email:"male@example.invalid"}).mockResolvedValueOnce({_id:"female",name:"Synthetic",email:"female@example.invalid"});
 mutation.mockRejectedValue(new Error("Contact-sharing notifications are automatic; manual Notify is disabled to prevent duplicates"));
 const response=await POST(request());expect(response.status).toBe(409);expect(send).not.toHaveBeenCalled();expect(mutation).toHaveBeenCalledTimes(1);
});
