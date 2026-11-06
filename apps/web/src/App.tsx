import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { DisputesPage } from './pages/DisputesPage';
import { DisputeDetailPage } from './pages/DisputeDetailPage';
import { RulesPage } from './pages/RulesPage';
import { PasscodeProvider } from './lib/passcode';

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
              <nav className="ml-auto flex gap-4 text-sm">
                <Link to="/" className="text-neutral-600 hover:text-neutral-900">
                  Disputes
                </Link>
                <Link to="/rules" className="text-neutral-600 hover:text-neutral-900">
                  Rules
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-6">
            <Routes>
              <Route path="/" element={<DisputesPage />} />
              <Route path="/disputes/:id" element={<DisputeDetailPage />} />
              <Route path="/rules" element={<RulesPage />} />
            </Routes>
          </main>
        </div>
      </PasscodeProvider>
    </BrowserRouter>
  );
}
