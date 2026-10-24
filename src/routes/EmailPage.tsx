import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ACCOMMODATION_CODES, ACCOMMODATION_HINTS, ACCOMMODATION_LABELS, CONDITION_LABELS, CONDITIONS, type AccommodationCode } from "../../shared/taxonomy";
import { NAME_PLACEHOLDER } from "../../shared/types";
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
  const clearDraft = useMutation(api.emails.clear);
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
  const [optionsChanged, setOptionsChanged] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
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

  // Prefill "To" once with the address the listing gives for accommodation requests.
  const contactEmail = job?.accommodationContact?.email ?? "";
  const toPrefilled = useRef(false);
  useEffect(() => {
    if (toPrefilled.current || !contactEmail) return;
    toPrefilled.current = true;
    setTo((t) => t || contactEmail);
  }, [contactEmail]);

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
      setOptionsChanged(false);
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
  const needsName = !!latest && body.includes(NAME_PLACEHOLDER);
  const cleared = !!latest && !latest.subject && !latest.body;
  const sameCodes = (a: string[], b: string[]) => a.length === b.length && a.every((c) => b.includes(c));
  // The draft is out of date once the choices on the left no longer match what it was written from.
  const stale = !!latest && !cleared && !busy && (!sameCodes(codes, latest.accommodationCodes) || disclose !== latest.disclosed || optionsChanged);

  const persistEdit = async (fromApprove = false) => {
    if (!latest || !dirty) return true;
    if (!subject.trim() || !body.trim()) {
      // While writing from scratch, wait until both are filled in; Approve says what is missing.
      if (fromApprove) setError("Add a subject and a message before approving.");
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
    if (!latest || needsName) return;
    if (!(await persistEdit(true))) return;
    try {
      await approve({ draftId: latest._id });
      announce("Approved. You can copy or open it now.");
    } catch (e) {
      setError(toAppError(e).message);
    }
  };

  const onClear = async () => {
    setConfirmClear(false);
    if (!latest) return;
    try {
      await clearDraft({ draftId: latest._id });
      setSubject("");
      setBody("");
      setDirty(false);
      setNotice("");
      announce("Draft cleared. Write your own, or press Write a new draft.");
      document.getElementById("subj")?.focus();
    } catch (e) {
      setError(toAppError(e).message);
    }
  };

  const useMyName = () => {
    if (!profile?.fullName) return;
    setBody((b) => b.replaceAll(NAME_PLACEHOLDER, profile.fullName!));
    setDirty(true);
    announce(`Signed with ${profile.fullName}.`);
  };
  const selectPlaceholder = () => {
    const el = document.getElementById("body") as HTMLTextAreaElement | null;
    const at = body.indexOf(NAME_PLACEHOLDER);
    if (!el || at < 0) return;
    el.focus();
    el.setSelectionRange(at, at + NAME_PLACEHOLDER.length);
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

      {job.accommodationForm && (
        <section className="callout callout-info" aria-labelledby="form-h" data-testid="employer-form">
          <Icon name="info" />
          <div className="stack" style={{ gap: 8 }}>
            <h2 id="form-h" style={{ margin: 0, fontSize: "1.15rem" }}>{COPY.email.formTitle(job.employer?.name ?? "This employer")}</h2>
            <p style={{ margin: 0 }}>{COPY.email.formBody}</p>
            <blockquote className="quote small">Listing says: "{job.accommodationForm.quote}"</blockquote>
            <span className="row" style={{ gap: 12 }}>
              <a className="btn btn-primary" href={job.accommodationForm.url} target="_blank" rel="noopener noreferrer">
                {COPY.email.formOpen}<Icon name="external" size={18} /><span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="small">{COPY.email.formPreferEmail}</span>
            </span>
          </div>
        </section>
      )}

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
              <textarea id="extra" className="input" rows={2} maxLength={500} value={extra} aria-describedby="extra-hint" onChange={(e) => { setExtra(e.target.value); setOptionsChanged(true); }} />
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
                      <input type="checkbox" checked={conditions.includes(c)} onChange={(e) => { setConditions((x) => (e.target.checked ? [...x, c] : x.filter((y) => y !== c))); setOptionsChanged(true); }} />
                      <span>{CONDITION_LABELS[c]}</span>
                    </label>
                  ))}
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label htmlFor="dis-free" className="label">Or write it your way</label>
                  <p id="dis-free-hint" className="hint">If you write something here, it is used instead of the boxes above, exactly as written.</p>
                  <input id="dis-free" className="input" maxLength={500} value={disclosureText} aria-describedby="dis-free-hint" onChange={(e) => { setDisclosureText(e.target.value); setOptionsChanged(true); }} />
                </div>
              </fieldset>
            )}
            {/* Once a draft exists, "Write a new draft" sits with the draft (and lights up when it is out of date). */}
            {!latest && (
              <button className="btn btn-primary" type="button" onClick={() => void generate()} disabled={busy} style={{ alignSelf: "flex-start" }}>
                {busy ? "Drafting…" : "Write my draft"}
              </button>
            )}
          </section>
        </div>

        <section className="main card" aria-labelledby="draft-h" style={{ flex: "999 1 520px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="draft-h" style={{ margin: 0, fontSize: "1.3rem" }}>Your draft</h2>
            <p role="status" className="row" style={{ margin: 0, fontWeight: 600, gap: 8 }}>
              {approved && <Icon name="check" strokeWidth={2.6} />}
              {busy ? "Drafting…" : !latest ? "No draft yet" : cleared ? "Cleared. Write your own, or write a new draft." : stale ? "Out of date. Write a new draft to apply your changes." : approved ? "Approved. You can copy or open it now." : "Draft ready. Review it, then approve."}
            </p>
          </div>
          {latest && (
            <div className="row" style={{ gap: 8 }}>
              <button className={`btn ${stale || cleared ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => void generate()} disabled={busy}>
                <Icon name="refresh" size={18} />{busy ? "Drafting…" : COPY.email.rewrite}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setConfirmClear(true)} disabled={busy || cleared}>
                <Icon name="x" size={18} />Clear draft
              </button>
            </div>
          )}
          {stale && (
            <div className="callout callout-info" data-testid="draft-stale">
              <Icon name="info" />
              <span>
                You changed what to ask for or what to share{disclose !== latest?.disclosed && disclose && conditionLabels.length ? ` (disclosure: ${conditionLabels.join(", ")})` : ""}. This draft does not include it yet. Press "{COPY.email.rewrite}" to update it.
              </span>
            </div>
          )}
          {notice && <div className="callout callout-warn"><Icon name="info" /><span>{notice}</span></div>}

          {latest && !cleared && (
            <div className="panel" style={{ background: "var(--ground)", padding: "14px 16px" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>This draft shares:</p>
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                <li>{shared.length} accommodation{shared.length === 1 ? "" : "s"}: {shared.map((c) => ACCOMMODATION_LABELS[c].toLowerCase()).join(", ")}</li>
                <li>{latest.disclosed ? `Disclosure on: ${latest.disclosedConditions.includes("free_text") ? "your own words" : latest.disclosedConditions.map((c) => CONDITION_LABELS[c as keyof typeof CONDITION_LABELS] ?? c).join(", ")} (only what you picked)` : "No condition or diagnosis"}</li>
              </ul>
            </div>
          )}

          <div className="field">
            <label htmlFor="to" className="label">To</label>
            {contactEmail && to === contactEmail ? (
              <div id="to-hint" className="hint stack" style={{ gap: 4 }} data-testid="to-from-listing">
                <span>{COPY.email.recipientFromListing}</span>
                <blockquote className="quote">Listing says: "{job.accommodationContact?.quote}"</blockquote>
              </div>
            ) : (
              <p id="to-hint" className="hint">{COPY.email.recipientHint}</p>
            )}
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
            <textarea id="body" className="input" rows={14} value={body} disabled={!latest} aria-invalid={needsName || undefined} aria-describedby={needsName ? "name-why" : undefined}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }} onBlur={() => void persistEdit()} />
            {needsName && (
              <div id="name-why" className="callout callout-warn" data-testid="name-placeholder">
                <Icon name="alert" />
                <div className="stack" style={{ gap: 8 }}>
                  <span>
                    The sign-off still says <strong>{NAME_PLACEHOLDER}</strong>. Replace it with your name before you approve.
                    {!profile?.fullName && <> Add your full name in <Link to="/profile">your profile</Link> to fill it in on every draft.</>}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    {profile?.fullName && <button className="btn btn-primary btn-sm" type="button" onClick={useMyName}>Sign as {profile.fullName}</button>}
                    <button className="btn btn-secondary btn-sm" type="button" onClick={selectPlaceholder}>Select {NAME_PLACEHOLDER} in the message</button>
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="row">
            <button className="btn btn-primary btn-lg" type="button" onClick={() => void onApprove()} disabled={!latest || busy || approved || needsName}
              aria-describedby={needsName ? "name-why" : undefined} style={{ minHeight: 52 }}>
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
      <ConfirmClear open={confirmClear} onCancel={() => setConfirmClear(false)} onConfirm={() => void onClear()} />
    </main>
  );
}

// Clearing wipes the user's edits, so it asks first. Cancel is focused by default.
function ConfirmClear({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cancelRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={onCancel} onCancel={onCancel}>
      <div className="stack" style={{ padding: 24 }}>
        <h2 id={titleId} style={{ margin: 0 }}>Clear this draft?</h2>
        <p style={{ margin: 0 }}>This empties the subject and message, including your edits, and you will need to approve again. Your choices on the left stay as they are.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button ref={cancelRef} className="btn btn-secondary" type="button" onClick={onCancel}>Keep my draft</button>
          <button className="btn btn-primary" type="button" onClick={onConfirm}>Clear draft</button>
        </div>
      </div>
    </dialog>
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
