// Synthetic fetch boundary; production React admin transport remains unmocked.
const profiles = [1, 2].map(n => ({ _id: "profile" + n, _creationTime: n, publicApplicantNumber: n, name: "Synthetic " + n, email: "synthetic" + n + "@example.invalid", age: 30, gender: "male", status: "pending", adminNotes: "Note " + n, imageUrls: [], maritalStatus: "single", education: "College", job: "Engineer" }));
const event = { _id: "event1", title: "Synthetic event", eventCode: "test", status: "scheduled", startsAt: 1900000000000, endsAt: 1900000100000, maleCapacity: 1, femaleCapacity: 1, counts: { malePending: 1, maleApproved: 0, femalePending: 0, femaleApproved: 0, maleWaitlisted: 0, femaleWaitlisted: 0 }, location: "Test" };
const rows = profiles.map((registration, i) => ({ _id: "roster" + i, registration, gender: "male", createdAt: i + 1, registrationStatus: i ? "rejected" : "pending", confirmationStatus: "not_confirmed", attendanceStatus: "not_checked_in" }));
const state = { calls: [] as unknown[], failNotes: false, missing: false, loading: false, error: false, refresh: () => { window.dispatchEvent(new Event("admin-data-refresh")); } };
Object.assign(state, { remoteNotes(id: string, notes: string) { profiles.find(p => p._id === id)!.adminNotes = notes; state.refresh(); } });
Object.assign(window, { fixture: state });
window.fetch = async (url, init) => {
 const body = JSON.parse(String(init?.body));
 if (url !== '/api/admin/bridge') {
  state.calls.push({ name: "events:" + body.action, args: body });
  return new Response(JSON.stringify({ error: "Event capacity reached" }), { status: 400 });
 }
 if (init?.credentials !== 'same-origin' || init?.cache !== 'no-store') throw Error('Transport contract violated');
 if (/adminSecret|password|sessionHash/.test(String(init?.body))) throw Error('Client credential leak');
 const name = body.name.replace('.', ':');
 const args = body.args;
 if (body.kind === 'query') {
  let result: unknown = [];
  if(name === 'events:getAll') result = [event];
  if(name === 'events:verifyEventBackfill') result = { readyToRequireInterestEventId: true };
  if(name === 'events:getDetail') result = { ...event, registrations: rows, waitlistEntries: [], canDelete: false };
  if(name === 'registrations:getAll') {
   if(state.error) return new Response('{}', {status:401});
   if(state.loading) return new Promise<Response>(() => {});
   result = state.missing ? [] : profiles;
  }
  if(name === 'interests:getByRegistration') result = {inbound:[],outbound:[]};
  return new Response(JSON.stringify({result}));
 }
 state.calls.push({name,args});
 const profile = profiles.find(p => p._id === args.id);
 if(name === 'registrations:updateAdminNotes') {
  if(state.failNotes) return new Response('{}', {status:400});
  profile!.adminNotes = args.adminNotes;
 }
 if(name === 'registrations:updateStatus') profile!.status = args.status;
 return new Response(JSON.stringify({result:null}));
};
