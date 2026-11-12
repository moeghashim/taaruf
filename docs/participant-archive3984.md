# Participant archive UI temporarily hidden (3984)

The participant `/me` shell no longer mounts the shared ArchiveParticipant card. This covers all four portal views and legacy hash aliases, both genders, and active/archived profiles. Removing the whole card also removes **Restore availability** and its dialog from participant entry points; leaving restore would retain the same participant archive-management surface. Existing archived notices and read-only/eligibility gating continue to use the server-provided archivedAt. The now-unused optimistic local archive override is removed.

This is UI-only, not API access revocation. Shared admin card, admin actions, applicant/admin API endpoints, Convex handlers, history, archived records, capacity and refund/email logic are untouched. Event Withdraw and background matchmaking consent are unchanged. No data migration or real state changes are part of this patch. Admin API investigation 3983 is separate and is not fixed or superseded here.

Regression coverage replaces the obsolete participant self-archive/restore and bottom-placement browser expectations with a synthetic no-card/no-action matrix: male/female, active/archived, desktop1440/mobile390/narrow320, all eight portal hashes. Archived notices, consent disabled state and event withdrawal/dismiss are checked. Every API response is synthetic; writes, external requests and WebSockets are blocked. Unit source contracts additionally retain the admin entry.

Preview only; production requires new coordinated approval. No isolated hosted backend is provided: use preview for UI review only, with no real submissions. Base: c45880fed33b2718984216d4f8de2e0f2782f5d7.
