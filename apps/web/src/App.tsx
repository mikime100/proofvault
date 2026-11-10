import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { AppShell, Page } from './components/AppShell';
import { Skeleton } from './components/ui/skeleton';
import { DisputesPage } from './pages/DisputesPage';
import { DisputeDetailPage } from './pages/DisputeDetailPage';
import { RulesPage } from './pages/RulesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { PasscodeProvider } from './lib/passcode';

// Bryntum + AG Studio are heavy (Studio alone is about 2 MB to download): keep them out of the
// main bundle, then fetch them in the background once the dashboard is up, so opening either page
// later does not wait on the download. The browser caches the module; import() runs once.
const loadTriage = () => import('./pages/TriagePage');
const loadStudio = () => import('./pages/StudioPage');
const TriagePage = lazy(() => loadTriage().then((m) => ({ default: m.TriagePage })));
const StudioPage = lazy(() => loadStudio().then((m) => ({ default: m.StudioPage })));

function usePrefetchHeavyPages() {
  useEffect(() => {
    const start = () => {
      void loadStudio().catch(() => undefined);
      void loadTriage().catch(() => undefined);
    };
    // Wait until the first screen has loaded and the browser is idle.
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(start, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 2000);
    return () => clearTimeout(id);
  }, []);
}

/** Starts the dispute list fetch at once, alongside the Studio download instead of after it. */
function StudioRoute() {
  useQuery({ queryKey: ['disputes'], queryFn: api.disputes });
  return (
    <Lazy label="Loading Studio">
      <StudioPage />
    </Lazy>
  );
}

function Lazy({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Page>
          <p className="sr-only">{label}</p>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-96 w-full rounded-xl" />
        </Page>
      }
    >
      {children}
    </Suspense>
  );
}

export function App() {
  usePrefetchHeavyPages();
  return (
    <BrowserRouter>
      <PasscodeProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DisputesPage />} />
            <Route path="/disputes/:id" element={<DisputeDetailPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/studio" element={<StudioRoute />} />
            <Route
              path="/triage"
              element={
                <Lazy label="Loading triage board">
                  <TriagePage />
                </Lazy>
              }
            />
          </Routes>
        </AppShell>
      </PasscodeProvider>
    </BrowserRouter>
  );
}
