# Interest Management Flow Graph

```mermaid
flowchart TD
  A["Applicant logs in"] --> B["Dashboard: Inbound + Outbound Interests"]

  B --> C{"Has pending inbound interest?"}

  C -->|Yes| D["Inbound Interest"]
  D --> E{"Recipient decision"}
  E -->|Decline| F["Interest closed"]
  E -->|Keep Open| G["Interest stays open until expiry"]
  G --> H{"Expired?"}
  H -->|Yes| F
  H -->|No| D

  E -->|Accept| I["Bio review opens"]
  I --> J["Names + bios visible to both candidates"]
  J --> K{"Both give final approval?"}
  K -->|No, one declines| F
  K -->|Yes| L["Photo request optional"]

  L --> M{"Picture requested?"}
  M -->|No| N["Contact info shared automatically"]
  M -->|Yes| O{"Other candidate approves picture?"}
  O -->|Approve| P["Pictures visible to both"]
  P --> N
  O -->|Decline| Q["Pictures stay hidden"]
  Q --> N

  C -->|No| R["Can initiate outbound interest"]
  R --> S["Only existing inbound interests or management-approved safe suggestions"]
  S --> T["Outbound interest sent"]
  T --> I

  N --> U["Match complete / contact shared"]
  F --> V["Requester can pursue another eligible interest"]
```

## Rules Reflected

- Applicants cannot browse profiles that have not shown interest.
- Names and bios become visible only when bio review opens.
- Contact sharing happens automatically after both final approvals.
- Photo decline does not block contact sharing.
- Keep Open expires after a fixed period.
- Each candidate can have only one active bio-review flow at a time.

