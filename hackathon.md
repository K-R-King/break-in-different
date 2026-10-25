# Hackathon log

- **Project:** Break In Different
- **Event:** Cal Hacks 13.0
- **What it does:** Helps job seekers with accessibility needs find CS roles, see each listing's accommodation information with quoted evidence, and draft accommodation emails they approve themselves.
- **Live app:** https://breakindifferent.com
- **Repo:** https://github.com/K-R-King/break-in-different
- **Frontend:** Other (nginx container on our own server behind an HTTPS proxy, `docker/web.Dockerfile`)
- **Convex deployment:** not deployed on Convex Cloud; self-hosted Convex backend (`docker-compose.yml`), API at https://api.breakindifferent.com
- **Components:** none
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, crons, scheduled functions, file storage, realtime useQuery
- **Auth:** Convex Auth (Password provider, `convex/auth.ts`)
- **AI models:** claude-haiku-5-5, claude-sonnet-5-5
- **Started:** 2026-10-24T00:33:54Z
- **Last updated:** 2026-10-25T08:30:13Z

## How we use Convex

- **Job matching:** an action queues a request; the Python MatchAgent claims it and posts scores via HTTP actions (`/agent/claim`, `/agent/result`), else a fallback mutation scores; Claude explanations are scheduled. `convex/matches.ts`, `convex/http.ts`
- **Listings pipeline:** an internal action ingests public job boards, upserts into indexed tables, and schedules Claude extraction in batches; crons purge closed listings and old match requests. `convex/ingest/run.ts`, `convex/crons.ts`, `convex/schema.ts`
- **Resume to skills:** the browser uploads the PDF to file storage (`generateUploadUrl`) and an action reads it. `convex/resume.ts`
- **Read-aloud and practice interviews:** actions call Cartesia and keep interviewer audio in file storage for a short time. `convex/tts.ts`, `convex/ai/practice.ts`
- **Voice assistant:** an HTTP action streams Claude replies and page actions to the browser. `convex/ai/voiceAgentHttp.ts`
- **Live screens:** Jobs, Tracker, Email, Profile, Practice and the accessibility settings read through `useQuery`, so match results, application status and saved preferences update without a refresh. `src/routes/JobsPage.tsx`, `src/routes/TrackerPage.tsx`

## Log

- 2026-10-24 `2e57478` Initial commit: `README.md`
- 2026-10-24 `ad1fa74` Base app: React, Convex schema and functions, MatchAgent, Docker Compose: `convex/`, `src/`, `agent/`
- 2026-10-24 `46e68b4` API key setup and integration check: `.env.example`, `convex/spikes.ts`
- 2026-10-24 `becab7b` Demo account in the seed: `convex/seed.ts`
- 2026-10-24 `ee3faf0` Interview practice with Claude and Cartesia: `convex/ai/practice.ts`
- 2026-10-24 `93d5661` UI improvements: `convex/schema.ts`, `convex/profiles.ts`
- 2026-10-24 `b914dc4` Practice questions in advance: `convex/ai/practice.ts`
- 2026-10-24 `547f394` Accommodation form detection, refreshed seed: `convex/ingest/`, `convex/crons.ts`
- 2026-10-24 `2de4bb1` Jobs with a form first, form filter: `convex/matches.ts`
- 2026-10-24 `1835497` Conflict filter, accommodation contacts: `convex/jobs.ts`, `convex/lib/accommodationContact.ts`
- 2026-10-24 `6520255` Live voice control: `convex/voice.ts`, `src/voice/live/`
- 2026-10-24 `23413b0` Speech matched to page controls: `src/voice/intent/`
- 2026-10-24 `99a5894` Statistics carousel on Home: `src/components/StatsCarousel.tsx`
- 2026-10-25 `9f917a6` Every page voiceable, read jobs aloud: `src/routes/`
- 2026-10-25 `c46c361` Demo without Docker: `scripts/demo.sh`
- 2026-10-25 `6d73aaa` Conversational voice assistant (Claude Haiku): `convex/ai/voiceAgent.ts`
- 2026-10-25 `9822340` Store accommodation emails from listings: `convex/schema.ts`, `convex/ingest/run.ts`
- 2026-10-25 `fc6ed4f` Hero marquee: `src/components/StatsCarousel.tsx`
- 2026-10-25 `63ba98a` Open the demo from another machine: `docker-compose.yml`
- 2026-10-25 `8ae9784` Serve on a domain behind HTTPS: `docker-compose.yml`, `docker/nginx.conf`
