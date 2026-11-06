// Bryntum Scheduler triage board (#25): disputes as rows, each dispute's
// response window as an event. Computed entirely in the browser from the
// dispute list endpoint — there is no /triage endpoint.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../lib/bryntum-license';
import { BryntumScheduler } from '@bryntum/scheduler-react-enterprise';
import { ProjectModel } from '@bryntum/scheduler-enterprise';
import '@bryntum/core-enterprise/fontawesome/css/fontawesome.css';
import '@bryntum/core-enterprise/fontawesome/css/solid.css';
import '@bryntum/core-enterprise/core.thin.css';
import '@bryntum/grid-enterprise/grid.thin.css';
import '@bryntum/scheduler-enterprise/scheduler.thin.css';
import '@bryntum/scheduler-enterprise/stockholm-light.css';
import type { DisputeListItem } from '@proofvault/shared';
import { api } from '../api';
import { reasonLabel } from '../lib/format';
import { cn } from '../lib/utils';

const MS_48H = 48 * 3600 * 1000;

function isUrgent(d: DisputeListItem) {
  // Red when the deadline is near and nothing has been decided/done yet.
  if (!d.responseDueAt) return false;
  const due = new Date(d.responseDueAt).getTime();
  return Date.now() + MS_48H > due && !d.decision && d.status === 'WAITING_FOR_SELLER_RESPONSE';
}

export function TriagePage() {
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });

  const project = useMemo(() => {
    const items = disputes.data?.items;
    if (!items) return undefined;
    return new ProjectModel({
      // Bryntum accepts plain data objects; v8 types only admit model instances.
      resourcesData: items.map((d) => ({
        id: d.id,
        name: `${d.paypalDisputeId} · ${reasonLabel(d.reason)}`,
      })) as never,
      eventsData: items
        .filter(
          (d): d is DisputeListItem & { createdAt: string; responseDueAt: string } =>
            !!(d.createdAt && d.responseDueAt),
        )
        .map((d) => ({
          id: d.id,
          resourceId: d.id,
          name: `${d.amount.value} ${d.amount.currency}`,
          startDate: d.createdAt,
          endDate: d.responseDueAt,
          cls: cn(
            'pv-event',
            isUrgent(d) && 'pv-event-urgent',
            d.decision === 'accept' && 'pv-event-accept',
            d.status === 'RESOLVED' && 'pv-event-done',
          ),
        })) as never,
    });
  }, [disputes.data]);

  const urgentCount = disputes.data?.items.filter(isUrgent).length ?? 0;

  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold">Triage board</h1>
        {urgentCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {urgentCount} due within 48h, no action
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Each bar is a dispute's window from opened to PayPal's response deadline. Red bars need
        attention now.
      </p>
      <div className="mt-4 overflow-hidden rounded-lg border bg-white">
        {disputes.isPending && <p className="p-4 text-sm text-neutral-500">Loading…</p>}
        {disputes.isError && <p className="p-4 text-sm text-red-600">Could not load disputes.</p>}
        {project && (
          <BryntumScheduler height={480} project={project} viewPreset="dayAndWeek" />
        )}
      </div>
      <style>{`
        .pv-event-urgent .b-event-body { background: #dc2626 !important; }
        .pv-event-accept .b-event-body { background: #d97706 !important; }
        .pv-event-done .b-event-body { background: #9ca3af !important; opacity: .6; }
      `}</style>
    </section>
  );
}
