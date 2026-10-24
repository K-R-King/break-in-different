import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ACCOMMODATION_CODES, ACCOMMODATION_HINTS, ACCOMMODATION_LABELS, CONDITION_LABELS, CONDITIONS, type AccommodationCode } from "../../shared/taxonomy";
import { COPY } from "../copy";
import { PageHeading, useDocumentTitle } from "../a11y/PageHeading";
import { useAnnounce } from "../a11y/Announcer";
import { Icon } from "../components/Icon";
import { toAppError } from "../lib/errors";
import { useVoice } from "../voice/VoiceProvider";
import { PushToTalkRecorder } from "../voice/recorder";

export default function EmailPage() {
  const { id } = useParams();
  const jobId = id as Id<"jobs">;
  const job = useQuery(api.jobs.get, { jobId });
  const profile = useQuery(api.profiles.get);
  const sensitive = useQuery(api.profiles.getSensitive);
  const latest = useQuery(api.emails.latestForJob, { jobId });
  const draftAction = useAction(api.emails.draft);
  const saveEdit = useMutation(api.emails.saveEdit);
  const approve = useMutation(api.emails.approve);
  const markApplied = useMutation(api.applications.markApplied);
  const announce = useAnnounce();
  const navigate = useNavigate();
  useDocumentTitle(COPY.email.title);

  const [codes, setCodes] = useState<AccommodationCode[]>([]);
  const [extra, setExtra] = useState("");
  const [disclose, setDisclose] = useState(false);
  const [conditions, setConditions] = useState<string[]>([]);
  const [disclosureText, setDisclosureText] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [askApplied, setAskApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const init = useRef(false);
  const autoDrafted = useRef(false);
  const awayToEmployer = useRef(false);

  // Prefill from the profile's required accommodations (C2), or from the last draft.
  useEffect(() => {
    if (init.current || profile === undefined || latest === undefined || sensitive === undefined) return;
    init.current = true;
    if (latest) setCodes(latest.accommodationCodes);
    else if (profile) setCodes(profile.requiredAccommodations);
    if (sensitive) setConditions(sensitive.selected);
  }, [profile, latest, sensitive]);

  // Keep the editor in step with the stored draft unless the user has unsaved edits.
  useEffect(() => {
    if (latest && !dirty) {
      setSubject(latest.subject);
      setBody(latest.body);
    }
  }, [latest, dirty]);

  const generate = async (useCodes = codes) => {
    if (!useCodes.length) {
      setError("Choose at least one accommodation to ask for.");
      announce("Choose at least one accommodation to ask for.", "assertive");
      document.getElementById(`acc-${ACCOMMODATION_CODES[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    announce("Drafting");
    try {
      const r = await draftAction({
        jobId, accommodationCodes: useCodes, disclose,
        conditions: disclose ? conditions : [], disclosureFreeText: disclose ? disclosureText : "", extraRequest: extra,
      });
      setDirty(false);
      const n = r.aiUnavailable ? COPY.common.aiUnavailable : r.generatedBy === "template" ? "We used our standard template for this draft." : "";
      setNotice(n);
      announce(`Draft ready, review it. ${n}`);
    } catch (e) {
      const a = toAppError(e);
      setError(a.message);
      announce(a.message, "assertive");
    } finally {
      setBusy(false);
    }
  };

  // Arriving from Apply with no draft yet: write the first draft straight away.
  useEffect(() => {
    if (!init.current || autoDrafted.current || latest !== null || !codes.length || busy) return;
    autoDrafted.current = true;
    void generate(codes);
  });

  // When the user comes back from the employer's site, ask whether they applied.
  useEffect(() => {
    const back = () => {
      if (awayToEmployer.current && document.visibilityState === "visible") {
        awayToEmployer.current = false;
        setAskApplied(true);
        announce("Back from the employer's site. Did you apply?");
      }
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [announce]);

  const approved = !!latest?.approvedAt && !dirty;

  const persistEdit = async () => {
    if (!latest || !dirty) return true;
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message cannot be empty.");
      return false;
    }
    try {
      await saveEdit({ draftId: latest._id, subject, body });
      setDirty(false);
      return true;
    } catch (e) {
      setError(toAppError(e).message);
      return false;
    }
  };

  const onApprove = async () => {
    if (!latest) return;
    if (!(await persistEdit())) return;
    try {
      await approve({ draftId: latest._id });
      announce("Approved. You can copy or open it now.");
    } catch (e) {
      setError(toAppError(e).message);
    }
  };

  const onCopy = async () => {
    const text = `${to ? `To: ${to}\n` : ""}Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      announce("Email copied.");
    } catch {
      setError("Copy did not work in this browser. Select the text and copy it yourself.");
    }
  };

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const onMarkApplied = async () => {
    try {
      await markApplied({ jobId, emailDraftId: latest?._id });
      announce("Marked as applied.");
      navigate("/tracker");
    } catch (e) {
      setError(toAppError(e).message);
    }
  };

  if (job === undefined) return <main id="main" className="container" style={{ paddingBlock: 40 }} role="status">Loading…</main>;

  const step = !latest ? 1 : approved ? 3 : 2;
  const conditionLabels = disclose ? (disclosureText.trim() ? ["your own words"] : conditions.map((c) => CONDITION_LABELS[c as keyof typeof CONDITION_LABELS] ?? c)) : [];
  const shared = latest?.accommodationCodes ?? codes;

  return (
    <main id="main" className="container stack" style={{ paddingBlock: "32px 56px", gap: 24 }}>
      <div className="stack" style={{ gap: 8 }}>
        <Link to="/jobs" style={{ fontWeight: 600, alignSelf: "flex-start" }}>Back to jobs</Link>
        <PageHeading>{COPY.email.title}</PageHeading>
        <p style={{ margin: 0, fontSize: "1.12rem" }}>
          {job.title} · {job.employer?.name} {job.isDemo && <span className="demo" style={{ verticalAlign: "middle" }}>DEMO</span>}
        </p>
      </div>

      <ol aria-label="Steps" className="row" style={{ listStyle: "none", margin: 0, padding: 0, gap: "12px 28px" }}>
        {["Choose what to ask for", "Review and edit", "Approve, then send it yourself", "Apply on the employer's site"].map((s, i) => (
          <li key={s} className="row" style={{ gap: 10, fontWeight: 600 }} aria-current={step === i + 1 ? "step" : undefined}>
            <b style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 999, border: "2px solid var(--ink)", background: step === i + 1 ? "var(--ink)" : "transparent", color: step === i + 1 ? "#fff" : "var(--ink)", fontSize: "0.88rem" }}>{i + 1}</b>
            {s}
          </li>
        ))}
      </ol>

      {error && <div className="callout callout-error" role="alert"><Icon name="alert" /><span>{error}</span></div>}

      <div className="sidebar-layout">
        <div className="side" style={{ flex: "1 1 360px" }}>
          <section className="card" aria-labelledby="ask-h">
            <h2 id="ask-h" style={{ margin: 0, fontSize: "1.3rem" }}>What would you like to ask for?</h2>
            <p className="hint">Filled in from your required accommodations. Choose at least one.</p>
            <fieldset>
              <legend className="sr-only">Accommodations to request</legend>
              {ACCOMMODATION_CODES.map((c) => (
                <label key={c} className="ck">
                  <input id={`acc-${c}`} type="checkbox" checked={codes.includes(c)} onChange={(e) => setCodes((x) => (e.target.checked ? [...x, c] : x.filter((y) => y !== c)))} />
                  <span>{ACCOMMODATION_LABELS[c]}{ACCOMMODATION_HINTS[c] && <span className="muted"> ({ACCOMMODATION_HINTS[c]})</span>}</span>
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor="extra" className="label">Anything else, in your own words <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <p id="extra-hint" className="hint">Added to the email exactly as you write it.</p>
              <textarea id="extra" className="input" rows={2} maxLength={500} value={extra} aria-describedby="extra-hint" onChange={(e) => setExtra(e.target.value)} />
            </div>
          </section>

          <section className="card" aria-labelledby="dis-h">
            <fieldset>
              <legend id="dis-h" style={{ fontSize: "1.2rem" }}>Would you like to disclose your disability?</legend>
              <p className="hint" style={{ marginBottom: 12 }}>{COPY.email.discloseHint}</p>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                {([false, true] as const).map((v) => (
                  <label key={String(v)} className="check" style={{ flex: 1, justifyContent: "center", alignItems: "center", fontWeight: 700 }}>
                    <input type="radio" name="disclose" checked={disclose === v} onChange={() => setDisclose(v)} />
                    {v ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>
            {disclose && (
              <fieldset>
                <legend>What should the email mention?</legend>
                <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: "0 12px" }}>
                  {CONDITIONS.map((c) => (
                    <label key={c} className="ck">
                      <input type="checkbox" checked={conditions.includes(c)} onChange={(e) => setConditions((x) => (e.target.checked ? [...x, c] : x.filter((y) => y !== c)))} />
                      <span>{CONDITION_LABELS[c]}</span>
                    </label>
                  ))}
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label htmlFor="dis-free" className="label">Or write it your way</label>
                  <p id="dis-free-hint" className="hint">If you write something here, it is used instead of the boxes above, exactly as written.</p>
                  <input id="dis-free" className="input" maxLength={500} value={disclosureText} aria-describedby="dis-free-hint" onChange={(e) => setDisclosureText(e.target.value)} />
                </div>
              </fieldset>
            )}
            <button className="btn btn-secondary" type="button" onClick={() => void generate()} disabled={busy} style={{ alignSelf: "flex-start" }}>
              {busy ? "Drafting…" : latest ? "Write a new draft" : "Write my draft"}
            </button>
          </section>
        </div>

        <section className="main card" aria-labelledby="draft-h" style={{ flex: "999 1 520px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="draft-h" style={{ margin: 0, fontSize: "1.3rem" }}>Your draft</h2>
            <p role="status" className="row" style={{ margin: 0, fontWeight: 600, gap: 8 }}>
              {approved && <Icon name="check" strokeWidth={2.6} />}
              {busy ? "Drafting…" : !latest ? "No draft yet" : approved ? "Approved. You can copy or open it now." : "Draft ready. Review it, then approve."}
            </p>
          </div>
          {notice && <div className="callout callout-warn"><Icon name="info" /><span>{notice}</span></div>}

          {latest && (
            <div className="panel" style={{ background: "var(--ground)", padding: "14px 16px" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>This draft shares:</p>
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                <li>{shared.length} accommodation{shared.length === 1 ? "" : "s"}: {shared.map((c) => ACCOMMODATION_LABELS[c].toLowerCase()).join(", ")}</li>
                <li>{latest.disclosed ? `Disclosure on: ${latest.disclosedConditions.includes("free_text") ? "your own words" : latest.disclosedConditions.map((c) => CONDITION_LABELS[c as keyof typeof CONDITION_LABELS] ?? c).join(", ")} (only what you picked)` : "No condition or diagnosis"}</li>
              </ul>
              {disclose !== latest.disclosed && <p className="small" style={{ margin: "6px 0 0" }}>You changed the disclosure choice. Press "Write a new draft" to apply it{disclose && conditionLabels.length ? ` (${conditionLabels.join(", ")})` : ""}.</p>}
            </div>
          )}

          <div className="field">
            <label htmlFor="to" className="label">To</label>
            <p id="to-hint" className="hint">{COPY.email.recipientHint}</p>
            <input id="to" className="input" type="email" value={to} aria-describedby="to-hint" onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="subj" className="label">Subject</label>
            <input id="subj" className="input" type="text" value={subject} disabled={!latest} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} onBlur={() => void persistEdit()} />
          </div>
          <div className="field">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
              <label htmlFor="body" className="label">Message</label>
              <DictateButton disabled={!latest} onText={(t) => { setBody((b) => `${b}${b.endsWith("\n") || !b ? "" : " "}${t}`); setDirty(true); }} />
            </div>
            <textarea id="body" className="input" rows={14} value={body} disabled={!latest} onChange={(e) => { setBody(e.target.value); setDirty(true); }} onBlur={() => void persistEdit()} />
          </div>

          <div className="row">
            <button className="btn btn-primary btn-lg" type="button" onClick={() => void onApprove()} disabled={!latest || busy || approved} style={{ minHeight: 52 }}>
              {approved ? "Approved" : "Approve draft"}
            </button>
            <button className="btn btn-secondary" type="button" disabled={!approved} aria-describedby={!approved ? "lock-why" : undefined} onClick={() => void onCopy()}>
              <Icon name="copy" size={18} />{copied && approved ? "Copied" : "Copy email"}
            </button>
            {approved ? (
              <a className="btn btn-secondary" href={mailto}><Icon name="mail" size={18} />Open in mail app</a>
            ) : (
              <button className="btn btn-secondary" type="button" disabled aria-describedby="lock-why"><Icon name="mail" size={18} />Open in mail app</button>
            )}
          </div>
          {!approved && <p id="lock-why" className="hint">{COPY.email.lockWhy}</p>}

          <div className="callout callout-warn"><Icon name="info" size={22} /><p className="small" style={{ margin: 0 }}>{COPY.email.disclaimer}</p></div>

          <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid #e4e6eb", paddingTop: 18 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>Employer's application page</p>
              <p className="hint">Opens in a new tab. We'll ask if you applied when you come back.</p>
            </div>
            <a className="btn btn-secondary" href={job.applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => { awayToEmployer.current = true; }}>
              Open application page<Icon name="external" size={18} /><span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          {askApplied && (
            <div role="region" aria-label="Did you apply?" className="row" style={{ padding: "14px 16px", borderRadius: 12, border: "2px solid var(--ink)" }}>
              <p style={{ margin: 0, fontWeight: 700, flex: "1 1 220px" }}>Back from the employer's site. Did you apply?</p>
              <button className="btn btn-primary" type="button" onClick={() => void onMarkApplied()}>Mark as applied</button>
              <button className="btn btn-ghost" type="button" onClick={() => setAskApplied(false)}>Not yet</button>
            </div>
          )}
          {!askApplied && (
            <button type="button" className="btn-link" style={{ alignSelf: "flex-start" }} onClick={() => setAskApplied(true)}>Already applied? Mark it in your tracker</button>
          )}
        </section>
      </div>
    </main>
  );
}

// Dictation into the message (P2): hold to record; text is added at the end.
function DictateButton({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const { transcribe, supported } = useVoice();
  const announce = useAnnounce();
  const rec = useRef(new PushToTalkRecorder());
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const held = useRef(false);
  if (!supported) return null;
  const down = async () => {
    if (held.current || disabled) return;
    held.current = true;
    try {
      await rec.current.start();
      setState("rec");
      announce(COPY.voice.listening);
    } catch {
      held.current = false;
      announce("Microphone access was blocked.");
    }
  };
  const up = async () => {
    if (!held.current) return;
    held.current = false;
    setState("busy");
    const r = await rec.current.stop();
    try {
      if (r) {
        const t = await transcribe(r.audio, r.mimeType);
        if (t) { onText(t); announce("Dictation added."); }
      }
    } catch (e) {
      announce(toAppError(e).message, "assertive");
    } finally {
      setState("idle");
    }
  };
  return (
    <button type="button" className="btn btn-ghost" disabled={disabled} aria-pressed={state === "rec"} title={COPY.voice.privacy}
      onPointerDown={(e) => { e.preventDefault(); void down(); }} onPointerUp={() => void up()} onPointerLeave={() => void up()}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void down(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void up(); } }}>
      <Icon name="mic" size={18} />{state === "rec" ? "Listening… release to add" : state === "busy" ? "Working…" : "Hold to dictate"}
    </button>
  );
}
