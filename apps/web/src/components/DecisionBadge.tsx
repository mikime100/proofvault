import type { DecisionAction } from '@proofvault/shared';
import { Badge } from './ui/badge';

const LABEL: Record<DecisionAction, string> = {
  submit: 'Fight with evidence',
  offer: 'Make offer',
  accept: 'Refund',
  await_approval: 'Needs your call',
};

/** What the agent decided for this case (decision 3). Plain text: it is a label, not a status. */
export function DecisionBadge({ action }: { action: DecisionAction | null }) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {action ? LABEL[action] : 'Not analysed'}
    </Badge>
  );
}
