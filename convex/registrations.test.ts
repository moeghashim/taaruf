process.env.ATTENDANCE_ADMIN_SECRET ??= "synthetic-admin-test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Doc, Id } from "./_generated/dataModel";

const baseRegistrationArgs = {
  name: "Test Applicant",
  age: 28,
  gender: "male" as const,
  maritalStatus: "single",
  education: "bachelor",
  job: "Engineer",
  phone: "555-0100",
  ethnicity: "Arab",
  prayerCommitment: "always_five" as const,
  hijabResponse: "open" as const,
  spouseRequirement1: "Kind",
  spouseRequirement2: "Patient",
  spouseRequirement3: "Smart",
  shareableBio: "Bio",
  photoSharingPermission: "no" as const,
};

async function insertScheduledEvent(ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0]) {
  const now = Date.now();
  return await ctx.db.insert("events", {
    title: "May Workshop",
    eventCode: "may-workshop",
    eventMonth: "2026-05",
    series: "1plus1_match",
    location: "ROIC",
    startsAt: now + 7 * 24 * 60 * 60 * 1000,
    endsAt: now + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
    status: "scheduled",
    maleCapacity: 10,
    femaleCapacity: 10,
    createdAt: now,
    updatedAt: now,
  });
}

async function getRegistration(
  t: ReturnType<typeof convexTest>,
  id: Id<"registrations">
) {
  return await t.run((ctx) => ctx.db.get(id)) as Doc<"registrations"> | null;
}

describe("applicant number", () => {
  test("starts at 1 and increments by 1 across consecutive registrations", async () => {
    const t = convexTest(schema, modules);

    const firstId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant1@example.com",
    });
    const secondId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant2@example.com",
    });

    const first = await getRegistration(t, firstId);
    const second = await getRegistration(t, secondId);

    expect(first?.applicantNumber).toBe(1);
    expect(second?.applicantNumber).toBe(2);
    expect(first?.publicApplicantNumber).toBe(1);
    expect(second?.publicApplicantNumber).toBe(2);
  });

  test("deleting a registration never reuses its applicant number", async () => {
    const t = convexTest(schema, modules);

    const firstId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant1@example.com",
    });
    const secondId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant2@example.com",
    });

    const second = await getRegistration(t, secondId);
    expect(second?.applicantNumber).toBe(2);
    expect(second?.publicApplicantNumber).toBe(2);

    await t.mutation(api.registrations.deleteRegistration, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  id: secondId });

    const thirdId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant3@example.com",
    });
    const third = await getRegistration(t, thirdId);

    expect(third?.applicantNumber).toBe(3);
    expect(third?.publicApplicantNumber).toBe(3);

    const first = await getRegistration(t, firstId);
    expect(first?.applicantNumber).toBe(1);
    expect(first?.publicApplicantNumber).toBe(1);
  });

  test("even if every registration is deleted, the counter does not reset", async () => {
    const t = convexTest(schema, modules);

    const firstId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant1@example.com",
    });
    const secondId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant2@example.com",
    });

    await t.mutation(api.registrations.deleteRegistration, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  id: firstId });
    await t.mutation(api.registrations.deleteRegistration, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  id: secondId });

    const newId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "applicant3@example.com",
    });
    const fresh = await getRegistration(t, newId);

    expect(fresh?.applicantNumber).toBe(3);
    expect(fresh?.publicApplicantNumber).toBe(3);
  });

  test("rejects a second registration with the same email", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "dup@example.com",
    });
    await expect(
      t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
        ...baseRegistrationArgs,
        email: "dup@example.com",
      })
    ).rejects.toThrow(/already registered/i);
  });

  test("reuses an existing profile for event registration with the same email", async () => {
    const t = convexTest(schema, modules);
    await t.run(insertScheduledEvent);

    const profileId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "Existing.Profile@Example.com",
    });
    const eventSignupId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "existing.profile@example.com",
      stripeSessionId: "cs_existing_email",
      eventCode: "may-workshop",
    });

    expect(eventSignupId).toBe(profileId);

    const result = await t.run(async (ctx) => {
      const registrations = await ctx.db.query("registrations").take(10);
      const eventRegistrations = await ctx.db.query("eventRegistrations").take(10);
      const profile = await ctx.db.get(profileId) as Doc<"registrations"> | null;
      return { registrations, eventRegistrations, profile };
    });

    expect(result.registrations).toHaveLength(1);
    expect(result.profile?.applicantNumber).toBe(1);
    expect(result.profile?.publicApplicantNumber).toBe(1);
    expect(result.profile?.stripeSessionId).toBe("cs_existing_email");
    expect(result.eventRegistrations).toEqual([
      expect.objectContaining({
        registrationId: profileId,
        registrationStatus: "pending",
      }),
    ]);
  });

  test("reuses an existing profile for event registration with the same phone", async () => {
    const t = convexTest(schema, modules);
    await t.run(insertScheduledEvent);

    const profileId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "phone-original@example.com",
      phone: "(555) 010-2000",
    });
    const eventSignupId = await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      ...baseRegistrationArgs,
      email: "phone-new@example.com",
      phone: "5550102000",
      stripeSessionId: "cs_existing_phone",
      eventCode: "may-workshop",
    });

    expect(eventSignupId).toBe(profileId);

    const counts = await t.run(async (ctx) => ({
      registrations: (await ctx.db.query("registrations").take(10)).length,
      eventRegistrations: (await ctx.db.query("eventRegistrations").take(10)).length,
    }));

    expect(counts).toEqual({ registrations: 1, eventRegistrations: 1 });
  });
});

test("public checkout signup reserves Pending capacity and overflows only the matching event/gender", async () => {
  const t = convexTest(schema, modules);
  const eventId = await t.run(insertScheduledEvent);
  await t.run(ctx => ctx.db.patch(eventId, {maleCapacity:1, femaleCapacity:1}));
  for (let i = 0; i < 3; i++) await t.mutation(api.registrations.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, ...baseRegistrationArgs, name:"Queue " + i, phone:"555-020" + i, email:"queue" + i + "@example.com", eventCode:"may-workshop"});
  const rows = await t.run(ctx => ctx.db.query("eventRegistrations").withIndex("by_eventId", q => q.eq("eventId",eventId)).take(10));
  expect(rows.map(row => row.registrationStatus)).toEqual(["pending","waitlisted","waitlisted"]);
  const profiles = await t.run(ctx => ctx.db.query("registrations").take(10));
  expect(profiles.every(profile => profile.status === "pending")).toBe(true);
});

test("saved photo choices reject legacy ask without rewriting history", async () => {
 const t = convexTest(schema, modules);
 const legacyId = await t.run(ctx => ctx.db.insert("registrations", { ...baseRegistrationArgs, photoSharingPermission: "ask_me_first", email: "legacy@example.invalid", status: "approved", createdAt: Date.now() }));
 await expect(t.mutation(api.registrations.create, { ...baseRegistrationArgs, adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, email: "new@example.invalid", photoSharingPermission: "ask_me_first" as never })).rejects.toThrow();
 expect((await getRegistration(t, legacyId))?.photoSharingPermission).toBe("ask_me_first");
 for (const choice of ["yes", "no"] as const) {
 const id = await t.mutation(api.registrations.create, { ...baseRegistrationArgs, adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, email: choice + "@example.invalid", photoSharingPermission: choice });
 expect((await getRegistration(t, id))?.photoSharingPermission).toBe(choice);
 }
});


describe('signup matchmaking consent', () => {
  for (const consent of [true, false, undefined]) test('new-only consent ' + consent, async () => {
    const t = convexTest(schema, modules);
    const args = {...baseRegistrationArgs, adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, email:'consent@example.invalid', backgroundMatchmakingOptIn:consent};
    const id = await t.mutation(api.registrations.create,args);
    const row = await getRegistration(t,id);
    expect(row?.backgroundMatchmakingOptIn).toBe(consent === true);
    expect(row?.backgroundMatchmakingConsentUpdatedAt).toBe(consent === undefined ? undefined : row?.createdAt);
    await t.run(ctx => ctx.db.insert('applicantSessions',{registrationId:id,sessionHash:'consent-session',createdAt:Date.now(),expiresAt:Date.now()+100000}));
    expect(await t.query(api.matchmakerMatching.getMine,{sessionHash:'consent-session'})).toMatchObject({optedIn:consent === true,matches:[]});
    await t.mutation(api.matchmakerMatching.setConsent,{sessionHash:'consent-session',optedIn:consent !== true});
    const saved = await getRegistration(t,id);
    await expect(t.mutation(api.registrations.create,args)).rejects.toThrow('already registered');
    expect(await getRegistration(t,id)).toEqual(saved);
    await t.run(insertScheduledEvent);
    await t.mutation(api.registrations.create,{...args,eventCode:'may-workshop'});
    const reused = await getRegistration(t,id);
    expect(reused?.backgroundMatchmakingOptIn).toBe(saved?.backgroundMatchmakingOptIn);
    expect(reused?.backgroundMatchmakingConsentUpdatedAt).toBe(saved?.backgroundMatchmakingConsentUpdatedAt);
    expect(await t.run(ctx=>ctx.db.query('matchmakerNotifications').collect())).toEqual([]);
  });
  test('failed create does not persist consent; retry creates once', async()=>{
    const t=convexTest(schema,modules);
    const args={...baseRegistrationArgs,adminSecret:process.env.ATTENDANCE_ADMIN_SECRET!,email:'retry@example.invalid',backgroundMatchmakingOptIn:true};
    await expect(t.mutation(api.registrations.create,{...args,eventCode:'missing-event'})).rejects.toThrow();
    expect(await t.run(ctx=>ctx.db.query('registrations').collect())).toEqual([]);
    await t.mutation(api.registrations.create,args);
    await expect(t.mutation(api.registrations.create,{...args,backgroundMatchmakingOptIn:false})).rejects.toThrow();
    const rows=await t.run(ctx=>ctx.db.query('registrations').collect());
    expect(rows).toHaveLength(1); expect(rows[0].backgroundMatchmakingOptIn).toBe(true);
  });
  for(const malformed of ['true',1,null,[],{}]) test('malformed consent '+JSON.stringify(malformed),async()=>{
    const t=convexTest(schema,modules);
    await expect(t.mutation(api.registrations.create,{...baseRegistrationArgs,adminSecret:process.env.ATTENDANCE_ADMIN_SECRET!,email:'bad@example.invalid',backgroundMatchmakingOptIn:malformed as boolean})).rejects.toThrow();
    expect(await t.run(ctx=>ctx.db.query('registrations').collect())).toEqual([]);
  });
});
