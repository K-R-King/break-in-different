import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { COPY } from "../copy";
import { PageHeading, useDocumentTitle } from "../a11y/PageHeading";
import { useAnnounce } from "../a11y/Announcer";
import { Icon } from "../components/Icon";
import { toAppError } from "../lib/errors";

type Tab = "login" | "signup";
type Errors = { email?: string; password?: string; form?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AccountPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "login" ? "login" : "signup";
  useDocumentTitle(tab === "signup" ? COPY.account.signUpTitle : COPY.account.logInTitle);
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const summaryRef = useRef<HTMLDivElement>(null);
  const next = params.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : tab === "signup" ? "/profile" : "/jobs";

  useEffect(() => {
    if (isAuthenticated) navigate(dest, { replace: true });
  }, [isAuthenticated, navigate, dest]);

  const switchTab = (t: Tab) => {
    setErrors({});
    setParams((p) => {
      p.set("tab", t);
      return p;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = COPY.account.invalidEmail;
    if (tab === "signup" && password.length < 8) errs.password = `Password needs 8 or more characters. Yours has ${password.length}.`;
    if (tab === "login" && !password) errs.password = "Enter your password.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      announce(COPY.account.fixCount(Object.keys(errs).length), "assertive");
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      await signIn("password", { email: email.trim().toLowerCase(), password, flow: tab === "signup" ? "signUp" : "signIn" });
      announce(tab === "signup" ? "Account created." : "Logged in.");
    } catch (err) {
      const a = toAppError(err);
      const field = a.field === "email" || a.field === "password" ? a.field : "form";
      const msg = tab === "login" && a.code === "INTERNAL" ? COPY.account.wrongCredentials : a.message;
      setErrors({ [field]: msg });
      announce(msg, "assertive");
      setTimeout(() => summaryRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  const errList = Object.entries(errors).filter(([, v]) => v) as [keyof Errors, string][];

  return (
    <main id="main" className="container" style={{ paddingBlock: 56, display: "flex", justifyContent: "center" }}>
      <div className="stack" style={{ width: "100%", maxWidth: 520, gap: 20 }}>
        <PageHeading>{tab === "signup" ? COPY.account.signUpTitle : COPY.account.logInTitle}</PageHeading>
        <p className="muted" style={{ margin: 0 }}>{COPY.account.intro}</p>
        <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: 20 }}>
          <div role="tablist" aria-label="Account" style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls="account-panel"
                tabIndex={tab === t ? 0 : -1}
                onClick={() => switchTab(t)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    const other = t === "login" ? "signup" : "login";
                    switchTab(other);
                    document.getElementById(`tab-${other}`)?.focus();
                  }
                }}
                style={{
                  flex: 1, minHeight: 52, border: 0, background: "transparent", fontWeight: 700, cursor: "pointer",
                  color: tab === t ? "var(--ink)" : "var(--muted)", borderBottom: `4px solid ${tab === t ? "var(--ink)" : "transparent"}`,
                }}
              >
                {t === "login" ? COPY.account.logIn : COPY.account.signUp}
              </button>
            ))}
          </div>
          <form id="account-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} onSubmit={onSubmit} noValidate className="stack" style={{ padding: 28, gap: 22 }}>
            {errList.length > 0 && (
              <div ref={summaryRef} tabIndex={-1} className="callout callout-error" aria-labelledby="err-sum">
                <Icon name="alert" size={22} />
                <div>
                  <strong id="err-sum">{COPY.account.fixCount(errList.length)}</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {errList.map(([k, v]) => (
                      <li key={k}>{k === "form" ? v : <a href={`#${k}`} style={{ color: "var(--error-ink)" }}>{v}</a>}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="email" className="label">Email</label>
              <input
                className="input" id="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-err" : undefined}
              />
              {errors.email && <p id="email-err" className="field-error"><Icon name="x" size={18} />{errors.email}</p>}
            </div>
            <div className="field">
              <label htmlFor="password" className="label">Password</label>
              {tab === "signup" && <p id="pw-hint" className="hint">{COPY.account.passwordHint}</p>}
              <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
                <input
                  className="input" id="password" type={show ? "text" : "password"}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} style={{ flex: 1, minWidth: 0 }}
                  aria-invalid={!!errors.password}
                  aria-describedby={[tab === "signup" ? "pw-hint" : "", errors.password ? "pw-err" : ""].filter(Boolean).join(" ") || undefined}
                />
                <button className="btn btn-secondary" type="button" aria-pressed={show} onClick={() => setShow((s) => !s)} style={{ minHeight: 48 }}>
                  <Icon name="eye" />{show ? COPY.account.hidePassword : COPY.account.showPassword}
                </button>
              </div>
              {errors.password && <p id="pw-err" className="field-error"><Icon name="x" size={18} />{errors.password}</p>}
            </div>
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
              {busy ? COPY.account.signingIn : tab === "signup" ? COPY.account.signUp : COPY.account.logIn}
            </button>
            <p className="small muted" style={{ margin: 0, textAlign: "center" }}>
              {COPY.account.enterHint}{" "}
              {tab === "signup" ? (
                <>Already have an account? <button type="button" className="btn-link" onClick={() => switchTab("login")}>Log in</button></>
              ) : (
                <>New here? <button type="button" className="btn-link" onClick={() => switchTab("signup")}>Sign up</button></>
              )}
            </p>
          </form>
        </div>
        <p className="small muted" style={{ margin: 0 }}>{COPY.account.carryOver}</p>
      </div>
    </main>
  );
}
