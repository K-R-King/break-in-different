import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ACCOMMODATION_CODES, ACCOMMODATION_HINTS, ACCOMMODATION_LABELS, EXPERIENCE_FILTER_OPTIONS, EXPERIENCE_LABELS, LIMITS, ROLE_LABELS } from "../../shared/taxonomy";
import type { AccommodationInfo } from "../../shared/types";
import { COPY } from "../copy";
import { PageHeading, useDocumentTitle } from "../a11y/PageHeading";
import { useAnnounce } from "../a11y/Announcer";
import { usePrefs } from "../a11y/prefs";
import { AccommodationRow, LabelBadge, sourceName, timeAgo } from "../components/Accommodation";
import { Icon } from "../components/Icon";
import { HighlightedText, useReader } from "../voice/reader";
import { useVoiceHandlers } from "../voice/VoiceProvider";
import { useVoiceActions, type VoiceAction } from "../voice/intent/actions";
import { reveal } from "../voice/intent/scroll";
import { ACCOMMODATION_VOICE, voiceNames } from "../voice/vocabulary";
import { toAppError } from "../lib/errors";
import { useFitLayout } from "../lib/useFitLayout";

const MIN_COLUMN_HEIGHT = 360;

type Item = NonNullable<ReturnType<typeof useQuery<typeof api.matches.list>>>["items"][number];

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export default function JobsPage() {
  useDocumentTitle(COPY.jobs.title);
  const navigate = useNavigate();
  const announce = useAnnounce();
  const profile = useQuery(api.profiles.get);
  const saveProfile = useMutation(api.profiles.save);
  const run = useAction(api.matches.run);
  const saveJob = useMutation(api.applications.save);
  const unsaveJob = useMutation(api.applications.unsave);
  const reader = useReader();
  const { prefs } = usePrefs();

  const [workSetup, setWorkSetup] = useState<"remote" | "onsite" | "any">("any");
  const [locationText, setLocationText] = useState("");
  const [experience, setExperience] = useState<string[]>([]);
  const [hideConflicts, setHideConflicts] = useState(false);
  const [formOnly, setFormOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const autoRan = useRef(false);

  const data = useQuery(api.matches.list, {
    workSetup, locationText: locationText.trim() || undefined, hideConflicts: hideConflicts || undefined,
    experience: experience.length ? experience : undefined, search: search.trim() || undefined, hasForm: formOnly || undefined,
  });
  // When the accommodation filters leave nothing, the same search without them offers a way forward.
  const accFiltersOn = hideConflicts || formOnly;
  const unfiltered = useQuery(
    api.matches.list,
    data && data.items.length === 0 && accFiltersOn
      ? { workSetup, locationText: locationText.trim() || undefined, experience: experience.length ? experience : undefined, search: search.trim() || undefined }
      : "skip",
  );
  const topUnfiltered = unfiltered?.items[0];

  const doRun = async () => {
    setRunning(true);
    setRunError("");
    announce(COPY.jobs.finding);
    try {
      await run({});
    } catch (e) {
      setRunError(toAppError(e).message);
    } finally {
      setRunning(false);
    }
  };

  // First visit with a complete profile: find jobs straight away.
  useEffect(() => {
    if (autoRan.current || !data || !profile) return;
    if (!data.hasRun && profile.skills.length && profile.roleIds.length) {
      autoRan.current = true;
      void doRun();
    }
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  useEffect(() => {
    if (!items.length) return;
    if (!selected || !items.some((i) => i.jobId === selected)) setSelected(items[0].jobId);
  }, [items, selected]);
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (!data || running) return;
    if (lastCount.current !== data.items.length) {
      lastCount.current = data.items.length;
      announce(data.items.length ? `${data.items.length} jobs found` : COPY.jobs.noneTitle);
    }
  }, [data, running, announce]);

  const selectedIndex = items.findIndex((i) => i.jobId === selected);
  const current = selectedIndex >= 0 ? items[selectedIndex] : null;

  // Brings the card into view in the list (clear of the sticky results bar) and focuses it.
  const focusCard = (jobId: string) => {
    const card = document.getElementById(`job-${jobId}`);
    if (!card) return;
    reveal(card);
    card.focus({ preventScroll: true });
  };
  const toggleSave = async (it: Item) => {
    try {
      if (it.saved) {
        await unsaveJob({ jobId: it.jobId });
        announce(`Removed ${it.job.title} from saved jobs`);
      } else {
        await saveJob({ jobId: it.jobId });
        announce(`Saved ${it.job.title}`);
      }
    } catch (e) {
      announce(toAppError(e).message, "assertive");
    }
  };
  const readJob = (it: Item, summary: string) => void reader.play(it.jobId, prefs.voiceReader ? "full" : "summary", summary);

  const nextItem = items[Math.min(items.length - 1, selectedIndex + 1)];
  const previousItem = items[Math.max(0, selectedIndex - 1)];
  const goTo = (it: Item | undefined) => { if (it) { setSelected(it.jobId); focusCard(it.jobId); announce(`${it.job.title} at ${it.job.employerName}`); } };
  // Voice: move through the results without naming a job ("next job", "top job", "the third one").
  const jumpTo = (i: number | (() => number), names: string[]): VoiceAction => {
    const at = () => (typeof i === "number" ? i : i());
    return {
      names, run: () => goTo(items[at()]), anchor: () => (items[at()] ? document.getElementById(`job-${items[at()].jobId}`) : null),
      message: () => (items[at()] ? `${items[at()].job.title} at ${items[at()].job.employerName}.` : ""), when: () => at() >= 0 && at() < items.length,
    };
  };
  useVoiceActions([
    { names: ["Next job", "next", "next one", "next listing", "skip this one"], run: () => goTo(nextItem), anchor: () => (nextItem ? document.getElementById(`job-${nextItem.jobId}`) : null),
      message: () => (nextItem ? `${nextItem.job.title} at ${nextItem.job.employerName}.` : "That was the last job."), when: () => items.length > 0 && selectedIndex < items.length - 1 },
    { names: ["Previous job", "previous", "previous one", "the one before"], run: () => goTo(previousItem), anchor: () => (previousItem ? document.getElementById(`job-${previousItem.jobId}`) : null),
      message: () => (previousItem ? `${previousItem.job.title} at ${previousItem.job.employerName}.` : "This is the first job."), when: () => selectedIndex > 0 },
    jumpTo(0, ["Top job", "first job", "top match", "best match", "the top one", "the first one", "top listing", "first listing", "job 1", "job one", "job number one"]),
    ...ORDINALS.slice(1).map((o, i) => jumpTo(i + 1, [`${o[0].toUpperCase()}${o.slice(1)} job`, `the ${o} one`, `${o} listing`, `${o} match`, `job ${i + 2}`, `job ${NUMBER_WORDS[i + 1]}`, `job number ${NUMBER_WORDS[i + 1]}`])),
    jumpTo(() => items.length - 1, ["Last job", "bottom job", "the last one", "last listing", "the bottom one"]),
  ]);

  useVoiceHandlers({
    next: () => goTo(nextItem),
    previous: () => goTo(previousItem),
    open: () => { document.getElementById("detail-heading")?.focus(); },
    read: () => { if (current) readJob(current, current.job.title); },
    stop: () => reader.stop(),
    save: () => { if (current) void toggleSave(current); },
    apply: () => { if (current) navigate(`/jobs/${current.jobId}/email`); },
  });

  const requiredSet = new Set(profile?.requiredAccommodations ?? []);
  const setRequired = async (code: (typeof ACCOMMODATION_CODES)[number], on: boolean) => {
    if (!profile) return;
    const req = on ? [...profile.requiredAccommodations, code] : profile.requiredAccommodations.filter((c) => c !== code);
    try {
      await saveProfile({
        skills: profile.skills, roleIds: profile.roleIds, requiredAccommodations: req,
        preferredAccommodations: profile.preferredAccommodations.filter((c) => !req.includes(c)),
        interface: profile.interface, locationText: profile.locationText, remotePreference: profile.remotePreference,
      });
      await doRun();
    } catch (e) {
      announce(toAppError(e).message, "assertive");
    }
  };

  const incomplete = profile !== undefined && (!profile || !profile.skills.length || !profile.roleIds.length);

  // Wide screens: the page stops scrolling and each column scrolls on its own (styles in base.css).
  const layoutRef = useRef<HTMLDivElement>(null);
  useFitLayout(layoutRef, { minWidth: 1100, minHeight: MIN_COLUMN_HEIGHT, enabled: !incomplete });

  return (
    <main id="main" className="container jobs-page" style={{ paddingBlock: "24px 40px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 1400 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: "16px 32px" }}>
        <div>
          <PageHeading>{COPY.jobs.title}</PageHeading>
          <p className="lede">{COPY.jobs.lede}</p>
        </div>
        <form role="search" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }} className="row" style={{ flex: "1 1 480px", maxWidth: 680, flexWrap: "nowrap", gap: 8 }}>
          <label htmlFor="q" className="sr-only">Search jobs by title, skill or company</label>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <span style={{ position: "absolute", left: 14, top: 16, color: "var(--muted)" }}><Icon name="search" /></span>
            <input className="input" id="q" type="search" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); if (!e.target.value) setSearch(""); }}
              placeholder="Job title, skill or company" style={{ paddingLeft: 44, minHeight: 52 }} />
          </div>
          <button className="btn btn-primary" type="submit" style={{ minHeight: 52 }}>Search</button>
        </form>
      </div>

      {incomplete ? (
        <div className="card" role="status">
          <h2 style={{ margin: 0 }}>Finish your profile first</h2>
          <p style={{ margin: 0 }}>Add at least one role and one skill so we can rank jobs for you.</p>
          <Link className="btn btn-primary" to="/profile" style={{ alignSelf: "flex-start" }}>Go to your profile</Link>
        </div>
      ) : (
        <div className="jobs-layout" ref={layoutRef}>
          <aside className="jobs-col side" aria-labelledby="flt-h">
            <div className="panel stack" style={{ gap: 18 }}>
              <h2 id="flt-h" style={{ margin: 0, fontSize: "1.2rem" }}>Filters</h2>
              <fieldset>
                <legend>Work setup</legend>
                {([["remote", "Remote"], ["onsite", "On-site or hybrid"], ["any", "Any"]] as const).map(([v, l]) => (
                  <label key={v} className="ck"><input type="radio" name="ws" checked={workSetup === v} onChange={() => setWorkSetup(v)} /><span>{l}</span></label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor="loc" className="label">Location contains</label>
                <input className="input" id="loc" type="text" value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="City, state or country" />
              </div>
              <fieldset>
                <legend>Experience level</legend>
                {EXPERIENCE_FILTER_OPTIONS.map((o) => (
                  <label key={o.value} className="ck">
                    <input type="checkbox" checked={experience.includes(o.value)} onChange={(e) => setExperience((x) => (e.target.checked ? [...x, o.value] : x.filter((y) => y !== o.value)))} />
                    <span>{o.label}</span>
                  </label>
                ))}
                <p className="hint">Jobs that do not state a level always stay in the list.</p>
              </fieldset>
            </div>

            <div className="panel stack" style={{ gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Workplace accommodations</h2>
              <p className="hint">Tick the ones you require. Each job shows whether its listing mentions them.</p>
              <fieldset>
                <legend className="sr-only">Required accommodations</legend>
                {ACCOMMODATION_CODES.map((code) => (
                  <label key={code} className="ck">
                    <input type="checkbox" checked={requiredSet.has(code)} disabled={!profile || running} onChange={(e) => void setRequired(code, e.target.checked)}
                      data-voice-names={voiceNames(ACCOMMODATION_VOICE[code])} />
                    <span>
                      {ACCOMMODATION_LABELS[code]}
                      {profile?.preferredAccommodations.includes(code) && <span className="muted"> (preferred)</span>}
                      {ACCOMMODATION_HINTS[code] && <span className="small muted" style={{ display: "block" }}>{ACCOMMODATION_HINTS[code]}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="ck" style={{ borderTop: "1px solid #e4e6eb", paddingTop: 14 }}>
                <input type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} />
                <span><strong>{COPY.jobs.conflictFilter}</strong><span className="small muted" style={{ display: "block" }}>{COPY.jobs.conflictFilterHint}</span></span>
              </label>
              <label className="ck">
                <input type="checkbox" checked={formOnly} onChange={(e) => setFormOnly(e.target.checked)} />
                <span><strong>{COPY.jobs.formFilter}</strong><span className="small muted" style={{ display: "block" }}>{COPY.jobs.formFilterHint}</span></span>
              </label>
              <Link to="/profile#s3" style={{ fontWeight: 600 }} data-voice-names="edit my accommodations|change my accommodations">Edit in your profile</Link>
            </div>
          </aside>

          <section className="jobs-col main" aria-labelledby="res-h" aria-busy={running || data === undefined} data-voice-scroll
            data-voice-names="results|job results|job list|the list|matches">
            <div className="row jobs-results-bar" style={{ justifyContent: "space-between", gap: 8 }}>
              <h2 id="res-h" style={{ margin: 0, fontSize: "1.2rem" }}>
                {running || data === undefined ? COPY.jobs.finding : `${items.length} jobs found`}
              </h2>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void doRun()} disabled={running} data-voice-names="refresh|refresh jobs|update matches|reload jobs">Refresh matches</button>
            </div>
            {/* One compact note above the list, so more of the list fits on screen. */}
            <div className="note stack" style={{ gap: 4 }}>
              {data?.engine === "fallback" && <p style={{ margin: 0 }} data-testid="notice-fallback"><strong>{COPY.jobs.scoredWithoutAgent}.</strong> Results come from our built-in scorer.</p>}
              {data?.usingSavedListings && <p style={{ margin: 0 }} data-testid="notice-saved"><strong>{COPY.jobs.usingSavedListings}.</strong> Listings were collected earlier; each card shows when it was checked.</p>}
              <p style={{ margin: 0 }}>{COPY.jobs.sortNote} {COPY.jobs.aiNote}</p>
            </div>
            {runError && (
              <div className="callout callout-error" role="alert">
                <Icon name="alert" /><span>{runError}</span>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => void doRun()}>{COPY.common.retry}</button>
              </div>
            )}
            {data && !running && items.length === 0 && accFiltersOn && (
              <div className="card" data-testid="filtered-empty">
                <h3 style={{ margin: 0 }}>{COPY.jobs.filteredEmptyTitle}</h3>
                <p style={{ margin: 0 }}>{COPY.jobs.filteredEmptyBody}</p>
                <div className="row">
                  <button className="btn btn-primary" type="button" onClick={() => { setHideConflicts(false); setFormOnly(false); announce("Accommodation filters turned off"); }}>
                    {COPY.jobs.filteredEmptyOff}
                  </button>
                  {topUnfiltered && (
                    <Link className="btn btn-secondary" to={`/jobs/${topUnfiltered.jobId}/email`}>
                      Draft a request for {topUnfiltered.job.title} at {topUnfiltered.job.employerName}
                    </Link>
                  )}
                </div>
              </div>
            )}
            {data && !running && items.length === 0 && !accFiltersOn && (
              <div className="card">
                <h3 style={{ margin: 0 }}>{COPY.jobs.noneTitle}</h3>
                <ul style={{ margin: 0 }}>{COPY.jobs.noneSuggestions.map((s) => <li key={s}>{s}</li>)}</ul>
                <Link to="/profile" className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>Edit your profile</Link>
              </div>
            )}
            <ol style={{ listStyle: "none", margin: 0, padding: 0, gap: 10 }} className="stack" aria-label="Job matches">
              {items.map((it) => (
                <li key={it.jobId}>
                  <JobCard it={it} selected={it.jobId === selected} onSelect={() => setSelected(it.jobId)} onToggleSave={() => void toggleSave(it)} onRead={() => { setSelected(it.jobId); readJob(it, `${it.job.title} at ${it.job.employerName}. ${it.explanation}`); }} />
                </li>
              ))}
            </ol>
          </section>

          {current && (
            <JobDetail key={current.jobId} jobId={current.jobId} item={current}
              required={profile?.requiredAccommodations ?? []} preferred={profile?.preferredAccommodations ?? []}
              onToggleSave={() => void toggleSave(current)} />
          )}
        </div>
      )}
    </main>
  );
}

function JobCard({ it, selected, onSelect, onToggleSave, onRead }: { it: Item; selected: boolean; onSelect: () => void; onToggleSave: () => void; onRead: () => void }) {
  const c = it.accommodationCoverage;
  const total = c.requiredStated.length + c.requiredNotMentioned.length + c.requiredConflicting.length;
  const stale = Date.now() - it.job.fetchedAt > LIMITS.staleListingHours * 3600_000;
  const f = it.factors;
  const unverifiedRequired = c.requiredNotMentioned.filter((code) => it.job.accommodations.some((a: AccommodationInfo) => a.code === code && a.label === "unverified")).length;
  // A click anywhere on the card (outside its buttons and links, and not while selecting text) selects it.
  // Keyboard and screen reader users get the same through the title link.
  const onCardClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button, input, label, summary, select, textarea")) return;
    if (window.getSelection()?.toString()) return;
    onSelect();
  };
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- mouse shortcut; the title link is the keyboard path
    <article id={`job-${it.jobId}`} tabIndex={-1} aria-labelledby={`jt-${it.jobId}`} aria-current={selected ? "true" : undefined} onClick={onCardClick} data-voice-select
      data-voice-names={[`${it.job.title} at ${it.job.employerName}`, it.job.location && `${it.job.title} in ${it.job.location}`, it.job.employerName].filter(Boolean).join("|")}
      className="stack job-card" style={{ background: "var(--surface)", border: selected ? "3px solid var(--ink)" : "1px solid var(--line)", borderRadius: 16, padding: selected ? 13 : 15, gap: 8 }}>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id={`jt-${it.jobId}`} style={{ margin: 0, fontSize: "1.06rem", lineHeight: 1.3 }}>
            <a href="#detail" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); setTimeout(() => document.getElementById("detail-heading")?.focus(), 0); }} style={{ color: "var(--ink)", textDecoration: "none" }}>{it.job.title}</a>
          </h3>
          <div className="row small muted" style={{ gap: "2px 12px", marginTop: 2 }}>
            <span style={{ fontWeight: 700, color: "var(--ink)" }}>{it.job.employerName}</span>
            <span>{it.job.location || "Location not stated"}</span>
            <span>{EXPERIENCE_LABELS[it.job.experienceLevel]}</span>
            {it.job.isDemo && <span className="demo">DEMO</span>}
            {it.job.accommodationForm && <span className="lb lb-verified" data-testid="form-badge"><Icon name="check" size={14} strokeWidth={3} />{COPY.jobs.formBadge}</span>}
          </div>
        </div>
        <div aria-label={`Match score ${it.score} out of 100`} role="img" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 54, height: 54, borderRadius: 12, border: "2px solid var(--ink)", fontWeight: 800, lineHeight: 1 }}>
          <span style={{ fontSize: "1.3rem" }}>{it.score}</span><span style={{ fontSize: "0.7rem", fontWeight: 600 }}>/ 100</span>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <ul aria-label="Score factors" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
          <li className="fc">{f.skills.limitedInfo ? COPY.jobs.limitedSkills : `Skills ${Math.round(f.skills.ratio * 100)}%`}</li>
          <li className="fc">Role: {f.role.type === "exact" ? "exact" : "close match"}</li>
          <li className="fc">Location: {f.location.fit ? (f.location.reason === "job is remote" ? "remote" : "fits") : "no match"}</li>
          {f.conflicts.length > 0 && <li className="fc fc-conflict">Conflict −{Math.min(40, f.conflicts.length * 25)}</li>}
        </ul>
        {total > 0 && (
          <p className="row" style={{ margin: 0, gap: 6 }} data-testid="coverage">
            <span className="sr-only">Your required accommodations: </span>
            {c.requiredStated.length > 0 && <span className="lb lb-stated"><Icon name="check" size={14} strokeWidth={3} />Stated: {c.requiredStated.length} of {total}</span>}
            {c.requiredStated.length === 0 && <span className="lb lb-stated" style={{ opacity: 1 }}>Stated: 0 of {total}</span>}
            {unverifiedRequired > 0 && <span className="lb lb-unverified"><Icon name="help" size={14} strokeWidth={2.6} />Unverified: {unverifiedRequired}</span>}
            {c.requiredNotMentioned.length - unverifiedRequired > 0 && <span className="lb lb-unavailable"><Icon name="minus" size={14} strokeWidth={3} />Not mentioned: {c.requiredNotMentioned.length - unverifiedRequired}</span>}
            {c.requiredConflicting.length > 0 && <span className="lb lb-conflict"><Icon name="alert" size={14} strokeWidth={2.6} />Conflicts: {c.requiredConflicting.length}</span>}
          </p>
        )}
      </div>
      {f.conflicts.map((cf) => (
        <blockquote key={cf.code} className="quote quote-conflict small">Conflicts with {ACCOMMODATION_LABELS[cf.code].toLowerCase()}. Listing says: "{cf.quote}"</blockquote>
      ))}
      <p className="small muted" style={{ margin: 0 }}>
        Source: {sourceName(it.job.source)} · <a href={it.job.sourceUrl} target="_blank" rel="noopener noreferrer">original listing<span className="sr-only"> for {it.job.title} (opens in a new tab)</span></a> · checked {timeAgo(it.job.fetchedAt)}
        {stale && <strong style={{ color: "var(--unverified-ink)" }}> {COPY.jobs.stale}</strong>}
      </p>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-secondary btn-sm" type="button" aria-pressed={it.saved} onClick={onToggleSave} data-voice-command={it.saved ? "off" : "on"}
          data-voice-names={it.saved ? "unsave|remove from saved" : "save this job|bookmark"}><Icon name="bookmark" size={18} filled={it.saved} />{it.saved ? "Saved" : "Save"}</button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onRead}><Icon name="volume" size={18} />Read aloud</button>
        {it.job.accommodationForm ? (
          <a className="btn btn-secondary btn-sm" href={it.job.accommodationForm.url} target="_blank" rel="noopener noreferrer">
            {COPY.jobs.formRequest}<Icon name="external" size={16} /><span className="sr-only"> for {it.job.title} (opens in a new tab)</span>
          </a>
        ) : (
          <Link className="btn btn-secondary btn-sm" to={`/jobs/${it.jobId}/email`}>Request accommodations</Link>
        )}
        <Link className="btn btn-primary btn-sm" to={`/jobs/${it.jobId}/email`}>Apply<span className="sr-only"> to {it.job.title}</span></Link>
      </div>
    </article>
  );
}

function JobDetail({ jobId, item, required, preferred, onToggleSave }: {
  jobId: Id<"jobs">; item: Item; required: string[]; preferred: string[]; onToggleSave: () => void;
}) {
  const job = useQuery(api.jobs.get, { jobId });
  const reader = useReader();
  const { prefs } = usePrefs();
  const [full, setFull] = useState(false);
  const reading = reader.jobId === jobId && reader.status !== "idle";
  const aboutRef = useRef<HTMLDivElement>(null);
  // Voice: the whole description, read aloud, without first finding the "full description" link.
  useVoiceActions([
    { names: ["Read the description", "read the full description", "read the job description", "read the whole description", "read the whole thing", "read me the job", "read this job"],
      run: () => { if (!job) return; setFull(true); void reader.play(jobId, "full", job.descriptionText); },
      anchor: () => aboutRef.current, message: "Reading the description. Say stop or pause any time.", when: () => !!job && !reading },
  ]);
  if (!job) return <section className="jobs-col detail panel" aria-busy="true" role="status">Loading job…</section>;

  const codes = [...new Set([...required, ...preferred, ...job.accommodations.map((a) => a.code)])] as (typeof ACCOMMODATION_CODES)[number][];
  const summary = job.summary || job.descriptionText.slice(0, 280);
  const f = item.factors;
  const s = Math.round(100 * 0.6 * f.skills.ratio);
  const r = f.role.type === "exact" ? 30 : 15;
  const l = f.location.fit ? 10 : 0;
  const p = Math.min(40, f.conflicts.length * 25);
  const readText = full || prefs.voiceReader ? job.descriptionText : summary;

  return (
    <section id="detail" aria-labelledby="detail-heading" className="jobs-col detail panel stack" style={{ padding: 20, gap: 14 }}
      data-voice-names={`${job.title} at ${job.employer?.name ?? ""}|job details|this job|the open job`} data-voice-primary>
      <div className="stack" style={{ gap: 4 }}>
        {job.isDemo && <div className="row small muted" style={{ gap: 8 }}><span className="demo">DEMO</span>{COPY.common.demoNote}</div>}
        <h2 id="detail-heading" tabIndex={-1} style={{ margin: 0, fontSize: "1.35rem", lineHeight: 1.25 }}>{job.title}</h2>
        <div className="row small muted" style={{ gap: "2px 12px" }}>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>{job.employer?.name}</span>
          <span className="row" style={{ gap: 4 }}><Icon name="pin" size={16} />{job.location || "Location not stated"}</span>
          <span>{EXPERIENCE_LABELS[job.experienceLevel]}</span>
          <span>{ROLE_LABELS[job.roleFamily]}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Link className="btn btn-primary" to={`/jobs/${jobId}/email`}
          data-voice-names="apply|apply for this job|request accommodations|ask for accommodations|accommodation email|email the employer|write the email|draft an email"
          data-voice-say="Here's the accommodation email for this job. Choose what to ask for, then I can write the draft.">Request accommodations and apply</Link>
        <button className="btn btn-secondary" type="button" aria-pressed={item.saved} onClick={onToggleSave} data-voice-command={item.saved ? "off" : "on"}
          data-voice-names={item.saved ? "saved|unsave this job|remove from saved" : "save this job|save job|bookmark|bookmark this job"}
          data-voice-say={item.saved ? "Removed from your saved jobs." : "Saved. It's in your application tracker."}><Icon name="bookmark" size={18} filled={item.saved} />{item.saved ? "Saved" : "Save"}</button>
        <Link className="btn btn-secondary" to={`/jobs/${jobId}/practice`} data-voice-names="practice interview|interview practice|mock interview|practice for this job|rehearse" data-voice-say="Here's the practice interview for this job. Say start when you're ready."><Icon name="mic" size={18} />{COPY.practice.entry}</Link>
      </div>

      {job.accommodationForm ? (
        <EmployerFormCallout form={job.accommodationForm} employer={job.employer?.name ?? "This employer"} jobId={jobId} />
      ) : job.accommodationContact && (
        <div className="callout callout-info" data-testid="accepts-requests">
          <Icon name="info" />
          <div className="stack" style={{ gap: 8 }}>
            <strong>{COPY.jobs.acceptsRequests}</strong>
            <blockquote className="quote small">Listing says: "{job.accommodationContact.quote}"</blockquote>
            <Link className="btn btn-primary btn-sm" to={`/jobs/${jobId}/email`} style={{ alignSelf: "flex-start" }}>
              {job.accommodationContact.email ? `Draft a request to ${job.accommodationContact.email}` : "Draft a request"}
            </Link>
          </div>
        </div>
      )}

      <div className="stack" style={{ gap: 10 }} ref={aboutRef} data-voice-names="about the role|job summary|the description">
        <h3 style={{ margin: 0, fontSize: "1.02rem" }}>About the role</h3>
        <div className="row" style={{ justifyContent: "space-between", padding: "10px 14px", borderRadius: 12, background: "var(--ground)", border: "1px solid var(--line)" }}>
          {reading ? (
            <>
              <span role="status" className="row small" style={{ gap: 8, fontWeight: 600 }}>
                <Icon name="volume" size={18} />{reader.status === "loading" ? "Preparing audio…" : reader.notice || COPY.tts.reading}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {reader.status === "playing" && <button className="btn btn-secondary btn-sm" type="button" onClick={reader.pause} data-voice-command data-voice-names="pause reading|pause|hold on|wait">Pause</button>}
                {reader.status === "paused" && <button className="btn btn-secondary btn-sm" type="button" onClick={reader.resume} data-voice-command data-voice-names="resume|continue|continue reading|keep reading|keep going">Resume</button>}
                <button className="btn btn-secondary btn-sm" type="button" onClick={reader.stop} data-voice-command data-voice-names="stop reading|stop|be quiet|quiet|silence|that's enough">Stop</button>
              </span>
            </>
          ) : (
            <>
              <span className="small muted">{reader.notice && reader.jobId === null ? reader.notice : "Hear this description read aloud with each word highlighted."}</span>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void reader.play(jobId, full || prefs.voiceReader ? "full" : "summary", readText)}
                data-voice-command data-voice-names="read aloud|read it aloud|read the summary|listen">
                <Icon name="volume" size={18} />Read aloud
              </button>
            </>
          )}
        </div>
        {reading && reader.words.length > 0 ? (
          <>
            <HighlightedText words={reader.words} index={reader.index} />
            <p className="sr-only">{readText}</p>
          </>
        ) : full ? (
          <div style={{ whiteSpace: "pre-line" }}>{job.descriptionText}</div>
        ) : (
          <p style={{ margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{summary}</p>
        )}
        <button type="button" className="btn-link" aria-expanded={full} onClick={() => setFull((x) => !x)} style={{ alignSelf: "flex-start" }}
          data-voice-command data-voice-label={full ? "Show the summary only" : "Show the full description"}
          data-voice-names={full ? "show less|collapse the description|shorter" : "show more|expand the description|more details|show the whole description"}>
          {full ? "Show summary" : "Read full description"}
        </button>
      </div>

      {job.employer?.description && (
        <div className="stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: "1.02rem" }}>About {job.employer.name}</h3>
          <p style={{ margin: 0 }}>{job.employer.description} <span className="small muted">({job.employer.descriptionSource ?? "From the listing"})</span></p>
        </div>
      )}

      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: "1.02rem" }}>Accommodations in this listing</h3>
        {codes.length === 0 && <p style={{ margin: 0 }}>{COPY.jobs.notMentioned}</p>}
        {codes.map((code) => (
          <AccommodationRow key={code} code={code}
            need={required.includes(code) ? "Required" : preferred.includes(code) ? "Preferred" : undefined}
            info={job.accommodations.find((a) => a.code === code) ?? null} />
        ))}
      </div>

      <div className="stack" style={{ gap: 8, padding: 14, borderRadius: 14, background: "var(--ground)", border: "1px solid var(--line)" }}>
        <h3 style={{ margin: 0, fontSize: "1.02rem" }}>Why it scored {item.score}</h3>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px" }}>
          <dt>Skills · {f.skills.limitedInfo ? "the listing names no skills" : `${f.skills.matched.length} of ${f.skills.matched.length + f.skills.missing.length} listed`}{f.skills.missing.length > 0 && ` (missing: ${f.skills.missing.slice(0, 4).join(", ")})`}</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>+{s}</dd>
          <dt>Role · {f.role.type === "exact" ? "exact match" : "close match"}, {ROLE_LABELS[job.roleFamily]}</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>+{r}</dd>
          <dt>Location · {f.location.reason}</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>+{l}</dd>
          <dt>Accommodation conflicts · {f.conflicts.length ? f.conflicts.map((c) => ACCOMMODATION_LABELS[c.code]).join(", ") : "none"}</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>{p ? `−${p}` : "0"}</dd>
        </dl>
        <p className="small" style={{ margin: 0 }}>{item.explanation}</p>
        <p className="small muted" style={{ margin: 0 }}>Scored {item.engine === "uagent" ? "by the MatchAgent" : "by the built-in scorer"}. Quoted evidence shows what a listing says, not what an employer will do.</p>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Source: {sourceName(job.source)} · checked {timeAgo(job.fetchedAt)} ·{" "}
        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" data-voice-confirm data-voice-names="employer's website|employer site|job posting|original posting|apply on their site">Open the employer's application page<span className="sr-only"> (opens in a new tab)</span></a>
      </p>
      <LabelLegend />
    </section>
  );
}

function EmployerFormCallout({ form, employer, jobId }: { form: { url: string; quote: string }; employer: string; jobId: string }) {
  return (
    <div className="callout callout-info" data-testid="employer-form">
      <Icon name="info" />
      <div className="stack" style={{ gap: 8 }}>
        <strong>{COPY.email.formTitle(employer)}</strong>
        <blockquote className="quote small">Listing says: "{form.quote}"</blockquote>
        <span className="row" style={{ gap: 8 }}>
          <a className="btn btn-primary btn-sm" href={form.url} target="_blank" rel="noopener noreferrer" data-voice-confirm data-voice-names="accommodation form|employer's form|their form">
            {COPY.email.formOpen}<Icon name="external" size={16} /><span className="sr-only"> (opens in a new tab)</span>
          </a>
          <Link className="btn btn-secondary btn-sm" to={`/jobs/${jobId}/email`}>Draft an email instead</Link>
        </span>
      </div>
    </div>
  );
}

function LabelLegend() {
  return (
    <details>
      <summary className="small" style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }} data-voice-command data-voice-names="label legend|what do the labels mean|explain the labels">What the labels mean</summary>
      <dl className="small" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", alignItems: "start" }}>
        <dt><LabelBadge info={{ label: "stated" }} /></dt><dd style={{ margin: 0 }}>The listing itself says it. We show its exact words.</dd>
        <dt><LabelBadge info={{ label: "verified" }} /></dt><dd style={{ margin: 0 }}>Our team confirmed it from an employer source.</dd>
        <dt><LabelBadge info={{ label: "unverified" }} /></dt><dd style={{ margin: 0 }}>Only general or unclear wording. Ask the employer.</dd>
        <dt><LabelBadge info={null} /></dt><dd style={{ margin: 0 }}>{COPY.jobs.notMentioned}</dd>
      </dl>
    </details>
  );
}
