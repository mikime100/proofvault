// App shell (trusty-app-shell skill): dark field + sidebar as one surface, a white panel inset
// from the edges, and the topbar inside the panel. Only the panel scrolls. On phones the
// sidebar becomes a slide-out sheet.
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BarChart3,
  CalendarClock,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { api, ApiError } from '../api';
import { usePasscode } from '../lib/passcode';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Extra paths that count as this page (a dispute's own page belongs to Disputes). */
  match?: RegExp;
}

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Cases',
    items: [
      { to: '/', label: 'Disputes', icon: Inbox, match: /^\/(disputes\/.*)?$/ },
      { to: '/triage', label: 'Triage board', icon: CalendarClock },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/studio', label: 'Studio', icon: Sparkles },
    ],
  },
  {
    heading: 'Setup',
    items: [{ to: '/rules', label: 'Agent rules', icon: SlidersHorizontal }],
  },
];

function Brand() {
  return (
    <div className="flex h-16 items-center gap-3 px-5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
        <ShieldCheck className="size-5 text-white" aria-hidden />
      </div>
      <span className="text-xl font-semibold tracking-tight text-white">ProofVault</span>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const isActive = (item: NavItem) => (item.match ? item.match.test(pathname) : pathname.startsWith(item.to));
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
      {NAV.map((group) => (
        <div key={group.heading} className="mt-6 first:mt-2">
          <p className="mb-1.5 px-3 text-xs font-semibold text-sidebar-label">
            {group.heading}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={isActive(item) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors',
                    isActive(item)
                      ? 'bg-sidebar-active font-medium text-sidebar-active-fg'
                      : 'text-sidebar-item hover:bg-white/5 hover:text-white',
                  )}
                >
                  <item.icon className="size-[18px]" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="m-3 rounded-lg border border-white/10 px-3 py-3">
      <p className="text-sm font-medium text-white">PayPal sandbox</p>
      <p className="mt-1 text-xs leading-relaxed text-sidebar-item">
        Demo environment. No real money moves.
      </p>
    </div>
  );
}

function CaseSearch() {
  const passcode = usePasscode();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [caseId, setCaseId] = useState('');

  const fetchCase = useMutation({
    mutationFn: async (id: string) => {
      const pc = await passcode.require();
      if (!pc) throw new Error('cancelled');
      return api.fetchDispute(id, pc);
    },
    onSuccess: (detail) => {
      setCaseId('');
      toast.success(`Loaded ${detail.dispute.paypalDisputeId} from PayPal`);
      qc.invalidateQueries({ queryKey: ['disputes'] });
      navigate(`/disputes/${detail.dispute.id}`);
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'cancelled') return;
      const msg = e instanceof ApiError ? e.message : 'Check the case ID and try again.';
      toast.error('Could not load that case', { description: msg });
    },
  });

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const id = caseId.trim().toUpperCase();
        if (id) fetchCase.mutate(id);
      }}
    >
      <label htmlFor="case-search" className="sr-only">
        Load a PayPal case by ID
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="case-search"
        value={caseId}
        onChange={(e) => setCaseId(e.target.value)}
        placeholder="Load a case: PP-R-…"
        disabled={fetchCase.isPending}
        className="h-10 rounded-lg border-transparent bg-canvas pl-9 font-mono text-sm shadow-none focus-visible:bg-white"
      />
      {fetchCase.isPending && (
        <RefreshCw className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </form>
  );
}

function PasscodeChip() {
  const passcode = usePasscode();
  const set = passcode.has;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Demo seller account">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            DS
          </span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-[13px] font-semibold">Demo seller</span>
            <span className="block text-[11px] text-muted-foreground">
              {set ? 'Actions unlocked' : 'Read only'}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {set ? 'Passcode saved in this browser' : 'No passcode yet'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {set ? (
          <DropdownMenuItem
            onSelect={() => passcode.forget()}
          >
            Forget passcode
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => void passcode.require()}
          >
            Enter passcode
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-shell">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 flex-col lg:flex">
        <Brand />
        <SidebarNav />
        <SidebarFooter />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 gap-0 border-none bg-shell p-0 text-white">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Main navigation</SheetDescription>
          </SheetHeader>
          <Brand />
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
          <SidebarFooter />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col p-2 lg:py-3 lg:pr-3 lg:pl-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu />
            </Button>
            <div className="flex flex-1 lg:justify-start">
              <CaseSearch />
            </div>
            <PasscodeChip />
          </header>
          <main id="main" className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/** Page header inside the panel: title, one-line purpose, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8', className)}>{children}</div>;
}
