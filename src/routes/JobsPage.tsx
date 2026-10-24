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
import { toAppError } from "../lib/errors";

const MIN_COLUMN_HEIGHT = 360;

type Item = NonNullable<ReturnType<typeof useQuery<typeof api.matches.list>>>["items"][number];

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
  const [statesAll, setStatesAll] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const autoRan = useRef(false);

  const data = useQuery(api.matches.list, {
    workSetup, locationText: locationText.trim() || undefined, statesAllRequired: statesAll || undefined,
    experience: experience.length ? experience : undefined, search: search.trim() || undefined,
  });

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

  const focusCard = (jobId: string) => document.getElementById(`job-${jobId}`)?.focus();
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

  useVoiceHandlers({
    next: () => { const n = items[Math.min(items.length - 1, selectedIndex + 1)]; if (n) { setSelected(n.jobId); focusCard(n.jobId); announce(`${n.job.title} at ${n.job.employerName}`); } },
    previous: () => { const p = items[Math.max(0, selectedIndex - 1)]; if (p) { setSelected(p.jobId); focusCard(p.jobId); announce(`${p.job.title} at ${p.job.employerName}`); } },
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
  // Only when the columns still get a useful height; with large text the page scrolls as usual.
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (incomplete) return;
    const root = document.documentElement;
    const check = () => {
      const el = layoutRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const footer = document.querySelector(".footer")?.getBoundingClientRect().height ?? 0;
      if (window.innerHeight - top - footer - 16 >= MIN_COLUMN_HEIGHT) root.dataset.layout = "fit";
      else delete root.dataset.layout;
    };
    check();
    const ro = new ResizeObserver(check);
    for (const el of [document.querySelector(".site-header"), layoutRef.current?.previousElementSibling]) if (el) ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
      delete root.dataset.layout;
    };
  }, [incomplete]);

  return (
    <main id="main" className="container jobs-page" style={{ paddingBlock: "32px 48px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400 }}>
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
                    <input type="checkbox" checked={requiredSet.has(code)} disabled={!profile || running} onChange={(e) => void setRequired(code, e.target.checked)} />
                    <span>
                      {ACCOMMODATION_LABELS[code]}
                      {profile?.preferredAccommodations.includes(code) && <span className="muted"> (preferred)</span>}
                      {ACCOMMODATION_HINTS[code] && <span className="small muted" style={{ display: "block" }}>{ACCOMMODATION_HINTS[code]}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="ck" style={{ borderTop: "1px solid #e4e6eb", paddingTop: 14 }}>
                <input type="checkbox" checked={statesAll} onChange={(e) => setStatesAll(e.target.checked)} />
                <span><strong>Only show jobs that state all my required accommodations</strong></span>
              </label>
              <Link to="/profile#s3" style={{ fontWeight: 600 }}>Edit in your profile</Link>
            </div>
          </aside>

          <section className="jobs-col main" aria-labelledby="res-h" aria-busy={running || data === undefined} data-voice-scroll>
            <div className="row jobs-results-bar" style={{ justifyContent: "space-between" }}>
              <h2 id="res-h" style={{ margin: 0, fontSize: "1.2rem" }}>
                {running || data === undefined ? COPY.jobs.finding : `${items.length} jobs found`}
              </h2>
              <div className="row" style={{ gap: 8 }}>
                <span className="small muted">{COPY.jobs.sortNote}</span>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => void doRun()} disabled={running}>Refresh matches</button>
              </div>
            </div>
            {data?.engine === "fallback" && <p className="note" data-testid="notice-fallback"><strong>{COPY.jobs.scoredWithoutAgent}.</strong> Results come from our built-in scorer.</p>}
            {data?.usingSavedListings && <p className="note" data-testid="notice-saved"><strong>{COPY.jobs.usingSavedListings}.</strong> Listings were collected earlier; each card shows when it was checked.</p>}
            <p className="note">{COPY.jobs.aiNote}</p>
            {runError && (
              <div className="callout callout-error" role="alert">
                <Icon name="alert" /><span>{runError}</span>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => void doRun()}>{COPY.common.retry}</button>
              </div>
            )}
            {data && !running && items.length === 0 && (
              <div className="card">
                <h3 style={{ margin: 0 }}>{COPY.jobs.noneTitle}</h3>
                <ul style={{ margin: 0 }}>{COPY.jobs.noneSuggestions.map((s) => <li key={s}>{s}</li>)}</ul>
                <Link to="/profile" className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>Edit your profile</Link>
              </div>
            )}
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }} className="stack" aria-label="Job matches">
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
    <article id={`job-${it.jobId}`} tabIndex={-1} aria-labelledby={`jt-${it.jobId}`} aria-current={selected ? "true" : undefined} onClick={onCardClick}
      data-voice-names={[`${it.job.title} at ${it.job.employerName}`, it.job.location && `${it.job.title} in ${it.job.location}`, it.job.employerName].filter(Boolean).join("|")}
      className="stack job-card" style={{ background: "var(--surface)", border: selected ? "3px solid var(--ink)" : "1px solid var(--line)", borderRadius: 18, padding: selected ? 18 : 20, gap: 12 }}>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id={`jt-${it.jobId}`} style={{ margin: 0, fontSize: "1.18rem" }}>
            <a href="#detail" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); setTimeout(() => document.getElementById("detail-heading")?.focus(), 0); }} style={{ color: "var(--ink)", textDecoration: "none" }}>{it.job.title}</a>
          </h3>
          <div className="row small muted" style={{ gap: "4px 14px", marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: "var(--ink)" }}>{it.job.employerName}</span>
            <span>{it.job.location || "Location not stated"}</span>
            <span>{EXPERIENCE_LABELS[it.job.experienceLevel]}</span>
            {it.job.isDemo && <span className="demo">DEMO</span>}
            {it.job.accommodationForm && <span className="lb lb-verified" data-testid="form-badge"><Icon name="check" size={14} strokeWidth={3} />{COPY.jobs.formBadge}</span>}
          </div>
        </div>
        <div aria-label={`Match score ${it.score} out of 100`} role="img" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 68, height: 68, borderRadius: 14, border: "2px solid var(--ink)", fontWeight: 800, lineHeight: 1 }}>
          <span style={{ fontSize: "1.55rem" }}>{it.score}</span><span style={{ fontSize: "0.7rem", fontWeight: 600 }}>/ 100</span>
        </div>
      </div>
      <ul aria-label="Score factors" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
        <li className="fc">{f.skills.limitedInfo ? COPY.jobs.limitedSkills : `Skills ${Math.round(f.skills.ratio * 100)}%`}</li>
        <li className="fc">Role: {f.role.type === "exact" ? "exact" : "close match"}</li>
        <li className="fc">Location: {f.location.fit ? (f.location.reason === "job is remote" ? "remote" : "fits") : "no match"}</li>
        {f.conflicts.length > 0 && <li className="fc fc-conflict">Conflict −{Math.min(40, f.conflicts.length * 25)}</li>}
      </ul>
      {total > 0 && (
        <p className="row" style={{ margin: 0, gap: 8 }} data-testid="coverage">
          <span className="sr-only">Your required accommodations: </span>
          {c.requiredStated.length > 0 && <span className="lb lb-stated"><Icon name="check" size={14} strokeWidth={3} />Stated: {c.requiredStated.length} of {total}</span>}
          {c.requiredStated.length === 0 && <span className="lb lb-stated" style={{ opacity: 1 }}>Stated: 0 of {total}</span>}
          {unverifiedRequired > 0 && <span className="lb lb-unverified"><Icon name="help" size={14} strokeWidth={2.6} />Unverified: {unverifiedRequired}</span>}
          {c.requiredNotMentioned.length - unverifiedRequired > 0 && <span className="lb lb-unavailable"><Icon name="minus" size={14} strokeWidth={3} />Not mentioned: {c.requiredNotMentioned.length - unverifiedRequired}</span>}
          {c.requiredConflicting.length > 0 && <span className="lb lb-conflict"><Icon name="alert" size={14} strokeWidth={2.6} />Conflicts: {c.requiredConflicting.length}</span>}
        </p>
      )}
      {f.conflicts.map((cf) => (
        <blockquote key={cf.code} className="quote quote-conflict small">Conflicts with {ACCOMMODATION_LABELS[cf.code].toLowerCase()}. Listing says: "{cf.quote}"</blockquote>
      ))}
      <p className="small muted" style={{ margin: 0 }}>
        Source: {sourceName(it.job.source)} · <a href={it.job.sourceUrl} target="_blank" rel="noopener noreferrer">original listing<span className="sr-only"> for {it.job.title} (opens in a new tab)</span></a> · checked {timeAgo(it.job.fetchedAt)}
        {stale && <strong style={{ color: "var(--unverified-ink)" }}> {COPY.jobs.stale}</strong>}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-sm" type="button" aria-pressed={it.saved} onClick={onToggleSave}><Icon name="bookmark" size={18} filled={it.saved} />{it.saved ? "Saved" : "Save"}</button>
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
    <section id="detail" aria-labelledby="detail-heading" className="jobs-col detail panel stack" style={{ padding: 26, gap: 18 }}
      data-voice-names={`${job.title} at ${job.employer?.name ?? ""}|job details`}>
      <div className="stack" style={{ gap: 6 }}>
        {job.isDemo && <div className="row small muted" style={{ gap: 8 }}><span className="demo">DEMO</span>{COPY.common.demoNote}</div>}
        <h2 id="detail-heading" tabIndex={-1} style={{ margin: 0, fontSize: "1.65rem", lineHeight: 1.2 }}>{job.title}</h2>
        <div className="row muted" style={{ gap: "4px 14px" }}>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>{job.employer?.name}</span>
          <span className="row" style={{ gap: 4 }}><Icon name="pin" size={16} />{job.location || "Location not stated"}</span>
          <span>{EXPERIENCE_LABELS[job.experienceLevel]}</span>
          <span>{ROLE_LABELS[job.roleFamily]}</span>
        </div>
      </div>
      <div className="row">
        <Link className="btn btn-primary btn-lg" to={`/jobs/${jobId}/email`} style={{ minHeight: 52 }}>Request accommodations and apply</Link>
        <button className="btn btn-secondary" type="button" aria-pressed={item.saved} onClick={onToggleSave}><Icon name="bookmark" size={18} filled={item.saved} />{item.saved ? "Saved" : "Save"}</button>
        <Link className="btn btn-secondary" to={`/jobs/${jobId}/practice`}><Icon name="mic" size={18} />{COPY.practice.entry}</Link>
      </div>

      {job.accommodationForm && <EmployerFormCallout form={job.accommodationForm} employer={job.employer?.name ?? "This employer"} jobId={jobId} />}

      <div className="stack" style={{ gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: "1.12rem" }}>About the role</h3>
        <div className="row" style={{ justifyContent: "space-between", padding: "10px 14px", borderRadius: 12, background: "var(--ground)", border: "1px solid var(--line)" }}>
          {reading ? (
            <>
              <span role="status" className="row small" style={{ gap: 8, fontWeight: 600 }}>
                <Icon name="volume" size={18} />{reader.status === "loading" ? "Preparing audio…" : reader.notice || COPY.tts.reading}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {reader.status === "playing" && <button className="btn btn-secondary btn-sm" type="button" onClick={reader.pause}>Pause</button>}
                {reader.status === "paused" && <button className="btn btn-secondary btn-sm" type="button" onClick={reader.resume}>Resume</button>}
                <button className="btn btn-secondary btn-sm" type="button" onClick={reader.stop}>Stop</button>
              </span>
            </>
          ) : (
            <>
              <span className="small muted">{reader.notice && reader.jobId === null ? reader.notice : "Hear this description read aloud with each word highlighted."}</span>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void reader.play(jobId, full || prefs.voiceReader ? "full" : "summary", readText)}>
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
        <button type="button" className="btn-link" aria-expanded={full} onClick={() => setFull((x) => !x)} style={{ alignSelf: "flex-start" }}>
          {full ? "Show summary" : "Read full description"}
        </button>
      </div>

      {job.employer?.description && (
        <div className="stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: "1.12rem" }}>About {job.employer.name}</h3>
          <p style={{ margin: 0 }}>{job.employer.description} <span className="small muted">({job.employer.descriptionSource ?? "From the listing"})</span></p>
        </div>
      )}

      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: "1.12rem" }}>Accommodations in this listing</h3>
        {codes.length === 0 && <p style={{ margin: 0 }}>{COPY.jobs.notMentioned}</p>}
        {codes.map((code) => (
          <AccommodationRow key={code} code={code}
            need={required.includes(code) ? "Required" : preferred.includes(code) ? "Preferred" : undefined}
            info={job.accommodations.find((a) => a.code === code) ?? null} />
        ))}
      </div>

      <div className="stack" style={{ gap: 10, padding: 16, borderRadius: 14, background: "var(--ground)", border: "1px solid var(--line)" }}>
        <h3 style={{ margin: 0, fontSize: "1.12rem" }}>Why it scored {item.score}</h3>
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
        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">Open the employer's application page<span className="sr-only"> (opens in a new tab)</span></a>
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
          <a className="btn btn-primary btn-sm" href={form.url} target="_blank" rel="noopener noreferrer">
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
      <summary className="small" style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>What the labels mean</summary>
      <dl className="small" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", alignItems: "start" }}>
        <dt><LabelBadge info={{ label: "stated" }} /></dt><dd style={{ margin: 0 }}>The listing itself says it. We show its exact words.</dd>
        <dt><LabelBadge info={{ label: "verified" }} /></dt><dd style={{ margin: 0 }}>Our team confirmed it from an employer source.</dd>
        <dt><LabelBadge info={{ label: "unverified" }} /></dt><dd style={{ margin: 0 }}>Only general or unclear wording. Ask the employer.</dd>
        <dt><LabelBadge info={null} /></dt><dd style={{ margin: 0 }}>{COPY.jobs.notMentioned}</dd>
      </dl>
    </details>
  );
}
