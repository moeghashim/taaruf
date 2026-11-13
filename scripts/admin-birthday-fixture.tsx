import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProfileDetail } from "../src/components/admin/profiles/profile-detail";
import type { RegistrationDoc } from "../src/components/admin/hooks/use-registrations";
// Static, synthetic UI review only. No production backend, cookies or data.
window.fetch = async (url, init) => {
 if (url !== "/api/admin/bridge") throw new Error("External requests disabled in synthetic preview");
 const body = JSON.parse(String(init?.body));
 if (body.kind !== "query") return new Response(JSON.stringify({error:"Preview is read-only"}),{status:403});
 let result: unknown = null;
 if (body.name === "adminBirthday.get") result = body.args.registrationId === "synthetic-dob" ? {dateOfBirth:"2000-02-29"} : null;
 if (body.name === "events.getByRegistration") result = [];
 if (body.name === "interests.getByRegistration") result = {inbound:[],outbound:[]};
 return new Response(JSON.stringify({result}));
};
function Preview() {
 const [hasBirthday,setHasBirthday] = useState(true);
 const profile = {_id:hasBirthday?"synthetic-dob":"synthetic-no-dob",_creationTime:1,publicApplicantNumber:1,name:"Synthetic applicant",email:"synthetic@example.invalid",phone:"5550100",age:26,gender:"female",status:"approved",paymentStatus:"paid",imageUrls:[],maritalStatus:"single",education:"College",job:"Example occupation"} as unknown as RegistrationDoc;
 return <main data-admin style={{maxWidth:900,margin:"0 auto",padding:20}}>
 <h1>Admin birthday preview</h1><p>Synthetic data only. No live records or submissions. Birthday is visible only when recorded; age is unchanged.</p>
 <nav aria-label="Synthetic examples" style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:24}}><button onClick={()=>setHasBirthday(true)}>With birthday</button><button onClick={()=>setHasBirthday(false)}>Without birthday</button></nav>
 <ProfileDetail profile={profile} registrationNumber={1} onUpdateNotes={async()=>{}} onUpdateStatus={async()=>{}} onDelete={async()=>{}} onClose={()=>{}} />
 </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
