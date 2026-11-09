import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
const listeners = new Set<() => void>();
let version = 0;
const profiles = [1, 2].map(n => ({ _id: "profile" + n, _creationTime: n, publicApplicantNumber: n, name: "Synthetic " + n, email: "synthetic" + n + "@example.invalid", age: 30, gender: "male", status: "pending", adminNotes: "Note " + n, imageUrls: [], maritalStatus: "single", education: "College", job: "Engineer" }));
const event = { _id: "event1", title: "Synthetic event", eventCode: "test", status: "scheduled", startsAt: 1900000000000, endsAt: 1900000100000, maleCapacity: 1, femaleCapacity: 1, counts: { malePending: 1, maleApproved: 0, femalePending: 0, femaleApproved: 0, maleWaitlisted: 0, femaleWaitlisted: 0 }, location: "Test" };
const rows = profiles.map((registration, i) => ({ _id: "roster" + i, registration, gender: "male", createdAt: i + 1, registrationStatus: i ? "rejected" : "pending", confirmationStatus: "not_confirmed", attendanceStatus: "not_checked_in" }));
const state = { calls: [] as unknown[], failNotes: false, missing: false, loading: false, error: false, refresh: () => { version++; listeners.forEach(fn => fn()); } };
Object.assign(window, { fixture: state });
export function useQuery(query: unknown, args?: unknown) {
 useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version);
 if (args === "skip") return undefined;
 const name = getFunctionName(query as never);
 if(name === "events:getAll") return [event];
 if(name === "events:verifyEventBackfill") return { readyToRequireInterestEventId: true };
 if(name === "events:getDetail") return { ...event, registrations: rows, waitlistEntries: [], canDelete: false };
 if(name === "registrations:getAll") { if(state.error) throw Error("Synthetic query failure"); return state.loading ? undefined : state.missing ? [] : profiles; }
 if(name === "events:getWaitlistedRegistrationIds") return [];
 if(name === "events:getByRegistration") return [];
 if(name === "interests:getByRegistration") return { inbound: [], outbound: [] };
 return [];
}
export function useMutation(query: unknown) {
 const name = getFunctionName(query as never);
 return async (args: { id?: string; adminNotes?: string; status?: string; eventRegistrationId?: string; registrationStatus?: string }) => {
  state.calls.push({ name, args });
  const profile = profiles.find(p => p._id === args.id);
  if(name === "registrations:updateAdminNotes") { if(state.failNotes) throw Error("Synthetic save failed"); profile!.adminNotes = args.adminNotes!; }
  if(name === "registrations:updateStatus") profile!.status = args.status!;
  if(name === "events:updateRegistrationStatus") {
   if(args.registrationStatus === "approved" && args.eventRegistrationId === "roster1") throw Error("Event capacity reached");
   rows.find(r => r._id === args.eventRegistrationId)!.registrationStatus = args.registrationStatus!;
  }
  state.refresh();
 };
}
