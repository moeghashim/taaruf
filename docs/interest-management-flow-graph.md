# Interest Management Flow Graphs

## Male Applicant Flow

```mermaid
flowchart TD
  A["Male applicant logs in"] --> B["Dashboard: outbound interests + status"]
  B --> C["Enter female applicant/event number"]
  C --> D["Submit visible outbound interest"]
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

  B --> U["Enter male applicant/event number"]
  U --> V["Document private interest"]
  V --> W["Visible only to her and admins before match"]
  W --> X["Does not notify male applicant before match"]
  X --> Z["Admins use note for assistance and mutuality tracking"]

  P --> Y["Match complete / contact shared"]
```

## Rules Reflected

- Visible outbound interests are male-initiated.
- Men and women express interest only by submitting the other person's applicant/event number.
- Women may see multiple pending inbound interests from men.
- Women can document private interests by submitting a man's applicant/event number.
- Female-documented private interests are visible only to women themselves and admins before match.
- Female-documented private interests do not notify men and do not open bio review by themselves before match.
- Once a match is in place, normal match visibility rules can show that mutual interest exists.
- Names and bios become visible only when bio review opens.
- Contact sharing happens automatically after both final approvals.
- Photo decline does not block contact sharing.
- Keep Open expires after a fixed period.
- Each candidate can have only one active bio-review flow at a time.
