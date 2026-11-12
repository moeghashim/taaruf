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
- Additional mocked navigation suite: 6 passed; 2 pre-existing declined-history assertions expect a receipt absent from the current PR153 rendering. Not described as fully green.
- Private local evidence: ~/taaruf/privateops/photo3945-fullstack/{photo.log,proof-candidate.log,photo-before-sister-final-390.png,photo-before-sister-final-1280.png,contacts-*.png}. Initial archive patch application did not modify files because git resolved the enclosing repository; copied exact changed files from the candidate and reran the candidate proofs successfully. Initial baseline proof is not candidate evidence. Legacy proof.json metadata inherits an older SHA and is not a provenance receipt.
- Screenshots captured by Playwright. Model image inspection was blocked by the allowed-media-directory policy; no bypass attempted.

Release boundary: preview only. No production backend deploy, live deployment, real data mutation, email, signing, or config change. Hosted frontend preview is UI-review-only until a compatible isolated hosted backend is verified. Do not use real submissions.
