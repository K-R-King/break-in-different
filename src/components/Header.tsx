import { Link, NavLink, useNavigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import logo from "../assets/logo.png";
import { usePrefs } from "../a11y/prefs";
import { VoiceButton } from "../voice/live/VoiceButton";
import { Icon } from "./Icon";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/profile", label: "Profile" },
  { to: "/jobs", label: "Jobs Listing" },
  { to: "/tracker", label: "Application Tracker" },
];

export function Header() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const { openSettings } = usePrefs();
  const navigate = useNavigate();

  return (
    <header className="site-header">
      <div className="container bar">
        <Link to="/" className="logo-link">
          <img src={logo} alt="Break In Different home" width={124} height={52} />
        </Link>
        {isAuthenticated && (
          <nav aria-label="Main" style={{ flex: "1 1 auto" }}>
            <ul className="nav">
              {LINKS.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} end={l.end}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="header-actions">
          {isAuthenticated && <VoiceButton />}
          <button className="btn btn-secondary" type="button" onClick={openSettings}>
            <Icon name="access" />
            Accessibility settings
          </button>
          {!isLoading &&
            (isAuthenticated ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  void signOut().then(() => navigate("/"));
                }}
              >
                Log out
              </button>
            ) : (
              <>
                <Link className="btn btn-ghost" to="/account?tab=login">
                  Log in
                </Link>
                <Link className="btn btn-primary" to="/account?tab=signup">
                  Sign up
                </Link>
              </>
            ))}
        </div>
      </div>
    </header>
  );
}
