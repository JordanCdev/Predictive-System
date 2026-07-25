import { useEffect, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ProfileProvider, useProfile } from "./ui/profile/ProfileContext.tsx";
import { AuthProvider } from "./ui/profile/AuthContext.tsx";
import { EntitlementsProvider } from "./ui/profile/EntitlementsContext.tsx";
import { ErrorBoundary } from "./ui/ErrorBoundary.tsx";
import { TODAY_ISO, isValidIso } from "./ui/shared.ts";
import { parseAbsoluteDateQuery } from "./ui/dateQuery.ts";
import { elementPlain } from "./engine/index.ts";
import { DailyPage } from "./pages/DailyPage.tsx";
import { WeeklyPage } from "./pages/WeeklyPage.tsx";
import { MonthlyPage } from "./pages/MonthlyPage.tsx";
import { YearlyPage } from "./pages/YearlyPage.tsx";
import { DateFinderPage } from "./pages/DateFinder.tsx";
import { ChatPage } from "./pages/ChatPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { GroupPage } from "./pages/GroupPage.tsx";
import { LandingPage } from "./pages/LandingPage.tsx";
import { PricingPage } from "./pages/PricingPage.tsx";
import { BillingPage } from "./pages/BillingPage.tsx";
import { PrivacyPage, TermsPage } from "./pages/LegalPages.tsx";
import { PlanBadge } from "./ui/billing/UpgradePrompt.tsx";

/** Week/Month/Year nav targets follow the date currently on screen — on
 *  /day/2026-12-25 the Month tab means December 2026, not whatever month the app
 *  happened to load in. Falls back to today when the route carries no date. */
function navItems(pathname: string) {
  let ctx = TODAY_ISO;
  const day = pathname.match(/^\/(?:day|week)\/(\d{4}-\d{2}-\d{2})/);
  const month = pathname.match(/^\/month\/(\d{4}-\d{2})/);
  const year = pathname.match(/^\/year\/(\d{4})/);
  if (day && isValidIso(day[1])) ctx = day[1];
  // A month/year route pins Week to the period's first day — unless it's the
  // current period, where "this week" is the honest reading of the tab.
  else if (month && isValidIso(`${month[1]}-01`)) ctx = TODAY_ISO.startsWith(month[1]) ? TODAY_ISO : `${month[1]}-01`;
  else if (year) ctx = TODAY_ISO.startsWith(year[1]) ? TODAY_ISO : `${year[1]}-01-01`;
  return [
    { to: "/today", label: "Today" },
    { to: `/week/${ctx}`, label: "Week", match: "/week" },
    { to: `/month/${ctx.slice(0, 7)}`, label: "Month", match: "/month" },
    { to: `/year/${ctx.slice(0, 4)}`, label: "Year", match: "/year" },
    { to: "/date-finder", label: "Find a date" },
    { to: "/group", label: "For a group" },
    { to: "/chat", label: "Advisor" },
  ];
}

/** Every route change starts at the top. Without this, clicking a nav item from
 *  a scrolled page lands mid-content with the heading off-screen, which reads as
 *  a broken page rather than a new one. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

/** "/" shows the pitch to a first-time visitor and the reading to everyone else —
 *  a returning user shouldn't have to walk past marketing to reach their day. */
function Home() {
  const { personalized } = useProfile();
  return personalized ? <Navigate to="/today" replace /> : <LandingPage />;
}

/** Persistent top command bar: type any decision to jump straight to its reading. */
function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const submit = () => {
    const query = q.trim();
    if (!query) return;
    // An unambiguous absolute date ("2027-10-14", "14 Oct 2027") is a request to
    // read that day, not to match a decision — go straight to the day view.
    const dayIso = parseAbsoluteDateQuery(query);
    if (dayIso) nav(`/day/${dayIso}`);
    else nav(`/date-finder?q=${encodeURIComponent(query)}`);
    setQ("");
  };
  return (
    <div className="nav-search">
      <span aria-hidden="true" className="nav-search-ic">⌕</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Find a date for… e.g. “sign a contract”"
        aria-label="Find a date for a decision"
      />
    </div>
  );
}

function NavBar() {
  const { chart, person } = useProfile();
  const { pathname } = useLocation();
  const items = navItems(pathname);
  return (
    <header className="nav">
      <NavLink to="/today" className="nav-brand">
        <span className="seal" aria-hidden="true">易</span>
        <span className="nav-word">Wéi</span>
      </NavLink>
      <nav className="nav-links">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `nav-link${isActive || (n.match && location.hash.startsWith(`#${n.match}`)) ? " active" : ""}`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <GlobalSearch />
      <NavLink to="/settings/profile" className="nav-profile" title="Your profile">
        {chart ? (
          <>
            <span className="dot" style={{ background: "var(--jade)" }} />
            {elementPlain(chart.dayMaster.dayMaster.phase)} · {person?.birthDate.slice(0, 4)}
            <PlanBadge />
          </>
        ) : (
          <>+ Add profile</>
        )}
      </NavLink>
    </header>
  );
}

export function App() {
  return (
    <AuthProvider>
    <EntitlementsProvider>
    <ProfileProvider>
      <HashRouter>
        <div className="app">
          <ScrollToTop />
          <NavBar />
          <main className="page">
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/welcome" element={<LandingPage />} />
              <Route path="/today" element={<DailyPage />} />
              <Route path="/day/:date" element={<DailyPage />} />
              <Route path="/week/:date" element={<WeeklyPage />} />
              <Route path="/month/:ym" element={<MonthlyPage />} />
              <Route path="/year/:year" element={<YearlyPage />} />
              <Route path="/date-finder" element={<DateFinderPage />} />
              <Route path="/group" element={<GroupPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/settings/profile" element={<ProfilePage />} />
              <Route path="/settings/billing" element={<BillingPage />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
            </ErrorBoundary>
          </main>
          <Footer />
        </div>
      </HashRouter>
    </ProfileProvider>
    </EntitlementsProvider>
    </AuthProvider>
  );
}

function Footer() {
  return (
    <div className="foot">
      A transparent decision-support tool grounded in classical Chinese metaphysics (BaZi &amp; Tong Shu day selection) plus
      astronomical solar-term calculation. Confidence reflects how well-sourced and reproducible a reading is — not the odds
      any outcome occurs. Different masters legitimately disagree; we show the conflicts. One input among many — use your own
      judgement too.
      <nav className="foot-links">
        <NavLink to="/welcome">About</NavLink>
        <NavLink to="/pricing">Plans</NavLink>
        <NavLink to="/settings/billing">Billing</NavLink>
        <NavLink to="/privacy">Privacy</NavLink>
        <NavLink to="/terms">Terms</NavLink>
      </nav>
    </div>
  );
}
