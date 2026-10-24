// Job collection: Apify Store Actor first, direct fetch of the same public board APIs second.
// Only documented public endpoints. Terms review per source: docs/sources.md (sign-off: Roman).
import { htmlToText } from "../lib/text";
import { findAccommodationForm, type AccommodationForm } from "./accommodationForm";

export interface BoardRef {
  slug: string;
  name: string;
  boardType: "greenhouse" | "lever";
  boardToken: string;
}

// Proposed curated list (probed 2026-10-24: each board is public and lists CS roles).
// PROVISIONAL: pending Roman's terms sign-off in docs/sources.md.
export const EMPLOYERS: BoardRef[] = [
  ...[
    ["stripe", "Stripe"], ["coinbase", "Coinbase"], ["airbnb", "Airbnb"], ["figma", "Figma"], ["discord", "Discord"],
    ["robinhood", "Robinhood"], ["databricks", "Databricks"], ["cloudflare", "Cloudflare"], ["gitlab", "GitLab"],
    ["duolingo", "Duolingo"], ["reddit", "Reddit"], ["asana", "Asana"], ["instacart", "Instacart"], ["pinterest", "Pinterest"],
    ["lyft", "Lyft"], ["datadog", "Datadog"], ["mongodb", "MongoDB"], ["elastic", "Elastic"], ["gusto", "Gusto"],
    ["affirm", "Affirm"], ["doordashusa", "DoorDash"],
  ].map(([token, name]) => ({ slug: token, name, boardType: "greenhouse" as const, boardToken: token })),
  ...[
    ["palantir", "Palantir"], ["spotify", "Spotify"], ["zoox", "Zoox"], ["matchgroup", "Match Group"],
  ].map(([token, name]) => ({ slug: token, name, boardType: "lever" as const, boardToken: token })),
];

export interface RawListing {
  source: "greenhouse" | "lever";
  boardToken: string;
  externalId: string;
  title: string;
  location: string;
  workplaceHint?: string;
  descriptionText: string;
  applyUrl: string;
  sourceUrl: string;
  sourceUpdatedAt?: number;
  accommodationForm?: AccommodationForm; // found in the listing HTML before it becomes text
}

const UA = "BreakInDifferent/0.1 (Cal Hacks 13.0 project; job search for applicants with accessibility needs)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Light list first (titles only), then full content for the kept jobs, one request per second.
export async function fetchGreenhouse(token: string, keep: (title: string) => boolean, max: number): Promise<RawListing[]> {
  const t = encodeURIComponent(token);
  const list = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs`)) as { jobs?: { id: number; title: string }[] };
  const picked = (list.jobs ?? []).filter((j) => keep(j.title)).slice(0, max);
  const out: RawListing[] = [];
  for (const p of picked) {
    await sleep(1000);
    try {
      const j = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs/${p.id}`)) as {
        id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; updated_at?: string;
      };
      out.push({
        source: "greenhouse",
        boardToken: token,
        externalId: String(j.id),
        title: j.title,
        location: j.location?.name ?? "",
        descriptionText: htmlToText(j.content ?? ""),
        accommodationForm: findAccommodationForm(j.content ?? "") ?? undefined,
        applyUrl: j.absolute_url,
        sourceUrl: j.absolute_url,
        sourceUpdatedAt: j.updated_at ? Date.parse(j.updated_at) : undefined,
      });
    } catch {
      /* skip one job, keep the board */
    }
  }
  return out;
}

export async function fetchLever(site: string, keep: (title: string) => boolean, max: number): Promise<RawListing[]> {
  type Posting = {
    id: string;
    text: string;
    categories?: { location?: string };
    workplaceType?: string;
    hostedUrl: string;
    applyUrl?: string;
    description?: string;
    descriptionPlain?: string;
    lists?: { text: string; content: string }[];
    additional?: string;
    additionalPlain?: string;
    createdAt?: number;
  };
  let postings = (await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`)) as Posting[];
  if (Array.isArray(postings) && postings.length === 0) {
    // Try the EU host when the US host returns an empty board.
    await sleep(1000);
    postings = (await getJson(`https://api.eu.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`)) as Posting[];
  }
  return (postings ?? []).filter((p) => keep(p.text)).slice(0, max).map((p) => ({
    source: "lever",
    boardToken: site,
    externalId: p.id,
    title: p.text,
    location: p.categories?.location ?? "",
    workplaceHint: p.workplaceType,
    descriptionText: [
      p.descriptionPlain ?? "",
      ...(p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
      p.additionalPlain ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    accommodationForm: findAccommodationForm([p.description ?? "", ...(p.lists ?? []).map((l) => l.content), p.additional ?? ""].join("\n")) ?? undefined,
    applyUrl: p.applyUrl ?? p.hostedUrl,
    sourceUrl: p.hostedUrl,
    sourceUpdatedAt: p.createdAt,
  }));
}

// Direct fetch of one board, at about 1 request per second.
export async function fetchBoardDirect(b: BoardRef, keep: (title: string) => boolean, max: number): Promise<RawListing[]> {
  return b.boardType === "greenhouse" ? fetchGreenhouse(b.boardToken, keep, max) : fetchLever(b.boardToken, keep, max);
}

// Apify Store Actor: bovi/greenhouse-lever-ashby-job-scraper (input schema read 2026-10-24).
// PROVISIONAL: S4 — confirm output field names with a real run once APIFY_TOKEN is set.
export const APIFY_ACTOR = "bovi~greenhouse-lever-ashby-job-scraper";

export async function fetchViaApify(boards: BoardRef[], maxJobsPerCompany: number): Promise<{ listings: RawListing[]; okBoards: string[]; rowCount: number; fieldNames: string[] }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("NO_TOKEN");
  const res = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?timeout=280`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      companies: boards.map((b) => ({ ats: b.boardType, company: b.boardToken })),
      maxJobsPerCompany,
      includeDescriptions: true,
      outputProfile: "compact",
    }),
  });
  if (!res.ok) throw new Error(`APIFY_HTTP_${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const listings: RawListing[] = [];
  for (const r of rows) {
    const ats = str(r.ats).toLowerCase();
    if (ats !== "greenhouse" && ats !== "lever") continue;
    const boardToken = str(r.company_slug ?? r.company);
    const url = str(r.url ?? r.apply_url);
    const text = str(r.description_text ?? r.description ?? r.description_plain) || htmlToText(str(r.description_html));
    if (!url || !text) continue;
    listings.push({
      source: ats,
      boardToken: boards.find((b) => b.boardToken === boardToken || b.name.toLowerCase() === boardToken.toLowerCase())?.boardToken ?? boardToken,
      externalId: str(r.job_id ?? r.id ?? r.global_id ?? url),
      title: str(r.title),
      location: str(r.location),
      workplaceHint: str(r.remote_type),
      descriptionText: text,
      accommodationForm: findAccommodationForm(str(r.description_html)) ?? undefined, // only when the Actor returns HTML
      applyUrl: str(r.apply_url ?? url),
      sourceUrl: url,
      sourceUpdatedAt: r.posted_at ? Date.parse(str(r.posted_at)) : undefined,
    });
  }
  return { listings, okBoards: [...new Set(listings.map((l) => l.boardToken))], rowCount: rows.length, fieldNames: Object.keys(rows[0] ?? {}).sort() };
}
