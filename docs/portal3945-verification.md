# Portal corrections 3945 / 3948 / 3951 / 3955

Base: 748c50cefed2de3cd34cf5d18f8c028eb7a1c7b4 (PR153). PR149 3ceaf5a68f2303e2336062f446706bd8ecde8723 and PR150 4e0a3784e0a57e0074fd99fe0a15ec69d25e1836 verified ancestors. origin/main is a separate older lineage; do not replace the live baseline with it.

Causes and corrections:
- 3945: female-workflow detail projection only supported sister photos viewed by brothers. Sister views now honor the brother's existing global permission or a photo approval for this exact viewer/flow. No inferred approval from final decisions or contact release. Existing actor, archive, lifecycle, participant and sister-photo revocation gates retained.
- 3948: the original two-column workspace retained its 420px minimum height after the selected profile moved into the inline review above it. Active-review workspace is content-height and one column; an empty active workspace is hidden. Connection navigation remains.
- 3951: shared contact-released state copy rendered the two redundant notices. Omit those headings/copy without removing contact details or navigation.
- 3955: blanket male-to-female name redaction also hid the male sender's outbound target. Allow outbound target names only; inbound review anonymity stays intact. Blank names fall back to public applicant number.

Verification:
- Full Vitest suite; typecheck; production Next build; ESLint (0 errors, 13 existing warnings).
- Independent read-only security/correctness review found no concrete regression; recommended photo cases added afterward.
- Real isolated local Convex + Next handlers + cookie authentication, no API interception: brother-first, sister-first, brother-decline, sister-decline passed.
- Actual synthetic PNG uploaded to local storage: sister sees a loaded photo after brother final and before her final, at 390px/1280px; content-height workspace verified; both contact portals retain visible contacts and omit both notices after synthetic admin release.
- Follow-up reproduced both declined-history failures on exact baseline748c50c (390px and1280px). This was a real inherited UI defect, not a stale assertion: moving ReviewDecision inside the profile-only wrapper removed the viewer-owned receipt when closed reviews correctly withheld profile access. Restored the receipt only for selected closed rows without a profile, preserving hidden photos/bio/contacts/actions. Original assertions retained and strengthened (single receipt; no photos/bio/profile heading). All8 outbound browser cases now pass.
- Private local evidence: ~/taaruf/privateops/photo3945-fullstack/{photo.log,proof-candidate.log,photo-before-sister-final-390.png,photo-before-sister-final-1280.png,contacts-*.png}. Initial archive patch application did not modify files because git resolved the enclosing repository; copied exact changed files from the candidate and reran the candidate proofs successfully. Initial baseline proof is not candidate evidence. Legacy proof.json metadata inherits an older SHA and is not a provenance receipt.
- Screenshots captured by Playwright. Model image inspection was blocked by the allowed-media-directory policy; no bypass attempted.

Release boundary: preview only. No production backend deploy, live deployment, real data mutation, email, signing, or config change. Hosted frontend preview is UI-review-only until a compatible isolated hosted backend is verified. Do not use real submissions.

## Follow-up privacy review — approval blocked on identity scope

Independent protected-state review found a new name exposure on ordinary dashboard rows whose flow/match was unavailable even though an explicit connection request rejected them. Added per-row exact flow participant/lifecycle and attached match/link integrity gates. Nine backend plus route-response regression cases cover missing/mismatched/closed/declined flow and missing/mismatched/closed/declined/reset match. No bio/contact/photo gate is used as a substitute for identity authorization.

Product clarification is still required: should names be allowed on all valid male outbound origins (including admin-entered/email/WhatsApp/legacy), or only verified applicant submissions? A named reciprocal outbound row can correlate an otherwise name-free inbound review by public applicant number. Therefore the candidate guarantees omission of names from inbound payloads, NOT universal inbound anonymity. Do not approve/release until this scope is explicitly resolved.

Closed-history repair: outbound browser8/8, adjacent brother-final11/11; original assertions retained. Full suite1399 tests passed after added identity guards; exact logs under privateops/photo3945-privacy-tests.log. Types/lint/build rerun.

Image inspection remains blocked: repository paths are rejected by view_image; native read returns an image descriptor without pixels in this runtime and no browser screenshot tool is exposed. Requested permission, not exercised: copy only synthetic screenshot files photo-before-sister-final-390.png, photo-before-sister-final-1280.png, contacts-brother-390.png, contacts-brother-1280.png, contacts-sister-390.png, contacts-sister-1280.png from /Users/moeghashim/taaruf/privateops/photo3945-fullstack/ to /Users/moeghashim/.openclaw/media/outbound/photo3945-review/ for view_image inspection. No outside-repository copies performed.

Backend release scope if eventually approved: query projections in convex/applicantInterests.ts and convex/femaleInterestWorkflow.ts only; no schema, migration, new endpoint, consent mutation, email, scheduler, or config change. Hosted preview remains UI-review-only; no real submissions.
