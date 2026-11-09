import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell, Page } from './components/AppShell';
import { Skeleton } from './components/ui/skeleton';
import { DisputesPage } from './pages/DisputesPage';
import { DisputeDetailPage } from './pages/DisputeDetailPage';
import { RulesPage } from './pages/RulesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { PasscodeProvider } from './lib/passcode';

// Bryntum + AG Studio are heavy: keep them out of the main bundle.
const TriagePage = lazy(() => import('./pages/TriagePage').then((m) => ({ default: m.TriagePage })));
const StudioPage = lazy(() => import('./pages/StudioPage').then((m) => ({ default: m.StudioPage })));

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
  return (
    <BrowserRouter>
      <PasscodeProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DisputesPage />} />
            <Route path="/disputes/:id" element={<DisputeDetailPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route
              path="/studio"
              element={
                <Lazy label="Loading Studio">
                  <StudioPage />
                </Lazy>
              }
            />
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
