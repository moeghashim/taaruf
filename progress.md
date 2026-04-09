# Progress Log

Append-only learning log for commits and deploys. Add new entries only at the end of this file. Do not edit or delete previous entries.

## Entry Template

## <ISO timestamp>
- Trigger: <commit|deploy>
- Learning: <required learning>
- Context: <commit message or release bump/version>
- Branch: <branch>
- Actor: <git user.name <git user.email>>
- Changed Paths:
  - <path> (commit entries only)

## 2026-04-09T19:13:00.000Z
- Trigger: commit
- Learning: Starting each repo with its own append-only progress log makes parallel website work easier to track without mixing histories across projects.
- Context: docs(progress): add append-only progress log
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - progress.md
## 2026-04-09T19:23:22.000Z
- Trigger: commit
- Learning: Making core narrative fields mandatory improves registration quality and gives the team enough context to review applicants meaningfully.
- Context: feat(register): require about me field
- Branch: main
- Actor: Moe Ghashim <mohanadgh@gmail.com>
- Changed Paths:
  - src/components/registration-form.tsx
  - progress.md
