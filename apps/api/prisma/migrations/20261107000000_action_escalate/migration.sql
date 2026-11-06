-- Decision 16: sellers can escalate an inquiry to PayPal review. Additive only.
ALTER TYPE "ActionType" ADD VALUE 'escalate';
