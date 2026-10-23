// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { sendEventRegistrationStatusEmail } from "./email";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const input = {
  name: "Amina", email: "test@example.invalid", eventTitle: "Community Evening",
  eventDate: "October 30, 2026 at 6:00 PM CT", eventLocation: "Houston Hall",
  applicantPortalUrl: "https://example.invalid/me?one=1&two=2",
};
const community = "https://chat.whatsapp.com/BBlrH8mAJtd4nyeTviHMiX";
const expected = `Assalamu Alaikum Amina,

We’re happy to let you know that your registration for Community Evening has been approved! We’re looking forward to welcoming you and spending a meaningful time together, insha’Allah.

Event: Community Evening
When: October 30, 2026 at 6:00 PM CT
Location: Houston Hall

We’ll send a separate email with more details about the check-in process before the event, so please keep an eye on your inbox.

In the meantime, please take a moment to review your profile and make sure your information is complete and up to date:
Open your profile: ${input.applicantPortalUrl}

We’d also love for you to join our 1 Plus 1 Announcements WhatsApp community for updates and upcoming events:
${community}

Have any questions? Reach out to us at 1plus1@plus1htx.org—we’re happy to help!

We look forward to seeing you soon, insha’Allah.

Warmly,
Bader & Danielle
1 Plus 1 Leads`;
const normalize = (html: string) => html.replace(/<br \/>|<\/p>/g, " ").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

beforeEach(() => {
  send.mockReset().mockResolvedValue({ data: { id: "mock-id" }, error: null });
});

describe("event registration status email", () => {
  it("sends the approved exact copy in text and equivalent HTML, with working links", async () => {
    expect(await sendEventRegistrationStatusEmail({ ...input, kind: "approved" })).toEqual({ success: true, id: "mock-id" });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.subject).toBe("You’re approved for Community Evening — we look forward to seeing you!");
    expect(payload.text).toBe(expected);
    expect(normalize(payload.html)).toBe(expected.replace(": " + input.applicantPortalUrl, "").replace(/\s+/g, " "));
    expect(payload.html).toContain('href="https://example.invalid/me?one=1&amp;two=2"');
    expect(payload.html).toContain('href="' + community + '"');
    expect(payload.html).toContain('href="mailto:1plus1@plus1htx.org"');
  });

  it.each([undefined, "", "   "])("omits missing profile links (%s) without a placeholder", async (applicantPortalUrl) => {
    await sendEventRegistrationStatusEmail({ ...input, applicantPortalUrl, kind: "approved" });
    const { text, html } = send.mock.calls[0][0];
    for (const body of [text, html]) {
      expect(body).not.toMatch(/undefined|null|Open your profile|href=""|\[Event|\[Name/);
      expect(body).toContain("complete and up to date.");
      expect(body).toContain(community);
    }
  });

  it("escapes all dynamic HTML text and profile URL attributes", async () => {
    const unsafe = `<img src=x onerror="bad"> & 'quoted'`;
    await sendEventRegistrationStatusEmail({ ...input, kind: "approved", name: unsafe, eventTitle: unsafe, eventDate: unsafe, eventLocation: unsafe, applicantPortalUrl: 'https://example.invalid/?x="<&' });
    const { text, html } = send.mock.calls[0][0];
    expect(text).toContain(unsafe);
    expect(html).not.toContain("<img");
    expect(html.match(/&lt;img/g)).toHaveLength(5);
    expect(html).toContain('&quot;bad&quot;&gt; &amp; &#39;quoted&#39;');
    expect(html).toContain('href="https://example.invalid/?x=&quot;&lt;&amp;"');
  });

  // Frozen pre-change function from origin/main 0d7129d. Compare complete payloads,
  // not only selected words, to guard every non-approved status byte-for-byte.
  const baselineSource = readFileSync(new URL("./email.baseline.fixture.txt", import.meta.url), "utf8");
  const baselineJs = ts.transpile(baselineSource.replace("export async function", "async function"), { target: ts.ScriptTarget.ES2020 });
  const baseline = new Function("getResend", "defaultFrom", baselineJs + "; return sendEventRegistrationStatusEmail;")(() => ({ emails: { send } }), "1Plus1 Match <contact@1plus1match.com>") as typeof sendEventRegistrationStatusEmail;
  for (const kind of ["waitlisted", "confirmation_request", "cancelled", "reminder"] as const) {
    it.each([input.applicantPortalUrl, undefined])(`preserves ${kind} with profile URL %s`, async (applicantPortalUrl) => {
      await baseline({ ...input, applicantPortalUrl, kind });
      const before = send.mock.calls[0][0];
      await sendEventRegistrationStatusEmail({ ...input, applicantPortalUrl, kind });
      expect(send.mock.calls[1][0]).toEqual(before);
    });
  }
});
