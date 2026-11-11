import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire unconfirmed event carryovers",
  { hours: 1 },
  internal.events.expireUnconfirmed,
  {}
);

crons.interval("deliver female workflow outbox", { minutes: 1 }, internal.femaleWorkflowDelivery.drain, {});

crons.interval("deliver profile rejection notices", { minutes: 1 }, internal.profileRejectionNotice.drain, {});

export default crons;
