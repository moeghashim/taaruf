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

// Chicago midnight occurs at 05:00 or 06:00 UTC, depending on DST.
crons.cron("advance birthday calendar", "0 5,6 * * *", internal.birthdays.tick, {});
crons.interval("deliver profile rejection notices", { minutes: 1 }, internal.profileRejectionNotice.drain, {});

export default crons;
