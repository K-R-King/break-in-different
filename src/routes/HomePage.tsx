import { Link } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { COPY } from "../copy";
import { PageHeading, useDocumentTitle } from "../a11y/PageHeading";
import { usePrefs } from "../a11y/prefs";
import { Icon } from "../components/Icon";

export function HomePage() {
  useDocumentTitle("");
  const { isAuthenticated } = useConvexAuth();
  const { openSettings } = usePrefs();
  const c = COPY.home;
  return (
    <main id="main" className="container" style={{ paddingBlock: "64px", display: "flex", flexDirection: "column", gap: 56 }}>
      <section aria-labelledby="hero-h" style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "center" }}>
        <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <p className="tag" style={{ margin: 0, fontSize: "0.88rem" }}>{c.eyebrow}</p>
          <PageHeading id="hero-h" className="">
            <span style={{ display: "block", fontSize: "clamp(2rem, 4vw, 3.05rem)", lineHeight: 1.12, fontWeight: 800, maxWidth: "20ch" }}>{c.hero}</span>
          </PageHeading>
          <div className="row">
            {isAuthenticated ? (
              <Link className="btn btn-primary btn-lg" to="/jobs">Go to your jobs</Link>
            ) : (
              <Link className="btn btn-primary btn-lg" to="/account?tab=signup">{c.ctaPrimary}</Link>
            )}
            <button className="btn btn-secondary btn-lg" type="button" onClick={openSettings} data-voice-names="adjust text|reading settings|text and reading">{c.ctaSettings}</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>{c.noAccount}</p>
        </div>
        <aside aria-label="Why this matters" className="card" style={{ flex: "1 1 320px", gap: 12 }}>
          <p style={{ margin: 0, fontSize: "3.3rem", fontWeight: 800, lineHeight: 1 }}>{c.statFigure}</p>
          <p style={{ margin: 0, fontSize: "1.12rem", fontWeight: 600 }}>{c.statLine}</p>
          <p className="small muted" style={{ margin: 0 }}>{c.statCaveat}</p>
        </aside>
      </section>

      <nav aria-labelledby="places-h" className="stack">
        <h2 id="places-h" style={{ margin: 0, fontSize: "1.55rem" }}>{c.placesTitle}</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 20 }}>
          {c.places.map((p) => (
            <li key={p.title}>
              <Link className="card" to={isAuthenticated ? p.to : `/account?tab=login&next=${p.to}`} style={{ color: "var(--ink)", textDecoration: "none", gap: 10 }}>
                <span style={{ fontSize: "1.3rem", fontWeight: 700 }}>{p.title}</span>
                <span className="muted">{p.text}</span>
                {!isAuthenticated && (
                  <span className="row small muted" style={{ gap: 8, fontWeight: 600 }}>
                    <Icon name="lock" size={18} />
                    {c.lockedHint}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="promise-h" style={{ background: "var(--ink)", color: "#fff", borderRadius: 20, padding: 36, display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 id="promise-h" style={{ margin: 0, fontSize: "1.55rem" }}>{c.promiseTitle}</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 20 }}>
          {c.promises.map((p) => (
            <li key={p} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Icon name="check" size={24} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
