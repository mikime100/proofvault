// Demo passcode gate (contract decision 14): asked once, kept in localStorage,
// sent as x-demo-passcode on every write. Reads stay open.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const KEY = 'pv_demo_passcode';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

interface PasscodeApi {
  /** True when a passcode is saved in this browser (re-renders when it changes). */
  has: boolean;
  /** Passcode if already entered this browser, else null. */
  get: () => string | null;
  /** Stored passcode, or opens the dialog once and resolves with what the seller typed ('' if cancelled). */
  require: () => Promise<string>;
  /** Drop the saved passcode, e.g. after the api says it is wrong. */
  forget: () => void;
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
  // Mirrors localStorage so consumers re-render when the passcode is saved or forgotten.
  const [has, setHas] = useState(() => !!read());
  const resolver = useRef<((v: string) => void) | null>(null);

  const require = useCallback(() => {
    const saved = read();
    if (saved) return Promise.resolve(saved);
    return new Promise<string>((resolve) => {
      resolver.current = resolve;
      setOpen(true);
    });
  }, []);

  const forget = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage blocked: nothing saved anyway */
    }
    setHas(false);
  }, []);

  const finish = (v: string) => {
    setOpen(false);
    setValue('');
    resolver.current?.(v);
    resolver.current = null;
    setHas(!!read());
  };

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* still usable for this one action */
    }
    finish(v);
  };

  const api = useMemo(() => ({ has, get: read, require, forget }), [has, require, forget]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && finish('')}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Demo passcode</DialogTitle>
              <DialogDescription>
                Needed once in this browser for anything that changes a case: submit, escalate, offer,
                sandbox steps and rules.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="passcode">Passcode</Label>
              <Input
                id="passcode"
                type="password"
                autoComplete="off"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finish('')}>
                Cancel
              </Button>
              <Button type="submit" disabled={!value.trim()}>
                Continue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
