import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { AnnouncerProvider } from "./a11y/Announcer";
import { PrefsProvider } from "./a11y/prefs";
import { SettingsDialog } from "./a11y/SettingsDialog";
import { ReaderProvider } from "./voice/reader";
import { VoiceProvider } from "./voice/VoiceProvider";
import { LiveVoiceProvider } from "./voice/live/LiveVoice";
import { VoiceIntent } from "./voice/intent/VoiceIntent";
import { Header } from "./components/Header";
import { COPY } from "./copy";
import { HomePage } from "./routes/HomePage";
import { AccountPage } from "./routes/AccountPage";

const ProfilePage = lazy(() => import("./routes/ProfilePage"));
const JobsPage = lazy(() => import("./routes/JobsPage"));
const EmailPage = lazy(() => import("./routes/EmailPage"));
const TrackerPage = lazy(() => import("./routes/TrackerPage"));
const PracticePage = lazy(() => import("./routes/PracticePage"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to={`/account?tab=login&next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function Loading() {
  return (
    <div className="container" style={{ paddingBlock: 48 }} role="status">
      Loading…
    </div>
  );
}

export function App() {
  return (
    <AnnouncerProvider>
      <PrefsProvider>
        <ReaderProvider>
          <VoiceProvider>
          <LiveVoiceProvider>
            <a className="skip" href="#main">
              Skip to main content
            </a>
            <Header />
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                <Route path="/jobs" element={<RequireAuth><JobsPage /></RequireAuth>} />
                <Route path="/jobs/:id/email" element={<RequireAuth><EmailPage /></RequireAuth>} />
                <Route path="/jobs/:id/practice" element={<RequireAuth><PracticePage /></RequireAuth>} />
                <Route path="/tracker" element={<RequireAuth><TrackerPage /></RequireAuth>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <footer className="footer">
              <div className="container">
                <span>{COPY.brand} · Cal Hacks 13.0</span>
                <span>{COPY.home.footer}</span>
              </div>
            </footer>
            <SettingsDialog />
            <VoiceIntent />
          </LiveVoiceProvider>
          </VoiceProvider>
        </ReaderProvider>
      </PrefsProvider>
    </AnnouncerProvider>
  );
}
