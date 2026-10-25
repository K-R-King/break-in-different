import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "../../shared/taxonomy";
import { COPY } from "../copy";
import { PageHeading, useDocumentTitle } from "../a11y/PageHeading";
import { useAnnounce } from "../a11y/Announcer";
import { Icon, type IconName } from "../components/Icon";
import { formatDate } from "../components/Accommodation";
import { toAppError } from "../lib/errors";
import { useFitLayout } from "../lib/useFitLayout";

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.applications.list>>>[number];

const STATUS_STYLE: Record<ApplicationStatus, { icon: IconName; bg: string; ink: string; line: string }> = {
  saved: { icon: "bookmark", bg: "var(--none-bg)", ink: "var(--none-ink)", line: "var(--none-line)" },
  applied: { icon: "check", bg: "var(--verified-bg)", ink: "var(--verified-ink)", line: "var(--verified-line)" },
  interviewing: { icon: "calendar", bg: "var(--interview-bg)", ink: "var(--interview-ink)", line: "var(--interview-line)" },
  rejected: { icon: "x", bg: "var(--conflict-bg)", ink: "var(--conflict-ink)", line: "var(--conflict-line)" },
};

export default function TrackerPage() {
  useDocumentTitle(COPY.tracker.title);
  const rows = useQuery(api.applications.list);
  const [sort, setSort] = useState<"deadline" | "updated">("deadline");
  const [status, setStatus] = useState("");

  const sorted = useMemo(() => {
    const r = [...(rows ?? [])];
    if (sort === "updated") r.sort((a, b) => b.updatedAt - a.updatedAt);
    // Ties keep the order the jobs were saved in, so editing a row never moves it.
    else r.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
    return r;
  }, [rows, sort]);

  // Wide, tall-enough screens: the page stops scrolling and the table scrolls in its panel (styles in base.css).
  const tableRef = useRef<HTMLDivElement>(null);
  useFitLayout(tableRef, { minWidth: 960, minHeight: 360, enabled: !!rows?.length });

  const counts = APPLICATION_STATUSES.map((s) => ({ s, n: (rows ?? []).filter((r) => r.status === s).length }));

  return (
    <main id="main" className="container stack tracker-page" style={{ paddingBlock: "32px 56px", gap: 24 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <PageHeading>{COPY.tracker.title}</PageHeading>
          <p className="lede">{COPY.tracker.lede}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label htmlFor="sort" className="label">Sort by</label>
          <select id="sort" className="input" style={{ width: "auto", minHeight: 44 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} data-voice-names="sort|order">
            <option value="deadline">Deadline (soonest first)</option>
            <option value="updated">Last update</option>
          </select>
        </div>
      </div>

      {rows === undefined ? (
        <p role="status">Loading your tracker…</p>
      ) : rows.length === 0 ? (
        <div className="card">
          <h2 style={{ margin: 0 }}>{COPY.tracker.empty}</h2>
          <p style={{ margin: 0 }}>Save a job from the Jobs Listing and it appears here.</p>
          <Link className="btn btn-primary" to="/jobs" style={{ alignSelf: "flex-start" }}>Go to jobs</Link>
        </div>
      ) : (
        <>
          <ul aria-label="Totals" className="row" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {counts.map(({ s, n }) => (
              <li key={s} className="panel" style={{ padding: "14px 18px", minWidth: 150, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "1.65rem", fontWeight: 800 }}>{n}</span>
                <span style={{ fontWeight: 600 }}>{STATUS_LABELS[s]}</span>
              </li>
            ))}
          </ul>
          {status && (
            <p role="status" className="callout callout-info" style={{ margin: 0, fontWeight: 600 }}><Icon name="check" strokeWidth={2.6} />{status}</p>
          )}
          {/* A scrollable region must be keyboard-focusable (axe: scrollable-region-focusable). */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div ref={tableRef} className="panel tracker-table" style={{ padding: 0 }} role="region" aria-label="Saved jobs table, scrollable" tabIndex={0} data-voice-scroll>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1180 }}>
              <caption className="sr-only">Saved jobs</caption>
              <thead>
                <tr>
                  {["Job", "Status", "Deadline", "Follow-up date", "Interviews", "Email draft", "Notes", "Updated"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-2)", padding: "12px 14px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => <TrackerRow key={r._id} row={r} onStatus={setStatus} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="hint">{COPY.tracker.reminders}</p>
    </main>
  );
}

const AUTOSAVE_MS = 800;
const td = { padding: "16px 14px", borderBottom: "1px solid #e4e6eb", verticalAlign: "top" } as const;

function TrackerRow({ row, onStatus }: { row: Row; onStatus: (s: string) => void }) {
  const update = useMutation(api.applications.update);
  const announce = useAnnounce();
  const [notes, setNotes] = useState(row.notes);
  const [adding, setAdding] = useState(false);
  const [ivDate, setIvDate] = useState("");
  const [ivNotes, setIvNotes] = useState("");
  const [err, setErr] = useState("");
  const title = row.job?.title ?? "Closed listing";
  const st = STATUS_STYLE[row.status];

  const save = async (patch: Omit<Parameters<typeof update>[0], "applicationId">, message: string) => {
    setErr("");
    try {
      await update({ applicationId: row._id as Id<"applications">, ...patch });
      onStatus(message);
      announce(message);
    } catch (e) {
      const m = toAppError(e).message;
      setErr(m);
      announce(m, "assertive");
    }
  };

  // Notes and dates save by themselves a moment after a change (typing, a date picked, or voice),
  // and at once when the field is left, so nothing waits on a click elsewhere. Only real changes
  // are saved, and each one once.
  const saved = useRef({ notes: row.notes, deadline: row.deadline, followUpDate: row.followUpDate });
  const pending = useRef(new Map<string, { timer: number; run: () => void }>());
  const commit = (field: "notes" | "deadline" | "followUpDate", value: string | null, message: string) => {
    if (value === saved.current[field]) return;
    saved.current = { ...saved.current, [field]: value };
    void save({ [field]: value }, message);
  };
  const later = (key: string, run: () => void) => {
    window.clearTimeout(pending.current.get(key)?.timer);
    pending.current.set(key, { timer: window.setTimeout(() => (pending.current.delete(key), run()), AUTOSAVE_MS), run });
  };
  const now = (key: string, run: () => void) => {
    window.clearTimeout(pending.current.get(key)?.timer);
    pending.current.delete(key);
    run();
  };
  // Leaving the page saves what is still waiting.
  useEffect(() => {
    const waiting = pending.current;
    return () => waiting.forEach((p) => (window.clearTimeout(p.timer), p.run()));
  }, []);
  const saveNotes = (v: string) => commit("notes", v, `${title}: notes saved.`);
  const saveDeadline = (v: string) => commit("deadline", v || null, `${title}: deadline saved.`);
  const saveFollowUp = (v: string) => commit("followUpDate", v || null, `${title}: follow-up date saved.`);

  return (
    <tr data-voice-names={[title, row.job?.employerName && `${title} at ${row.job.employerName}`, row.job?.employerName].filter(Boolean).join("|")}>
      <td style={td}>
        <strong>{title}</strong><br />{row.job?.employerName} {row.job?.isDemo && <span className="demo">DEMO</span>}
        {row.job?.status === "closed" && <><br /><span className="small muted">Listing closed</span></>}
        {err && <p className="field-error small" role="alert">{err}</p>}
      </td>
      <td style={td}>
        <span className="lb" style={{ background: st.bg, color: st.ink, borderColor: st.line, marginBottom: 8 }}>
          <Icon name={st.icon} size={14} strokeWidth={2.6} />{STATUS_LABELS[row.status]}
        </span>
        <br />
        <label htmlFor={`st-${row._id}`} className="sr-only">Status for {title}</label>
        <select id={`st-${row._id}`} className="input" style={{ width: "auto", minHeight: 44, fontSize: "0.88rem", fontWeight: 600 }} value={row.status} data-voice-names="status|application status"
          onChange={(e) => void save({ status: e.target.value as ApplicationStatus }, `${title}: status changed to ${STATUS_LABELS[e.target.value as ApplicationStatus]}. Saved.`)}>
          {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </td>
      <td style={td}>
        <label htmlFor={`dl-${row._id}`} className="sr-only">Deadline for {title}</label>
        <input id={`dl-${row._id}`} type="date" className="input" style={{ minHeight: 44, width: "auto" }} defaultValue={row.deadline ?? ""} data-voice-names="deadline|due date"
          onChange={(e) => { const v = e.target.value; later("deadline", () => saveDeadline(v)); }} onBlur={(e) => { const v = e.target.value; now("deadline", () => saveDeadline(v)); }} />
      </td>
      <td style={td}>
        <label htmlFor={`fu-${row._id}`} className="sr-only">Follow-up date for {title}</label>
        <input id={`fu-${row._id}`} type="date" className="input" style={{ minHeight: 44, width: "auto" }} defaultValue={row.followUpDate ?? ""} data-voice-names="follow up|follow-up|follow up date|reminder date"
          onChange={(e) => { const v = e.target.value; later("followUp", () => saveFollowUp(v)); }} onBlur={(e) => { const v = e.target.value; now("followUp", () => saveFollowUp(v)); }} />
      </td>
      <td style={td}>
        {row.interviews.length === 0 && <span className="muted">None yet</span>}
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {row.interviews.map((iv, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <strong>{new Date(iv.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong>
              {iv.notes && <><br />{iv.notes}</>}
              <br />
              <button type="button" className="btn-link small" onClick={() => void save({ interviews: row.interviews.filter((_, j) => j !== i) }, `${title}: interview removed.`)} data-voice-names="delete the interview|remove the interview">Remove<span className="sr-only"> interview</span></button>
            </li>
          ))}
        </ul>
        {adding ? (
          <form className="stack" style={{ gap: 6, marginTop: 6 }} onSubmit={(e) => {
            e.preventDefault();
            if (!ivDate) { setErr("Enter the interview date and time."); return; }
            void save({ interviews: [...row.interviews, { date: new Date(ivDate).toISOString(), notes: ivNotes.trim() }] }, `${title}: interview added.`).then(() => { setAdding(false); setIvDate(""); setIvNotes(""); });
          }}>
            <label className="small label" htmlFor={`ivd-${row._id}`}>Date and time</label>
            <input id={`ivd-${row._id}`} type="datetime-local" className="input" style={{ minHeight: 44 }} value={ivDate} onChange={(e) => setIvDate(e.target.value)} data-voice-names="interview date|interview time|when" />
            <label className="small label" htmlFor={`ivn-${row._id}`}>Notes</label>
            <input id={`ivn-${row._id}`} className="input" style={{ minHeight: 44 }} value={ivNotes} onChange={(e) => setIvNotes(e.target.value)} data-voice-names="interview notes" />
            <span className="row" style={{ gap: 6 }}>
              <button className="btn btn-secondary btn-sm" type="submit" data-voice-names="save the interview|add it">Add</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAdding(false)} data-voice-command data-voice-names="cancel|never mind">Cancel</button>
            </span>
          </form>
        ) : (
          <><br /><button type="button" className="btn-link" onClick={() => setAdding(true)} data-voice-command data-voice-names="add an interview|new interview|schedule an interview">Add interview<span className="sr-only"> for {title}</span></button></>
        )}
      </td>
      <td style={td}>
        {row.draft ? (
          <>
            <Link to={`/jobs/${row.jobId}/email`} data-voice-names="the draft|email draft|open the draft|my email">{row.draft.approvedAt ? "Approved draft" : "Draft (not approved)"}<span className="sr-only"> for {title}</span></Link>
            <br /><span className="small muted">{new Date(row.draft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </>
        ) : (
          <><span className="muted">No draft yet</span><br /><Link to={`/jobs/${row.jobId}/email`} data-voice-names="write an email|start the email|draft an email|request accommodations">Start a draft<span className="sr-only"> for {title}</span></Link></>
        )}
      </td>
      <td style={td}>
        <label htmlFor={`nt-${row._id}`} className="sr-only">Notes for {title}</label>
        <textarea id={`nt-${row._id}`} className="input" rows={2} maxLength={2000} value={notes} style={{ minWidth: 180 }} data-voice-names="notes|my notes|a note|note"
          onChange={(e) => { const v = e.target.value; setNotes(v); later("notes", () => saveNotes(v)); }} onBlur={() => now("notes", () => saveNotes(notes))} />
      </td>
      <td style={td}>
        {formatDate(new Date(row.updatedAt).toISOString().slice(0, 10))}
        {row.appliedAt && <><br /><span className="small muted">Applied {formatDate(new Date(row.appliedAt).toISOString().slice(0, 10))}</span></>}
      </td>
    </tr>
  );
}
