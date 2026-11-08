-- #44: the agent may act once per PayPal stage, so each action remembers its stage. Additive only.
ALTER TABLE "ActionLog" ADD COLUMN "stage" TEXT;
