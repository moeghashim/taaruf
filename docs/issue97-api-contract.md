# Issue97 backend contract
New module api.matchmakerMatching:
- getMine({sessionHash}) -> {optedIn:boolean, consentUpdatedAt?:number, matches:[{_id,status,presentedAt?,contactShared:boolean,canWithdraw:boolean,myApproval:boolean,partnerApproval:boolean,myFollowup?,partnerFollowup?,withdrawnAt?, partner:{publicApplicantNumber?,age,gender,maritalStatus,education,job,ethnicity?,prayerCommitment?,hijabResponse?,spouseRequirement1?,spouseRequirement2?,spouseRequirement3?,shareableBio?,images:[{url,storageId}],name?,email?,phone?}}]}. Contacts/name only after release, photos only explicit global yes. Drafts excluded. Includes historical manual contact-shared records.
- setConsent({sessionHash,optedIn:boolean}) -> null. Independent of matches.
- approve({sessionHash,matchId}) -> null; explicit per-applicant contact approval.
- withdraw({sessionHash,matchId}) -> null; forbidden once contacts released.
- followup({sessionHash,matchId,status:contact_made|getting_to_know|not_proceeding|engaged}) -> null; only contact-shared records. Admin stored followup object {status,authorRegistrationId,updatedAt}; applicant projections expose only {status,updatedAt}.
Admin:
- present({adminSecret,matchId}) -> {alreadyPresented:boolean}; atomic both optin/eligibility recheck, portal notifications inserted once per participant, no emails sent by mutation.
- releaseContacts({adminSecret,matchId}) -> null; both explicit approvals plus admin release, also wired existing matches.updateStatus contact_shared.
- claimNotification({adminSecret,matchId,recipientId}) -> null or {deliveryId,key,email,name}; one permanent claim (no automatic retry after uncertain send); presentation only. Must call for each participant before sending approved notification email. Keys stable matchmaker:<matchId>:<recipientId>.
- recordNotification({adminSecret,deliveryId,sent:boolean}) -> null. Records sent/failed; failed/claimed never auto retries.
matches.getAll/getWorkbench include additive fields matchmakerPresentedAt, maleMatchmakerApprovalAt/femaleMatchmakerApprovalAt, maleFollowup/femaleFollowup, matchmakerWithdrawnAt/By; registrations.backgroundMatchmakingOptIn and backgroundMatchmakingConsentUpdatedAt. Draft creation unchanged.
No production deployment; no live sends. Portal presentation itself is durable notification; email integration must respect existing email rollout restrictions.
