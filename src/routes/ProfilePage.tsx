import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ACCOMMODATION_CODES, ACCOMMODATION_HINTS, ACCOMMODATION_LABELS, CHOSEN_ROLES, CONDITION_LABELS, CONDITION_SUGGESTIONS, CONDITIONS,
  LIMITS, ROLE_LABELS, type AccommodationCode, type AccommodationNeed, type ChosenRole, type Condition,
} from "../../shared/taxonomy";
import type { RemotePreference } from "../../shared/types";
import { COPY } from "../copy";
import { PageHeading, useDocumentTitle } from "../a11y/PageHeading";
import { useAnnounce } from "../a11y/Announcer";
import { SPACING_DEFAULT, SPACING_PRESET, spacingOn, usePrefs } from "../a11y/prefs";
import { Icon } from "../components/Icon";
import { toAppError } from "../lib/errors";
import { useFitLayout } from "../lib/useFitLayout";

const ROLE_HINTS: Record<ChosenRole, string> = {
  full_stack_developer: "Also shows close matches like Frontend and Backend Engineer",
  ml_engineer: "Also shows close matches like Applied Scientist",
};

export default function ProfilePage() {
  useDocumentTitle(COPY.profile.title);
  const profile = useQuery(api.profiles.get);
  const sensitive = useQuery(api.profiles.getSensitive);
  const save = useMutation(api.profiles.save);
  const saveSensitive = useMutation(api.profiles.saveSensitive);
  const runMatches = useAction(api.matches.run);
  const { prefs, update, openSettings } = usePrefs();
  const announce = useAnnounce();
  const navigate = useNavigate();

  const [skills, setSkills] = useState<string[]>([]);
  const [roles, setRoles] = useState<ChosenRole[]>([]);
  const [needs, setNeeds] = useState<Record<AccommodationCode, AccommodationNeed>>(
    () => Object.fromEntries(ACCOMMODATION_CODES.map((c) => [c, "not_needed"])) as Record<AccommodationCode, AccommodationNeed>,
  );
  const [remotePreference, setRemotePreference] = useState<RemotePreference>("either");
  const [locationText, setLocationText] = useState("");
  const [fullName, setFullName] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [otherNeuro, setOtherNeuro] = useState("");
  const [otherDisability, setOtherDisability] = useState("");
  const [errors, setErrors] = useState<{ skills?: string; roles?: string; form?: string }>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || profile === undefined || sensitive === undefined) return;
    loaded.current = true;
    if (profile) {
      setSkills(profile.skills);
      setRoles(profile.roleIds);
      setNeeds((n) => {
        const next = { ...n };
        for (const c of profile.requiredAccommodations) next[c] = "required";
        for (const c of profile.preferredAccommodations) next[c] = "preferred";
        return next;
      });
      setRemotePreference(profile.remotePreference);
      setLocationText(profile.locationText);
      setFullName(profile.fullName ?? "");
      if (profile.updatedAt && profile.version > 0) setStatus(`${COPY.profile.saved}.`);
    }
    if (sensitive) {
      setConditions(sensitive.selected);
      setOtherNeuro(sensitive.otherNeuro);
      setOtherDisability(sensitive.otherDisability);
    }
  }, [profile, sensitive]);

  const required = ACCOMMODATION_CODES.filter((c) => needs[c] === "required");
  const preferred = ACCOMMODATION_CODES.filter((c) => needs[c] === "preferred");
  const featuresChosen = prefs.voiceNav || prefs.ttsHighlight || prefs.voiceReader || prefs.font !== "system" || spacingOn(prefs);
  const privateTouched = conditions.length > 0 || !!otherNeuro.trim() || !!otherDisability.trim();
  const sections = [
    { id: "s1", label: "1. Resume and skills", done: skills.length > 0 },
    { id: "s2", label: "2. Features to apply", done: featuresChosen },
    { id: "s3", label: "3. Employer accommodations", done: required.length + preferred.length > 0 },
    { id: "s4", label: "4. About you", done: privateTouched, optional: true },
    { id: "s5", label: "5. Roles and location", done: roles.length > 0 },
  ];
  const doneCount = sections.filter((s) => s.done).length;

  const doSave = async (): Promise<boolean> => {
    const errs: typeof errors = {};
    if (!skills.length) errs.skills = "Add at least one skill.";
    if (!roles.length) errs.roles = "Add at least one role.";
    setErrors(errs);
    if (errs.skills || errs.roles) {
      announce(Object.values(errs).join(" "), "assertive");
      document.getElementById(errs.skills ? "add-skill" : "role-full_stack_developer")?.focus();
      return false;
    }
    setBusy(true);
    try {
      await save({
        skills, roleIds: roles, requiredAccommodations: required, preferredAccommodations: preferred,
        interface: prefs, locationText: locationText.trim(), remotePreference, fullName: fullName.trim(),
      });
      await saveSensitive({ selected: conditions, otherNeuro: otherNeuro.trim(), otherDisability: otherDisability.trim() });
      setStatus(`${COPY.profile.saved}.`);
      announce(COPY.profile.saved);
      return true;
    } catch (e) {
      const a = toAppError(e);
      setErrors(a.field === "skills" ? { skills: a.message } : a.field === "roleIds" ? { roles: a.message } : { form: a.message });
      announce(a.message, "assertive");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAndFind = async () => {
    if (!(await doSave())) return;
    setStatus(COPY.jobs.finding);
    try {
      await runMatches({});
    } catch {
      /* the Jobs page shows the error and a retry */
    }
    navigate("/jobs");
  };

  // Wide screens: the section list and progress stay in view while the form scrolls (styles in base.css).
  const pageRef = useRef<HTMLElement>(null);
  useFitLayout(pageRef, { minWidth: 960, minHeight: 360, enabled: profile !== undefined });

  if (profile === undefined) return <main id="main" className="container" style={{ paddingBlock: 40 }} role="status">Loading your profile…</main>;

  return (
    <>
      <main id="main" className="container profile-page" ref={pageRef}>
        <nav aria-label="Profile sections" className="stack profile-nav">
          <PageHeading>{COPY.profile.title}</PageHeading>
          <div>
            <p style={{ margin: "0 0 8px", fontWeight: 700 }} id="progress-label">{doneCount} of 5 sections done</p>
            <div role="progressbar" aria-labelledby="progress-label" aria-valuemin={0} aria-valuemax={5} aria-valuenow={doneCount}
              style={{ height: 12, borderRadius: 999, background: "#e4e6eb", border: "1px solid var(--field-border)", overflow: "hidden" }}>
              <div style={{ width: `${doneCount * 20}%`, height: "100%", background: "var(--accent)" }} />
            </div>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="row" style={{ gap: 10, minHeight: 44, color: "var(--ink)", textDecoration: "none", fontWeight: 600, flexWrap: "nowrap" }}>
                  <Icon name={s.done ? "check" : "circle"} strokeWidth={s.done ? 2.4 : 2} />
                  <span>{s.label} <span className="muted" style={{ fontWeight: 400 }}>({s.done ? "done" : s.optional ? "optional" : "to do"})</span></span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="stack profile-form" data-voice-scroll>
          {errors.form && <div className="callout callout-error" role="alert"><Icon name="alert" />{errors.form}</div>}
          <section className="card" aria-labelledby="name-h" style={{ gap: 10 }}>
            <h2 id="name-h" style={{ margin: 0, fontSize: "1.4rem" }}>Your name <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></h2>
            <div className="field">
              <label htmlFor="full-name" className="label">Full name</label>
              <p id="full-name-hint" className="hint">{COPY.profile.nameHint}</p>
              <input className="input" id="full-name" type="text" autoComplete="name" maxLength={LIMITS.maxNameLength} value={fullName}
                aria-describedby="full-name-hint" onChange={(e) => setFullName(e.target.value)} style={{ maxWidth: 420 }} />
            </div>
          </section>
          <ResumeSection skills={skills} setSkills={setSkills} error={errors.skills} />

          <section id="s2" className="card" aria-labelledby="s2-h">
            <div>
              <h2 id="s2-h" style={{ margin: 0, fontSize: "1.4rem" }}>2. Accessibility features you need to apply for jobs</h2>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                These change how this app works for you, right away. They are never shared with employers.{" "}
                <button type="button" className="btn-link" onClick={openSettings}>Fine-tune text and spacing</button>
              </p>
            </div>
            <fieldset>
              <legend className="sr-only">Accessibility features</legend>
              <div className="grid-auto">
                <Feature label="Voice control" hint={'Hold to talk: "go to jobs", "open job", "apply"'} checked={prefs.voiceNav} onChange={(v) => update({ voiceNav: v })} />
                <Feature label="Text-to-speech with word highlighting" hint="Each word lights up as it is read" checked={prefs.ttsHighlight} onChange={(v) => update({ ttsHighlight: v })} />
                <Feature label="Voice reader" hint="Hear full job descriptions" checked={prefs.voiceReader} onChange={(v) => update({ voiceReader: v })} />
                <Feature label="Dyslexia-friendly fonts" hint="Atkinson Hyperlegible or OpenDyslexic" checked={prefs.font !== "system"} onChange={(v) => update({ font: v ? "atkinson" : "system" })} />
                <Feature label="Adjustable text and line spacing" hint="Text up to 200%, wider lines and letters" checked={spacingOn(prefs)} onChange={(v) => update(v ? SPACING_PRESET : SPACING_DEFAULT)} />
              </div>
            </fieldset>
          </section>

          <section id="s3" className="card" aria-labelledby="s3-h">
            <div>
              <h2 id="s3-h" style={{ margin: 0, fontSize: "1.4rem" }}>3. Accommodations you require from your employer</h2>
              <p className="muted" style={{ margin: "6px 0 0" }}>Required needs are checked against each listing. Preferred ones are shown but never change your results.</p>
            </div>
            <div>
              {ACCOMMODATION_CODES.map((code) => (
                <fieldset key={code} className="row" style={{ justifyContent: "space-between", gap: "12px 24px", padding: "14px 0", borderTop: "1px solid #e4e6eb" }}>
                  <legend style={{ float: "left", margin: 0, maxWidth: 520 }}>
                    <span style={{ fontWeight: 700 }}>{ACCOMMODATION_LABELS[code]}</span>
                    {ACCOMMODATION_HINTS[code] && <><br /><span className="small muted" style={{ fontWeight: 400 }}>{ACCOMMODATION_HINTS[code]}</span></>}
                  </legend>
                  <div className="seg">
                    {(["required", "preferred", "not_needed"] as const).map((n) => (
                      <label key={n}>
                        <input type="radio" name={`need-${code}`} checked={needs[code] === n} onChange={() => setNeeds((x) => ({ ...x, [code]: n }))} />
                        <span className="tick"><Icon name="check" size={16} strokeWidth={3} /></span>
                        {n === "required" ? "Required" : n === "preferred" ? "Preferred" : "Not needed"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <PrivateSection
            conditions={conditions} setConditions={setConditions}
            otherNeuro={otherNeuro} setOtherNeuro={setOtherNeuro}
            otherDisability={otherDisability} setOtherDisability={setOtherDisability}
            needs={needs} setNeeds={setNeeds}
          />

          <section id="s5" className="card" aria-labelledby="s5-h">
            <h2 id="s5-h" style={{ margin: 0, fontSize: "1.4rem" }}>5. Roles you are interested in</h2>
            <fieldset aria-describedby={errors.roles ? "roles-err" : undefined}>
              <legend>Choose at least one role</legend>
              <div className="grid-auto">
                {CHOSEN_ROLES.map((r) => (
                  <label key={r} className="check">
                    <input id={`role-${r}`} type="checkbox" checked={roles.includes(r)} aria-invalid={!!errors.roles}
                      onChange={(e) => setRoles((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />
                    <span><strong>{ROLE_LABELS[r]}</strong><br /><span className="small muted">{ROLE_HINTS[r]}</span></span>
                  </label>
                ))}
              </div>
              {errors.roles && <p id="roles-err" className="field-error" style={{ marginTop: 8 }}><Icon name="x" size={18} />{errors.roles}</p>}
            </fieldset>
            <div className="row" style={{ alignItems: "flex-start", gap: 20 }}>
              <fieldset style={{ flex: "1 1 260px" }}>
                <legend>Where you want to work</legend>
                <div className="seg">
                  {(["remote", "onsite", "either"] as const).map((w) => (
                    <label key={w}>
                      <input type="radio" name="workplace" checked={remotePreference === w} onChange={() => setRemotePreference(w)} />
                      <span className="tick"><Icon name="check" size={16} strokeWidth={3} /></span>
                      {w === "remote" ? "Remote" : w === "onsite" ? "On-site" : "Either"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="field" style={{ flex: "1 1 260px" }}>
                <label htmlFor="loc" className="label">City or region <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
                <input className="input" id="loc" type="text" maxLength={100} value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="For example: Chicago or United States" />
              </div>
            </div>
          </section>

          <DeleteSection />
        </div>
      </main>

      <div style={{ position: "sticky", bottom: 0, background: "var(--surface)", borderTop: "2px solid var(--ink)", zIndex: 5 }}>
        <div className="container row" style={{ justifyContent: "space-between", paddingBlock: 14, gap: "12px 20px" }}>
          <p role="status" className="row" style={{ margin: 0, fontWeight: 600, gap: 8 }}>
            {status && <Icon name="check" strokeWidth={2.4} />}
            {status}
          </p>
          <div className="row">
            <button className="btn btn-secondary" type="button" onClick={() => void doSave()} disabled={busy}>Save</button>
            <button className="btn btn-primary btn-lg" type="button" onClick={() => void saveAndFind()} disabled={busy} style={{ minHeight: 52 }}>
              Save and find jobs
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Feature({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><strong>{label}</strong><br /><span className="small muted">{hint}</span></span>
    </label>
  );
}

// ---------- 1. Resume and skills ----------

function ResumeSection({ skills, setSkills, error }: { skills: string[]; setSkills: (f: (s: string[]) => string[]) => void; error?: string }) {
  const generateUploadUrl = useMutation(api.resume.generateUploadUrl);
  const extract = useAction(api.resume.extractSkills);
  const announce = useAnnounce();
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [newSkill, setNewSkill] = useState("");
  const [lastFile, setLastFile] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const consentId = useId();

  const merge = (found: string[]) =>
    setSkills((s) => {
      const seen = new Set(s.map((x) => x.toLowerCase()));
      return [...s, ...found.filter((f) => !seen.has(f.toLowerCase()))].slice(0, LIMITS.maxSkills);
    });

  const runExtract = async (args: { storageId?: Id<"_storage">; text?: string }) => {
    setReading(true);
    setMsg(null);
    announce(COPY.profile.resumeReading);
    try {
      const r = await extract({ ...args, consent });
      merge(r.skills);
      const m = r.skills.length
        ? `Found ${r.skills.length} skills. Check them below. ${r.warnings.join(" ")}`
        : r.warnings.join(" ") || "We could not find any skills. Add skills by hand.";
      setMsg({ kind: r.warnings.length ? "warn" : "ok", text: m });
      announce(m);
    } catch (e) {
      const a = toAppError(e);
      setMsg({ kind: "error", text: a.message });
      announce(a.message, "assertive");
      if (a.code === "EXTRACTION_FAILED" || a.code === "UNSUPPORTED_TYPE") setMode("text");
    } finally {
      setReading(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!consent) {
      setMsg({ kind: "error", text: "Tick the consent box first, or add skills by hand." });
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMsg({ kind: "error", text: "Only PDF files work here. You can paste the text instead." });
      return;
    }
    if (file.size > LIMITS.resumeMaxBytes) {
      setMsg({ kind: "error", text: "That file is over 5 MB. Try a smaller PDF or paste the text." });
      return;
    }
    setLastFile(file.name);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await runExtract({ storageId });
    } catch (e) {
      const a = toAppError(e);
      setMsg({ kind: "error", text: a.message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addSkill = () => {
    const s = newSkill.trim();
    if (!s) return;
    if (s.length > LIMITS.maxSkillLength) {
      setMsg({ kind: "error", text: `Each skill must be ${LIMITS.maxSkillLength} characters or fewer.` });
      return;
    }
    merge([s]);
    setNewSkill("");
    announce(`Added ${s}`);
  };

  return (
    <section id="s1" className="card" aria-labelledby="s1-h">
      <h2 id="s1-h" style={{ margin: 0, fontSize: "1.4rem" }}>1. Upload your resume</h2>
      <label className="check">
        <input id={consentId} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span><strong>{COPY.profile.resumeConsent}</strong> {COPY.profile.resumeConsentDetail}</span>
      </label>
      {mode === "pdf" ? (
        <div className="row" style={{ gap: 16, padding: 24, border: "2px dashed var(--field-border)", borderRadius: 14, background: "var(--ground)" }}>
          <Icon name="upload" size={32} />
          <div style={{ flex: "1 1 220px" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{lastFile ? `${lastFile} · read and deleted` : "Upload a PDF resume"}</p>
            <p className="small muted" style={{ margin: 0 }}>{COPY.profile.resumeLimits}</p>
          </div>
          <input ref={fileRef} id="resume-file" type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-label="Resume PDF" disabled={!consent || reading} onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className="btn btn-secondary" disabled={reading}
            onClick={() => (consent ? fileRef.current?.click() : setMsg({ kind: "error", text: "Tick the consent box first, or add skills by hand." }))}>
            {lastFile ? "Choose another PDF" : "Choose a PDF"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setMode("text")}>Paste text instead</button>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="resume-text" className="label">Paste your resume text</label>
          <textarea id="resume-text" className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button className="btn btn-secondary" type="button" disabled={!consent || reading || !text.trim()} onClick={() => void runExtract({ text })}>Find skills in this text</button>
            <button className="btn btn-ghost" type="button" onClick={() => setMode("pdf")}>Upload a PDF instead</button>
          </div>
        </div>
      )}
      {reading && <p role="status" style={{ margin: 0, fontWeight: 600 }}>{COPY.profile.resumeReading}</p>}
      {msg && (
        <div className={`callout ${msg.kind === "error" ? "callout-error" : msg.kind === "warn" ? "callout-warn" : "callout-info"}`}>
          <Icon name={msg.kind === "ok" ? "check" : "alert"} />
          <span>{msg.text}</span>
        </div>
      )}

      <div className="stack" style={{ gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Your skills <span className="muted" style={{ fontWeight: 400 }}>({skills.length}, check them)</span></h3>
        {skills.length === 0 ? <p className="muted" style={{ margin: 0 }}>{COPY.profile.skillsEmpty}</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }} aria-label="Your skills">
            {skills.map((s, i) => (
              <SkillChip key={`${s}-${i}`} name={s}
                onRename={(n) => setSkills((x) => x.map((y, j) => (j === i ? n : y)))}
                onRemove={() => { setSkills((x) => x.filter((_, j) => j !== i)); announce(`Removed ${s}`); }} />
            ))}
          </ul>
        )}
        <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <label htmlFor="add-skill" className="label">Add a skill</label>
            <input className="input" id="add-skill" type="text" value={newSkill} placeholder="For example: Tailwind CSS" maxLength={LIMITS.maxSkillLength}
              aria-invalid={!!error} aria-describedby={error ? "skills-err" : undefined}
              onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} />
          </div>
          <button className="btn btn-secondary" type="button" onClick={addSkill} style={{ minHeight: 48 }}>Add skill</button>
        </div>
        {error && <p id="skills-err" className="field-error"><Icon name="x" size={18} />{error}</p>}
      </div>
    </section>
  );
}

function SkillChip({ name, onRename, onRemove }: { name: string; onRename: (n: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const commit = () => {
    const v = value.trim();
    if (v && v.length <= LIMITS.maxSkillLength) onRename(v);
    else setValue(name);
    setEditing(false);
  };
  return (
    <li style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 4px 2px 6px", borderRadius: 999, background: "#eef2ff", border: "1px solid #a5b4fc", fontWeight: 600 }}>
      {editing ? (
        <input ref={inputRef} aria-label={`Rename ${name}`} value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(name); setEditing(false); } }}
          style={{ minHeight: 36, border: "2px solid var(--field-border)", borderRadius: 8, padding: "0 8px", width: 160 }} />
      ) : (
        <button type="button" onClick={() => setEditing(true)} aria-label={`${name}, rename`} style={{ minHeight: 36, border: 0, background: "transparent", padding: "0 8px", fontWeight: 600, cursor: "text" }}>{name}</button>
      )}
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 999, border: 0, background: "transparent", cursor: "pointer" }}>
        <Icon name="x" size={16} strokeWidth={2.4} />
      </button>
    </li>
  );
}

// ---------- 4. Optional private section ----------

function PrivateSection(p: {
  conditions: string[]; setConditions: (f: (c: string[]) => string[]) => void;
  otherNeuro: string; setOtherNeuro: (v: string) => void;
  otherDisability: string; setOtherDisability: (v: string) => void;
  needs: Record<AccommodationCode, AccommodationNeed>; setNeeds: (f: (n: Record<AccommodationCode, AccommodationNeed>) => Record<AccommodationCode, AccommodationNeed>) => void;
}) {
  const { prefs, update } = usePrefs();
  const announce = useAnnounce();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const suggestions = useMemo(() => {
    const out: { key: string; text: string; apply: () => void; done: boolean }[] = [];
    for (const c of p.conditions as Condition[]) {
      const s = CONDITION_SUGGESTIONS[c];
      if (!s) continue;
      for (const code of s.accommodations) {
        out.push({ key: `a-${code}`, text: `Add "${ACCOMMODATION_LABELS[code]}" as a preferred accommodation`, done: p.needs[code] !== "not_needed",
          apply: () => p.setNeeds((n) => ({ ...n, [code]: n[code] === "not_needed" ? "preferred" : n[code] })) });
      }
      for (const i of s.interface) {
        const map = {
          dyslexiaFont: { text: "Turn on a dyslexia-friendly font", done: prefs.font !== "system", apply: () => update({ font: "atkinson" }) },
          spacing: { text: "Turn on wider text spacing", done: spacingOn(prefs), apply: () => update(SPACING_PRESET) },
          tts: { text: "Turn on text-to-speech with word highlighting", done: prefs.ttsHighlight, apply: () => update({ ttsHighlight: true }) },
          voice: { text: "Turn on voice control", done: prefs.voiceNav, apply: () => update({ voiceNav: true }) },
          highContrast: { text: "Turn on high contrast", done: prefs.contrast === "high", apply: () => update({ contrast: "high" }) },
          largeText: { text: "Make text 150% larger", done: prefs.textScale >= 1.5, apply: () => update({ textScale: 1.5 }) },
        }[i];
        out.push({ key: `i-${i}`, ...map });
      }
    }
    const seen = new Set<string>();
    return out.filter((s) => !seen.has(s.key) && seen.add(s.key) && !dismissed.includes(s.key));
  }, [p, prefs, update, dismissed]);

  return (
    <section id="s4" className="card" aria-labelledby="s4-h" style={{ background: "var(--surface-2)" }}>
      <details>
        <summary style={{ cursor: "pointer", listStyle: "none" }}>
          <span className="row" style={{ justifyContent: "space-between", gap: "12px 20px", alignItems: "flex-start" }}>
            <span className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", flex: "1 1 400px" }}>
              <Icon name="lock" size={24} />
              <span>
                <span id="s4-h" style={{ display: "block", fontSize: "1.4rem", fontWeight: 700 }}>4. {COPY.profile.privateTitle} <span className="muted" style={{ fontWeight: 400 }}>(optional, private)</span></span>
                <span className="muted" style={{ display: "block", marginTop: 4 }}>{COPY.profile.privateExplain}</span>
              </span>
            </span>
            <span className="btn btn-secondary" aria-hidden="true">Show or hide</span>
          </span>
        </summary>
        <fieldset style={{ marginTop: 20 }}>
          <legend>Select any that apply</legend>
          <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
            {CONDITIONS.map((c) => (
              <label key={c} className="check">
                <input type="checkbox" checked={p.conditions.includes(c)}
                  onChange={(e) => p.setConditions((x) => (e.target.checked ? [...x, c] : x.filter((y) => y !== c)))} />
                <span>{CONDITION_LABELS[c]}</span>
              </label>
            ))}
          </div>
          <div className="grid-auto" style={{ marginTop: 16 }}>
            <div className="field"><label htmlFor="oth-n" className="label">Other neurodivergence</label><input className="input" id="oth-n" maxLength={200} value={p.otherNeuro} onChange={(e) => p.setOtherNeuro(e.target.value)} /></div>
            <div className="field"><label htmlFor="oth-d" className="label">Other disability</label><input className="input" id="oth-d" maxLength={200} value={p.otherDisability} onChange={(e) => p.setOtherDisability(e.target.value)} /></div>
          </div>
        </fieldset>
        {suggestions.length > 0 && (
          <div className="stack" style={{ marginTop: 20, gap: 10 }} aria-labelledby="sugg-h">
            <h3 id="sugg-h" style={{ margin: 0, fontSize: "1.1rem" }}>Suggestions you can accept or ignore</h3>
            <p className="hint">People who select these often choose the following. Nothing changes unless you press a button.</p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }} className="stack">
              {suggestions.map((s) => (
                <li key={s.key} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span>{s.text}</span>
                  {s.done ? <span className="row small" style={{ gap: 6, fontWeight: 600 }}><Icon name="check" size={18} />Already on</span> : (
                    <span className="row" style={{ gap: 6 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { s.apply(); announce(`${s.text}: done`); }}>Accept</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDismissed((d) => [...d, s.key])}>Ignore</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </section>
  );
}

// ---------- Your data: delete everything (A15) ----------

function DeleteSection() {
  const deleteAll = useMutation(api.account.deleteAll);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await deleteAll({ confirm: true });
      setResult(r.deleted);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    ref.current?.close();
    navigate("/", { replace: true });
    await signOut().catch(() => undefined);
  };

  const labels: Record<string, string> = {
    profiles: "Profile", sensitiveProfiles: "Private selections", matches: "Job matches", matchRequests: "Match requests",
    emailDrafts: "Email drafts", applications: "Tracker rows", rateLimits: "Usage counters", sessions: "Sessions",
    refreshTokens: "Sign-in tokens", account: "Account", files: "Stored files",
  };

  return (
    <section className="card" aria-labelledby="del-h" style={{ borderColor: "var(--error)" }}>
      <h2 id="del-h" style={{ margin: 0, fontSize: "1.4rem" }}>{COPY.profile.deleteTitle}</h2>
      <p className="muted" style={{ margin: 0 }}>{COPY.profile.deleteExplain}</p>
      <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start", borderColor: "var(--error)", color: "var(--error-ink)" }}
        onClick={() => { setResult(null); ref.current?.showModal(); }}>
        Delete all my data
      </button>
      <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={(e) => { if (result) { e.preventDefault(); void finish(); } }}>
        <div className="stack" style={{ padding: 24 }}>
          {!result ? (
            <>
              <h2 id={titleId} style={{ margin: 0 }}>Delete all your data?</h2>
              <p style={{ margin: 0 }}>This removes your profile, private selections, matches, email drafts, tracker and account. It cannot be undone.</p>
              {error && <p className="field-error" role="alert">{error}</p>}
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} autoFocus>Cancel</button>
                <button type="button" className="btn btn-primary" style={{ background: "var(--error)" }} onClick={() => void confirm()} disabled={busy} data-voice-danger>
                  {busy ? "Deleting…" : "Yes, delete everything"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id={titleId} style={{ margin: 0 }} tabIndex={-1}>Your data has been deleted</h2>
              <p role="status" style={{ margin: 0 }}>Here is what we removed:</p>
              <ul style={{ margin: 0 }}>
                {Object.entries(result).map(([k, n]) => <li key={k}>{labels[k] ?? k}: {n}</li>)}
              </ul>
              <button type="button" className="btn btn-primary" onClick={() => void finish()} style={{ alignSelf: "flex-end" }} autoFocus>Done</button>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
