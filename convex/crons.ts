import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("purge match requests older than 24 h", { minuteUTC: 5 }, internal.matches.purgeRequests, {});
crons.daily("purge closed listings older than 30 days", { hourUTC: 9, minuteUTC: 15 }, internal.ingest.run.purgeClosed, {});
// Scheduled live ingest (Apify first) is off unless SCHEDULED_INGEST=1, so demo data stays put
// during judging. Manual runs still work: `npm run ingest`, scripts/build-seed.sh.
crons.daily("ingest public job boards", { hourUTC: 12, minuteUTC: 0 }, internal.ingest.run.scheduledRun, {});

export default crons;
