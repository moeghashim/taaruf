import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire unconfirmed event carryovers",
  { hours: 1 },
  internal.events.expireUnconfirmed,
  {}
);

export default crons;
