import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { Page, PageHeader } from '../components/AppShell';
import { StatStrip } from '../components/StatStrip';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../components/ui/chart';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { summarize } from '../lib/analytics';
import { cn } from '../lib/utils';

const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)}%`);
const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Outcome colours from index.css: a single brand-blue family, told apart by lightness.
const chartConfig = {
  won: { label: 'Won', color: 'var(--chart-won)' },
  lost: { label: 'Lost or refunded', color: 'var(--chart-lost)' },
  open: { label: 'Still open', color: 'var(--chart-open)' },
} satisfies ChartConfig;

export function AnalyticsPage() {
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });

  if (disputes.isPending)
    return (
      <Page>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-24 rounded-xl" />
        <Skeleton className="mt-6 h-80 rounded-xl" />
      </Page>
    );
  if (disputes.isError)
    return (
      <Page>
        <PageHeader title="Analytics" />
        <p className="mt-6 text-sm text-danger">Could not load disputes. Check the API is running.</p>
      </Page>
    );

  const s = summarize(disputes.data.items);
  const rows = s.byReason.map((r) => ({
    reason: r.label,
    won: r.won,
    lost: r.resolved - r.won,
    open: r.total - r.resolved,
  }));

  return (
    <Page>
      <PageHeader
        title="Analytics"
        description="How your disputes end, by PayPal reason."
      />

      <StatStrip
        stats={[
          { label: 'Win rate', value: pct(s.winRate), note: `${s.won} of ${s.resolved} closed` },
          { label: 'Disputes', value: String(s.total), note: `${s.open} open` },
          { label: 'Amount disputed', value: usd(s.amountAtRisk) },
          { label: 'Kept from wins', value: usd(s.recovered) },
        ]}
      />

      <section className="mt-6 rounded-xl border p-5">
        <h2 className="text-base font-semibold">Outcome by reason</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Number of cases</p>
        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No disputes yet, so nothing to chart.</p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mt-4 aspect-auto w-full"
            style={{ height: Math.max(160, rows.length * 56 + 70) }}
            role="img"
            aria-label={`Cases by reason: ${rows
              .map((r) => `${r.reason}, ${r.won} closed without refund, ${r.lost} refunded, ${r.open} open`)
              .join('; ')}`}
          >
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={14}>
              <CartesianGrid horizontal={false} stroke="var(--divider)" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                type="category"
                dataKey="reason"
                width={130}
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              {/* Recharts sorts tooltip and legend items by name; keep them in bar order instead. */}
              <ChartTooltip cursor={{ fill: 'var(--canvas)' }} content={<ChartTooltipContent />} itemSorter={() => 0} />
              <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
              <Bar dataKey="won" stackId="a" fill="var(--color-won)" stroke="var(--background)" strokeWidth={2} />
              <Bar dataKey="lost" stackId="a" fill="var(--color-lost)" stroke="var(--background)" strokeWidth={2} />
              <Bar
                dataKey="open"
                stackId="a"
                fill="var(--color-open)"
                stroke="var(--background)"
                strokeWidth={2}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </section>

      <div className="mt-6 overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-canvas">
            <TableRow className="hover:bg-transparent">
              {['Reason', 'Total', 'Closed', 'Won', 'Win rate', 'Kept'].map((h, i) => (
                <TableHead
                  key={h}
                  className={cn(
                    'h-11 text-xs font-medium text-muted-foreground',
                    i > 0 && 'text-right',
                  )}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.byReason.map((r) => (
              <TableRow key={r.reason} className="border-divider">
                <TableCell className="py-3 font-medium">{r.label}</TableCell>
                <TableCell className="tabular text-right">{r.total}</TableCell>
                <TableCell className="tabular text-right">{r.resolved}</TableCell>
                <TableCell className="tabular text-right">{r.won}</TableCell>
                <TableCell className="tabular text-right">{pct(r.winRate)}</TableCell>
                <TableCell className="tabular text-right font-medium">{usd(r.recovered)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Page>
  );
}
