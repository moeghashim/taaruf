import { NextRequest } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { adminRequestError, getAdminSecret, privateJson } from "@/lib/admin-server";
import { getConvexClient } from "@/lib/convex";
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV === "preview") return privateJson({error:"UI-review-only preview: scoped reopen API disabled."},503);
  const denied=adminRequestError(request); if(denied)return denied;
  try {
    const body=await request.json();
    if(!body || typeof body!=="object" || Array.isArray(body))return privateJson({error:"Invalid request"},400);
    const adminSecret=getAdminSecret();
    if(body.action==="preview" && Object.keys(body).length===1)return privateJson(await getConvexClient().query(api.reopen315.preview,{adminSecret}));
    if(body.action!=="reopen" || Object.keys(body).sort().join(",")!=="action,confirm,expectedFingerprint" || body.confirm!=="315-to-217-nov14" || typeof body.expectedFingerprint!=="string" || !/^[a-f0-9]{64}$/.test(body.expectedFingerprint))return privateJson({error:"Invalid scoped confirmation"},400);
    return privateJson(await getConvexClient().mutation(api.reopen315.reopen,{adminSecret,expectedFingerprint:body.expectedFingerprint,confirm:body.confirm}));
  }catch{return privateJson({error:"Reopen unavailable or state changed; obtain a fresh preview and review."},400);}
}
