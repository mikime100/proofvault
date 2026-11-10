import { useCallback, useEffect, useState } from 'react';
import { ProofVault } from '@proofvault/sdk';
import { CoursePlayer } from './components/CoursePlayer';
import { ProductPage } from './components/ProductPage';
import { COURSE, STORE_NAME, type Lesson } from './lib/course';
import { API_URL } from './lib/paypal';

const TOKEN_KEY = 'pv_access_token';
const LOGIN_KEY = 'pv_login_fired';

function tokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('t');
}

function Header({ owned }: { owned: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-white">
            L
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{STORE_NAME}</span>
        </a>
        <p className="text-sm text-muted-foreground">{owned ? 'Your course' : `${COURSE.lessons.length}-lesson mini course`}</p>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
        <p>© 2026 {STORE_NAME}</p>
        <p>Payments by PayPal. Demo store running on the PayPal sandbox; no real money moves.</p>
      </div>
    </footer>
  );
}

export function App() {
  // A saved access token always wins: a buyer who has paid never sees checkout again.
  const [accessToken, setAccessToken] = useState<string | null>(
    () => tokenFromUrl() ?? localStorage.getItem(TOKEN_KEY),
  );

  // A ?t=<token> link is the buyer's private access link: keep it and remember it.
  useEffect(() => {
    const t = tokenFromUrl();
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      setAccessToken(t);
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    ProofVault.init({ apiUrl: API_URL, accessToken });
    // login fires once per browser session, not once per page view.
    if (!sessionStorage.getItem(LOGIN_KEY)) {
      sessionStorage.setItem(LOGIN_KEY, '1');
      void ProofVault.track('login');
    }
  }, [accessToken]);

  const onPaid = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    window.history.replaceState(null, '', `/learn?t=${token}`);
    window.scrollTo({ top: 0 });
    setAccessToken(token);
  }, []);

  const onLessonOpen = useCallback((l: Lesson) => {
    void ProofVault.track('lesson_view', { lesson: String(l.n) });
  }, []);

  const onDownload = useCallback(() => {
    void ProofVault.track('download', { file: COURSE.bonus.file });
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header owned={!!accessToken} />
      <main className="flex-1">
        {accessToken ? (
          <CoursePlayer accessToken={accessToken} onLessonOpen={onLessonOpen} onDownload={onDownload} />
        ) : (
          <ProductPage onPaid={onPaid} />
        )}
      </main>
      <Footer />
    </div>
  );
}
