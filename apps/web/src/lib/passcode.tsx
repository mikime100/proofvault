// Demo passcode gate (contract decision 14): asked once, kept in localStorage,
// sent as x-demo-passcode on every write. Reads stay open.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const KEY = 'pv_demo_passcode';

interface PasscodeApi {
  /** Passcode if already entered this browser, else null. */
  get: () => string | null;
  /** Stored passcode, or opens the dialog once and resolves with what the seller typed. */
  require: () => Promise<string>;
}

const Ctx = createContext<PasscodeApi | null>(null);

export function usePasscode(): PasscodeApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePasscode must be used inside PasscodeProvider');
  return ctx;
}

export function PasscodeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const resolver = useRef<((v: string) => void) | null>(null);

  const require = useCallback(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) return Promise.resolve(saved);
    return new Promise<string>((resolve) => {
      resolver.current = resolve;
      setOpen(true);
    });
  }, []);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    localStorage.setItem(KEY, v);
    setOpen(false);
    setValue('');
    resolver.current?.(v);
    resolver.current = null;
  };

  const cancel = () => {
    setOpen(false);
    setValue('');
    resolver.current?.('');
    resolver.current = null;
  };

  return (
    <Ctx.Provider value={{ get: () => localStorage.getItem(KEY), require }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Demo passcode</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Needed once for actions like submit, offer and rules changes.
            </p>
            <input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Passcode"
              className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={cancel}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
