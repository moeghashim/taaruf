# Interest Management Message Templates

These templates define the applicant and management messages needed for the interest management flow. They should be implemented as reusable email helpers in `src/lib/email.ts` and triggered from the workflow transitions described in the PRD and plan.

## Template Rules

- Do not include photos in email bodies.
- Do not include contact info until the contact-share step is complete.
- Use applicant portal links for applicants: `/me/interests/<interestId>`.
- Use protected admin links for management: `/admin/workbench?interest=<interestId>&step=<step>` or `/admin/workbench?match=<matchId>&step=<step>`.
- Use applicant numbers or safe labels before bio review opens.
- Use names only after bio review opens.
- Record send timestamp and failure reason in Convex.

## Shared Placeholders

- `{{recipientName}}`
- `{{requesterName}}`
- `{{candidateLabel}}`
- `{{applicantPortalUrl}}`
- `{{managementReviewUrl}}`
- `{{keepOpenExpiresAt}}`
- `{{matchStatus}}`
- `{{contactName}}`
- `{{contactEmail}}`
- `{{contactPhone}}`
- `{{supportEmail}}`

## 1. Initial Interest

### New Inbound Interest To Recipient

Subject: `You have a new 1 Plus 1 interest`

Body:

```text
Assalamu Alaikum {{recipientName}},

You have received a new interest through 1 Plus 1.

Please log in to your applicant portal to review the interest and choose one of the available options: Accept, Decline, or Keep Open.

Review your interest:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Outbound Interest Confirmation To Requester

Subject: `Your 1 Plus 1 interest was sent`

Body:

```text
Assalamu Alaikum {{requesterName}},

Your interest has been submitted.

You can log in anytime to check the current status. We will notify you when there is an update or when action is needed from you.

View status:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Management Initial Interest Notice

Subject: `New interest needs review`

Body:

```text
A new interest has been created in the 1 Plus 1 matching flow.

Open management review:
{{managementReviewUrl}}
```

### Female Private Interest Confirmation

Subject: `Your private interest note was saved`

Body:

```text
Assalamu Alaikum {{recipientName}},

Your interest note has been saved privately.

This does not notify the other participant and does not mean an interest has been sent. It helps the 1 Plus 1 team understand your preferences and follow up thoughtfully.

View your dashboard:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Management Female Private Interest Notice

Subject: `Private interest documented`

Body:

```text
A female participant documented a private interest. This is visible only to her and management unless management decides to act on it.

Open management review:
{{managementReviewUrl}}
```

## 2. Interest Responses

### Interest Accepted

Subject: `Your 1 Plus 1 interest was accepted`

Body:

```text
Assalamu Alaikum {{requesterName}},

Your interest was accepted. The bio-review step is now open.

You can now review the shared bio details and choose whether to give final approval.

Review next step:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Interest Declined

Subject: `A 1 Plus 1 interest update`

Body:

```text
Assalamu Alaikum {{requesterName}},

The interest in {{candidateLabel}} has been closed.

You may now continue with another eligible interest when available.

View your status:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Interest Kept Open

Subject: `Your 1 Plus 1 interest is still open`

Body:

```text
Assalamu Alaikum {{requesterName}},

Your interest is still open. The recipient has not made a final decision yet.

If there is no response by {{keepOpenExpiresAt}}, the interest may expire and your queue status may update.

View your status:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Final Approval Requested

Subject: `Final approval requested for your 1 Plus 1 match`

Body:

```text
Assalamu Alaikum {{recipientName}},

The bio-review step is ready for your final decision.

Please log in to review the bio and choose whether you want to give final approval.

Review final approval:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Final Approval Declined

Subject: `A 1 Plus 1 match update`

Body:

```text
Assalamu Alaikum {{recipientName}},

This match flow has been closed after final review.

No contact information or photos have been shared.

View your status:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Photo Request Received

Subject: `Photo request for your 1 Plus 1 match`

Body:

```text
Assalamu Alaikum {{recipientName}},

The other participant has requested to view photos.

Please log in to approve or decline the picture request. If you decline, photos will stay hidden, but the match can still proceed after final approvals.

Respond to photo request:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Photo Request Approved

Subject: `Photos are now visible for your 1 Plus 1 match`

Body:

```text
Assalamu Alaikum {{recipientName}},

The picture request was approved. Approved photos are now visible in the applicant portal.

View match:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Photo Request Declined

Subject: `Photo request update for your 1 Plus 1 match`

Body:

```text
Assalamu Alaikum {{recipientName}},

The picture request was declined. Photos will stay hidden.

The match can still continue after both participants complete final approval.

View match status:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

## 3. Match Message And Contact Info Share

### Contact Info Shared

Subject: `Contact information is now available`

Body:

```text
Assalamu Alaikum {{recipientName}},

Both participants have completed final approval. Contact information is now available in your applicant portal.

Contact details:
Name: {{contactName}}
Email: {{contactEmail}}
Phone: {{contactPhone}}

Please continue communication respectfully and reach out to the 1 Plus 1 team if you need support.

View match:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Management Contact Shared Notice

Subject: `Contact shared for a 1 Plus 1 match`

Body:

```text
Contact information has been shared automatically after both participants gave final approval.

Open match:
{{managementReviewUrl}}
```

## 4. Follow-Up For No Response To Interest

### First Reminder

Subject: `Reminder: please respond to your 1 Plus 1 interest`

Body:

```text
Assalamu Alaikum {{recipientName}},

This is a reminder that you have an interest waiting for your response.

Please log in and choose Accept, Decline, or Keep Open.

Respond here:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Final Reminder Before Expiry

Subject: `Final reminder: your 1 Plus 1 interest may expire`

Body:

```text
Assalamu Alaikum {{recipientName}},

Your interest response is still pending.

If no response is received by {{keepOpenExpiresAt}}, this interest may expire so the queue can continue moving.

Respond here:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Management No-Response Notice

Subject: `Interest response follow-up needed`

Body:

```text
An interest has not received a response after the configured follow-up window.

Open management review:
{{managementReviewUrl}}
```

## 5. Follow-Up For Matched Participants

### Match Status Update

Subject: `Status update for your 1 Plus 1 match`

Body:

```text
Assalamu Alaikum {{recipientName}},

Your current match status is: {{matchStatus}}.

Please log in to see whether any action is needed from you.

View match:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Waiting On Other Participant

Subject: `Your 1 Plus 1 match is still in progress`

Body:

```text
Assalamu Alaikum {{recipientName}},

Your match is still in progress. We are waiting on the other participant or the next workflow step before contact information can be shared.

No action is needed from you right now unless your portal shows a pending request.

View match:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```

### Action Needed From Matched Participant

Subject: `Action needed for your 1 Plus 1 match`

Body:

```text
Assalamu Alaikum {{recipientName}},

There is an action waiting for you in the applicant portal.

Please log in to review the current match step and respond.

Review action:
{{applicantPortalUrl}}

Warmly,
Bader & Danielle
1 Plus 1 Leads
```
