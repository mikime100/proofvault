import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { DisputesPage } from './pages/DisputesPage';
import { DisputeDetailPage } from './pages/DisputeDetailPage';
import { RulesPage } from './pages/RulesPage';
import { PasscodeProvider } from './lib/passcode';

// Bryntum is heavy — keep it out of the main bundle.
const TriagePage = lazy(() => import('./pages/TriagePage').then((m) => ({ default: m.TriagePage })));

export function App() {
  return (
    <BrowserRouter>
      <PasscodeProvider>
        <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
          <header className="border-b bg-white">
            <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
              <ShieldCheck className="size-5 text-blue-600" />
              <Link to="/" className="text-lg font-semibold">
                ProofVault
              </Link>
              <span className="text-sm text-neutral-500">Seller dashboard</span>
              <nav className="ml-auto flex items-center gap-1 rounded-lg bg-neutral-100 p-1 text-sm">
                {[
                  { to: '/', label: 'Disputes', end: true },
                  { to: '/rules', label: 'Rules', end: false },
                  { to: '/triage', label: 'Triage', end: false },
                ].map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-1.5 transition-colors ${
                        isActive
                          ? 'bg-white font-medium text-neutral-900 shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`
                    }
                  >
                    {n.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-6">
            <Routes>
              <Route path="/" element={<DisputesPage />} />
              <Route path="/disputes/:id" element={<DisputeDetailPage />} />
              <Route path="/rules" element={<RulesPage />} />
              <Route
                path="/triage"
                element={
                  <Suspense fallback={<p className="text-sm text-neutral-500">Loading triage board…</p>}>
                    <TriagePage />
                  </Suspense>
                }
              />
            </Routes>
          </main>
        </div>
      </PasscodeProvider>
    </BrowserRouter>
  );
}
