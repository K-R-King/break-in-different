/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as ai_claude from "../ai/claude.js";
import type * as ai_practice from "../ai/practice.js";
import type * as ai_prompts from "../ai/prompts.js";
import type * as ai_templates from "../ai/templates.js";
import type * as ai_validators from "../ai/validators.js";
import type * as ai_voiceAgent from "../ai/voiceAgent.js";
import type * as ai_voiceAgentHttp from "../ai/voiceAgentHttp.js";
import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as ingest_accommodationForm from "../ingest/accommodationForm.js";
import type * as ingest_normalize from "../ingest/normalize.js";
import type * as ingest_rules from "../ingest/rules.js";
import type * as ingest_run from "../ingest/run.js";
import type * as ingest_sources from "../ingest/sources.js";
import type * as jobs from "../jobs.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_text from "../lib/text.js";
import type * as match_scorer from "../match/scorer.js";
import type * as match_skills from "../match/skills.js";
import type * as matches from "../matches.js";
import type * as profiles from "../profiles.js";
import type * as resume from "../resume.js";
import type * as seed from "../seed.js";
import type * as spikes from "../spikes.js";
import type * as stt from "../stt.js";
import type * as tts from "../tts.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  "ai/claude": typeof ai_claude;
  "ai/practice": typeof ai_practice;
  "ai/prompts": typeof ai_prompts;
  "ai/templates": typeof ai_templates;
  "ai/validators": typeof ai_validators;
  "ai/voiceAgent": typeof ai_voiceAgent;
  "ai/voiceAgentHttp": typeof ai_voiceAgentHttp;
  applications: typeof applications;
  auth: typeof auth;
  crons: typeof crons;
  emails: typeof emails;
  http: typeof http;
  "ingest/accommodationForm": typeof ingest_accommodationForm;
  "ingest/normalize": typeof ingest_normalize;
  "ingest/rules": typeof ingest_rules;
  "ingest/run": typeof ingest_run;
  "ingest/sources": typeof ingest_sources;
  jobs: typeof jobs;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/text": typeof lib_text;
  "match/scorer": typeof match_scorer;
  "match/skills": typeof match_skills;
  matches: typeof matches;
  profiles: typeof profiles;
  resume: typeof resume;
  seed: typeof seed;
  spikes: typeof spikes;
  stt: typeof stt;
  tts: typeof tts;
  voice: typeof voice;
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
