import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire unconfirmed event carryovers",
  { hours: 1 },
  api.events.expireUnconfirmed,
  {}
);

export default crons;
