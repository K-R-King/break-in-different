import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("purge match requests older than 24 h", { minuteUTC: 5 }, internal.matches.purgeRequests, {});
crons.daily("purge closed listings older than 30 days", { hourUTC: 9, minuteUTC: 15 }, internal.ingest.run.purgeClosed, {});
// Free Apify credit is small, so live ingest runs once a day; run it by hand before the demo.
crons.daily("ingest public job boards", { hourUTC: 12, minuteUTC: 0 }, internal.ingest.run.run, {});

export default crons;
