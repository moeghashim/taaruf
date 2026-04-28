# Interest Management Flow Graphs

## Male Applicant Flow

```mermaid
flowchart TD
  A["Male applicant logs in"] --> B["Dashboard: outbound interests + status"]
  B --> C["Select allowed target by event/applicant number or management-approved safe suggestion"]
  C --> D["Send visible outbound interest"]
  D --> E["Female recipient sees inbound interest"]
  E --> F{"Female decision"}

  F -->|Decline| G["Interest closed"]
  G --> H["Male can pursue another eligible interest"]

  F -->|Keep Open| I["Interest remains pending until expiry"]
  I --> J{"Expired?"}
  J -->|No| E
  J -->|Yes| G

  F -->|Accept| K["Bio review opens"]
  K --> L["Names + bios visible to both candidates"]
  L --> M{"Both give final approval?"}
  M -->|One declines| G
  M -->|Both approve| N["Photo request optional"]

  N --> O{"Picture requested?"}
  O -->|No| P["Contact info shared automatically"]
  O -->|Yes| Q{"Other candidate approves picture?"}
  Q -->|Approve| R["Pictures visible to both"]
  R --> P
  Q -->|Decline| S["Pictures stay hidden"]
  S --> P

  P --> T["Match complete / contact shared"]
```

## Female Applicant Flow

```mermaid
flowchart TD
  A["Female applicant logs in"] --> B["Dashboard: inbound interests + private documented interests"]
  B --> C["May see multiple pending inbound interests from men"]
  C --> D{"Choose one inbound interest"}
  D --> E{"Female decision"}

  E -->|Decline| F["Interest closed"]
  E -->|Keep Open| G["Interest remains pending until expiry"]
  G --> H{"Expired?"}
  H -->|No| C
  H -->|Yes| F

  E -->|Accept| I{"Already in active bio review?"}
  I -->|Yes| J["Accepted interest waits in queue"]
  J --> C
  I -->|No| K["Bio review opens"]

  K --> L["Names + bios visible to both candidates"]
  L --> M{"Both give final approval?"}
  M -->|One declines| F
  M -->|Both approve| N["Photo request optional"]

  N --> O{"Picture requested?"}
  O -->|No| P["Contact info shared automatically"]
  O -->|Yes| Q{"Other candidate approves picture?"}
  Q -->|Approve| R["Pictures visible to both"]
  R --> P
  Q -->|Decline| S["Pictures stay hidden"]
  S --> P

  B --> U["Document private interest"]
  U --> V["Visible only to her and admins"]
  V --> W["Does not notify male applicant"]
  W --> X["Admins can use note for follow-up or recommendations"]

  P --> Y["Match complete / contact shared"]
```

## Rules Reflected

- Visible outbound interests are male-initiated.
- Women may see multiple pending inbound interests from men.
- Women can document private interests that are visible only to themselves and admins.
- Female-documented private interests do not notify men and do not open bio review by themselves.
- Names and bios become visible only when bio review opens.
- Contact sharing happens automatically after both final approvals.
- Photo decline does not block contact sharing.
- Keep Open expires after a fixed period.
- Each candidate can have only one active bio-review flow at a time.

