// Bryntum Scheduler triage board (#25): disputes as rows, each dispute's
// response window as an event. Computed entirely in the browser from the
// dispute list endpoint: there is no /triage endpoint.
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
import { Page, PageHeader } from '../components/AppShell';
import { Badge } from '../components/ui/badge';
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
    <Page>
      <PageHeader
        title="Triage board"
        description="Each bar is a case's window, from opened to PayPal's response deadline."
        actions={
          urgentCount > 0 ? (
            <Badge variant="danger">
              {urgentCount} due within 48h with no action
            </Badge>
          ) : undefined
        }
      />
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-5 rounded-sm bg-[#dc2626]" aria-hidden /> Due soon, nothing done
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-5 rounded-sm bg-[#d97706]" aria-hidden /> Agent chose refund
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-5 rounded-sm bg-[#9ca3af]" aria-hidden /> Closed
        </li>
      </ul>
      <div className="mt-4 overflow-hidden rounded-xl border">
        {disputes.isPending && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {disputes.isError && <p className="p-4 text-sm text-danger">Could not load disputes.</p>}
        {project && <BryntumScheduler height={520} project={project} viewPreset="dayAndWeek" />}
      </div>
      <style>{`
        .pv-event-urgent .b-event-body { background: #dc2626 !important; }
        .pv-event-accept .b-event-body { background: #d97706 !important; }
        .pv-event-done .b-event-body { background: #9ca3af !important; opacity: .6; }
        .b-scheduler { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
      `}</style>
    </Page>
  );
}
