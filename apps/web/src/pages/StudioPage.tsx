import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AgStudio } from 'ag-studio-react';
import {
  AgStudioLicenseManager,
  createAiHarness,
  type AgStudioApi,
} from 'ag-studio';
import { AgStudioAiModule, AgStudioModuleRegistry } from 'ag-studio';
import { api } from '../api';
import { summarize } from '../lib/analytics';
import { reasonLabel } from '../lib/format';
import { proofvaultLlm } from '../lib/studioLlm';

// The AI Assistant panel's component lives in this module; without it Studio drops the panel.
AgStudioModuleRegistry.registerModules([AgStudioAiModule]);

// Licence key from VITE_AG_STUDIO_LICENSE_KEY (apps/web/.env), never committed.
if (import.meta.env.VITE_AG_STUDIO_LICENSE_KEY) {
  AgStudioLicenseManager.setLicenseKey(import.meta.env.VITE_AG_STUDIO_LICENSE_KEY);
}

export function StudioPage() {
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });

  const data = useMemo(() => {
    const items = disputes.data?.items ?? [];
    const rows = items.map((d) => ({
      disputeId: d.paypalDisputeId,
      reason: reasonLabel(d.reason),
      reasonCode: d.reason,
      amount: Number(d.amount.value),
      currency: d.amount.currency,
      status: d.status,
      decision: d.decision ?? 'none',
      winScore: d.winScore ?? -1,
      createdAt: d.createdAt,
      dueAt: d.responseDueAt ?? '',
    }));
    const s = summarize(items);
    const reasonRows = s.byReason.map((r) => ({
      reason: r.label,
      total: r.total,
      resolved: r.resolved,
      won: r.won,
      winRate: r.winRate === null ? -1 : Math.round(r.winRate * 100),
      recovered: r.recovered,
      amountAtRisk: r.amountAtRisk,
    }));
    return {
      sources: [
        { id: 'disputes', data: rows },
        { id: 'reasonStats', data: reasonRows },
        {
          id: 'summary',
          data: [
            {
              total: s.total,
              open: s.open,
              resolved: s.resolved,
              won: s.won,
              winRate: s.winRate === null ? -1 : Math.round(s.winRate * 100),
              amountAtRisk: s.amountAtRisk,
              recovered: s.recovered,
            },
          ],
        },
      ],
    };
  }, [disputes.data]);

  if (disputes.isPending)
    return <p className="text-sm text-neutral-500">Loading dispute data…</p>;

  return (
    <section className="-mx-6 -my-6">
      <div className="h-[calc(100vh-8rem)]">
        <AgStudio
          data={data}
          mode="edit"
          ai={({ api: coreApi }) =>
            createAiHarness(coreApi as AgStudioApi, { adapter: proofvaultLlm, primary: 'lead' })
          }
        />
      </div>
    </section>
  );
}
