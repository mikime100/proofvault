import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { DisputesPage } from './pages/DisputesPage';
import { DisputeDetailPage } from './pages/DisputeDetailPage';

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-4">
            <ShieldCheck className="size-5 text-blue-600" />
            <Link to="/" className="text-lg font-semibold">
              ProofVault
            </Link>
            <span className="text-sm text-neutral-500">Seller dashboard</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-6">
          <Routes>
            <Route path="/" element={<DisputesPage />} />
            <Route path="/disputes/:id" element={<DisputeDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
