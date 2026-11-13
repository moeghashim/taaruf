/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as profileContentCopy from "../profileContentCopy.js";
import type * as reopen315 from "../reopen315.js";
import type * as birthdays from "../birthdays.js";
import type * as adminAuthorization from "../adminAuthorization.js";
import type * as adminEmailChange from "../adminEmailChange.js";
import type * as adminPairTestReset from "../adminPairTestReset.js";
import type * as applicantAuth from "../applicantAuth.js";
import type * as applicantInterests from "../applicantInterests.js";
import type * as applicantProfile from "../applicantProfile.js";
import type * as archive from "../archive.js";
import type * as archiveRules from "../archiveRules.js";
import type * as brotherReviewActivation from "../brotherReviewActivation.js";
import type * as capabilitySecurity from "../capabilitySecurity.js";
import type * as contactGate from "../contactGate.js";
import type * as crons from "../crons.js";
import type * as eventAttendees from "../eventAttendees.js";
import type * as eventCapacity from "../eventCapacity.js";
import type * as eventRules from "../eventRules.js";
import type * as events from "../events.js";
import type * as femaleInterestWorkflow from "../femaleInterestWorkflow.js";
import type * as femaleWorkflowDelivery from "../femaleWorkflowDelivery.js";
import type * as hijab from "../hijab.js";
import type * as imageAuthorization from "../imageAuthorization.js";
import type * as interestIdentity from "../interestIdentity.js";
import type * as interestRules from "../interestRules.js";
import type * as interestTestReset from "../interestTestReset.js";
import type * as interests from "../interests.js";
import type * as matches from "../matches.js";
import type * as matchmakerMatching from "../matchmakerMatching.js";
import type * as migrations_profileCompletion from "../migrations/profileCompletion.js";
import type * as migrations_publicApplicantNumbers from "../migrations/publicApplicantNumbers.js";
import type * as pairTestReset from "../pairTestReset.js";
import type * as photoUploads from "../photoUploads.js";
import type * as profileRejectionNotice from "../profileRejectionNotice.js";
import type * as profileShares from "../profileShares.js";
import type * as registrationNumbers from "../registrationNumbers.js";
import type * as registrations from "../registrations.js";
import type * as settings from "../settings.js";
import type * as singleInterestTestReset from "../singleInterestTestReset.js";
import type * as zClearAprilLegacy from "../zClearAprilLegacy.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  profileContentCopy: typeof profileContentCopy;
  reopen315: typeof reopen315;
  birthdays: typeof birthdays;
  adminAuthorization: typeof adminAuthorization;
  adminEmailChange: typeof adminEmailChange;
  adminPairTestReset: typeof adminPairTestReset;
  applicantAuth: typeof applicantAuth;
  applicantInterests: typeof applicantInterests;
  applicantProfile: typeof applicantProfile;
  archive: typeof archive;
  archiveRules: typeof archiveRules;
  brotherReviewActivation: typeof brotherReviewActivation;
  capabilitySecurity: typeof capabilitySecurity;
  contactGate: typeof contactGate;
  crons: typeof crons;
  eventAttendees: typeof eventAttendees;
  eventCapacity: typeof eventCapacity;
  eventRules: typeof eventRules;
  events: typeof events;
  femaleInterestWorkflow: typeof femaleInterestWorkflow;
  femaleWorkflowDelivery: typeof femaleWorkflowDelivery;
  hijab: typeof hijab;
  imageAuthorization: typeof imageAuthorization;
  interestIdentity: typeof interestIdentity;
  interestRules: typeof interestRules;
  interestTestReset: typeof interestTestReset;
  interests: typeof interests;
  matches: typeof matches;
  matchmakerMatching: typeof matchmakerMatching;
  "migrations/profileCompletion": typeof migrations_profileCompletion;
  "migrations/publicApplicantNumbers": typeof migrations_publicApplicantNumbers;
  pairTestReset: typeof pairTestReset;
  photoUploads: typeof photoUploads;
  profileRejectionNotice: typeof profileRejectionNotice;
  profileShares: typeof profileShares;
  registrationNumbers: typeof registrationNumbers;
  registrations: typeof registrations;
  settings: typeof settings;
  singleInterestTestReset: typeof singleInterestTestReset;
  zClearAprilLegacy: typeof zClearAprilLegacy;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
