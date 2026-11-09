import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { NextRequest } from "next/server";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

// Exercise the real HTTP handler with its transport routed to real Convex handlers.
const bridge = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class {
  query = bridge.query;
  mutation = bridge.mutation;
} }));
import { GET } from "../src/app/api/share/[token]/route";
const secret = "synthetic-archive-share";
const shareToken = "synthetic-declined";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret);
  vi.stubEnv("CONVEX_URL", "https://synthetic.convex.cloud");
  const t = convexTest(schema, modules);
  bridge.query.mockImplementation((ref, args) => t.query(ref, args));
  bridge.mutation.mockImplementation((ref, args) => t.mutation(ref, args));
  const ids = await t.run(async ctx => {
    const base = { name: "Synthetic", age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "synthetic", status: "approved" as const, photoSharingPermission: "yes" as const, createdAt: 1 };
    const image = await ctx.storage.store(new Blob(["synthetic-photo"]));
    const owner = await ctx.db.insert("registrations", { ...base, gender: "male", email: "owner@example.invalid", imageStorageIds: [image] });
    const recipient = await ctx.db.insert("registrations", { ...base, gender: "female", email: "recipient@example.invalid" });
    const share = await ctx.db.insert("profileShares", { ownerRegistrationId: owner, recipientRegistrationId: recipient, shareToken, includeImages: true, status: "declined", createdAt: 1, updatedAt: 1 });
    return { owner, recipient, share, image };
  });
  return { t, ...ids };
}
const readHttp = () => GET(new NextRequest("https://example.invalid/api/share/" + shareToken), { params: Promise.resolve({ token: shareToken }) });

for (const side of ["owner", "recipient"] as const) {
  for (const mode of ["archive", "zero-timestamp"] as const) {
    test(side + " " + mode + " denies declined bearer reads/photos/view writes without altering history", async () => {
      const f = await fixture();
      const beforeHttp = await readHttp();
      expect(beforeHttp.status).toBe(200);
      expect((await beforeHttp.json()).share.owner.imageUrls).toHaveLength(1);
      const before = await f.t.run(ctx => ctx.db.get(f.share));
      if (mode === "archive") {
        await f.t.mutation(makeFunctionReference<"mutation">("archive:archiveAdmin"), { adminSecret: secret, registrationId: f[side], confirm: true, expectedArchivedAt: null });
      } else {
        await f.t.run(ctx => ctx.db.patch(f[side], { archivedAt: 0 }));
      }
      expect(await f.t.query(api.profileShares.getByShareToken, { shareToken })).toBeNull();
      await expect(f.t.mutation(api.profileShares.markViewed, { shareToken })).rejects.toThrow("Shared profile not found");
      const response = await readHttp();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Shared profile not found" });
      expect(await f.t.run(ctx => ctx.db.get(f.share))).toEqual(before);
      expect(await f.t.run(async ctx => (await ctx.storage.get(f.image))?.text())).toBe("synthetic-photo");
      // Knowing the historical storage ID must not bypass PR61 admin authorization.
      await expect(f.t.query(api.registrations.getImageUrls, { storageIds: [f.image] })).rejects.toThrow("Unauthorized");
    });
  }
}

for (const permission of ["yes", "no"] as const) test("nonarchived declined share retains existing consent: " + permission, async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.owner, { photoSharingPermission: permission }));
  const share = await f.t.query(api.profileShares.getByShareToken, { shareToken });
  expect(share?.status).toBe("declined");
  expect(share?.includeImages).toBe(permission === "yes");
  expect(share?.images).toHaveLength(permission === "yes" ? 1 : 0);
  await expect(f.t.mutation(api.profileShares.markViewed, { shareToken })).resolves.toBe(f.share);
  const response = await readHttp();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.share.status).toBe("declined");
  expect(body.share.owner.imageUrls).toHaveLength(permission === "yes" ? 1 : 0);
  expect((await f.t.run(ctx => ctx.db.get(f.share)))?.status).toBe("declined");
});
