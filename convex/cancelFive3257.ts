import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
const INTEREST = "jn7exypvtxvsag6pagdgamhqkd8hz9wq";
const PAIR = [{"id":"j572w0f7mwazj4ke8snn0k99hn8g508t","number":220},{"id":"j57fqgmbmh3am42geabkq852zx8g5wxy","number":219}] as const;
const EXPECTED = [
  {
    "_creationTime": 1794361219322.71,
    "_id": "m973rvsgvj096qwvfq05qn97yn8j1bp9",
    "attempts": 1,
    "createdAt": 1794361219322,
    "error": "Isolated delivery configuration missing or recipient not allowlisted",
    "interestId": "jn7exypvtxvsag6pagdgamhqkd8hz9wq",
    "key": "jn7exypvtxvsag6pagdgamhqkd8hz9wq:sister_confirmation:j572w0f7mwazj4ke8snn0k99hn8g508t",
    "kind": "sister_confirmation",
    "nextAttemptAt": 1794361362783,
    "recipientId": "j572w0f7mwazj4ke8snn0k99hn8g508t",
    "status": "failed"
  },
  {
    "_creationTime": 1794363171210.6924,
    "_id": "m97dn73sdhjb2x11hmb7m0kbq18j1a7a",
    "attempts": 1,
    "createdAt": 1794363171210,
    "error": "Isolated delivery configuration missing or recipient not allowlisted",
    "interestId": "jn7exypvtxvsag6pagdgamhqkd8hz9wq",
    "key": "jn7exypvtxvsag6pagdgamhqkd8hz9wq:pending_review:j57fqgmbmh3am42geabkq852zx8g5wxy",
    "kind": "pending_review",
    "nextAttemptAt": 1794363342797,
    "recipientId": "j57fqgmbmh3am42geabkq852zx8g5wxy",
    "status": "failed"
  },
  {
    "_creationTime": 1794363171210.6926,
    "_id": "m9723f97z7ss71sse5j40jp93x8j1v7h",
    "attempts": 1,
    "createdAt": 1794363171210,
    "error": "Isolated delivery configuration missing or recipient not allowlisted",
    "interestId": "jn7exypvtxvsag6pagdgamhqkd8hz9wq",
    "key": "jn7exypvtxvsag6pagdgamhqkd8hz9wq:pending_review:j572w0f7mwazj4ke8snn0k99hn8g508t",
    "kind": "pending_review",
    "nextAttemptAt": 1794363342797,
    "recipientId": "j572w0f7mwazj4ke8snn0k99hn8g508t",
    "status": "failed"
  },
  {
    "_creationTime": 1794363364339.8647,
    "_id": "m973rw67k9x943y3pqfx0jg9c18j0rry",
    "attempts": 1,
    "createdAt": 1794363364339,
    "error": "Isolated delivery configuration missing or recipient not allowlisted",
    "interestId": "jn7exypvtxvsag6pagdgamhqkd8hz9wq",
    "key": "jn7exypvtxvsag6pagdgamhqkd8hz9wq:contacts_ready:j57fqgmbmh3am42geabkq852zx8g5wxy",
    "kind": "contacts_ready",
    "nextAttemptAt": 1794363522830,
    "recipientId": "j57fqgmbmh3am42geabkq852zx8g5wxy",
    "status": "failed"
  },
  {
    "_creationTime": 1794363364339.865,
    "_id": "m970s3c83mxrx41s0898za0hvx8j0v6g",
    "attempts": 1,
    "createdAt": 1794363364339,
    "error": "Isolated delivery configuration missing or recipient not allowlisted",
    "interestId": "jn7exypvtxvsag6pagdgamhqkd8hz9wq",
    "key": "jn7exypvtxvsag6pagdgamhqkd8hz9wq:contacts_ready:j572w0f7mwazj4ke8snn0k99hn8g508t",
    "kind": "contacts_ready",
    "nextAttemptAt": 1794363522830,
    "recipientId": "j572w0f7mwazj4ke8snn0k99hn8g508t",
    "status": "failed"
  }
] as const;
const OPERATION = "cancel-five-notifications-omar-3257";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+":"+canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
export function validateExactRows(rows: unknown[]) {
  if (rows.length !== EXPECTED.length || canonical([...rows].sort((a,b)=>canonical(a).localeCompare(canonical(b)))) !== canonical([...EXPECTED].sort((a,b)=>canonical(a).localeCompare(canonical(b))))) throw new Error("Delivery snapshot changed; manual review required");
}
// One-shot fixed scope; no caller IDs, sends, retries, reset or configuration changes.
export const cancel = internalMutation({args: {}, handler: async ctx => {
  const prior = await ctx.db.query("deliveryCancellationAudits").withIndex("by_operationKey",q=>q.eq("operationKey",OPERATION)).unique();
  if (prior) throw new Error("Already cancelled; inspect existing audit");
  for (const p of PAIR) if ((await ctx.db.get(p.id as Id<"registrations">))?.publicApplicantNumber !== p.number) throw new Error("Configured pair unavailable");
  const interest = await ctx.db.get(INTEREST as Id<"interests">);
  if (!interest || interest.fromRegistrationId !== PAIR[0].id || interest.toRegistrationId !== PAIR[1].id || interest.testReset) throw new Error("Interest scope changed");
  const rows = await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_interestId",q=>q.eq("interestId",interest._id)).take(6);
  validateExactRows(rows);
  // Audit and all five patches commit atomically. All original evidence retained.
  const auditId = await ctx.db.insert("deliveryCancellationAudits",{operationKey:OPERATION,authorization:"Omar message 3257: cancel only five failed #219/#220 notifications; preview only; no reset or sends",snapshot:JSON.stringify(rows),createdAt:Date.now()});
  for (const row of rows) await ctx.db.patch(row._id,{status:"cancelled"});
  return {auditId,operationKey:OPERATION,cancelled:rows.map(r=>r._id)};
}});
