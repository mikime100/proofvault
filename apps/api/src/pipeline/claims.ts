// The guardrail against invented evidence (contract decisions 5 and 11).
// A claim survives only if its citations, dates and counts all match the records it cites.
import type { Claim, CheckResult, Draft, Timeline, TimelineEntry } from '@proofvault/shared';

/**
 * Any way of writing a date other than YYYY-MM-DD: month names ("November 2", "2nd of Nov"),
 * slash or dot dates ("02/11/2026"), weekdays. Case-sensitive, so "may" the verb is fine.
 */
const NON_ISO_DATE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b(?:\.?\s+\d{1,2}(?:st|nd|rd|th)?\b)?|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b|\b\d{1,4}[/.]\d{1,2}[/.]\d{1,4}\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;
const RELATIVE_DAY = /\b(?:yesterday|today|tomorrow)\b/i;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
/** "4 lessons", "four lessons", "3 of 4 lessons" (counts the 3), "over 2 days". */
const COUNT =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+of\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))?\s+(lessons?|days?|downloads?|logins?|sessions?|activations?)\b/gi;
const NOUN_TO_TYPE: Record<string, string> = {
  lesson: 'lesson_view',
  download: 'download',
  login: 'login',
  session: 'login',
  activation: 'activation',
};

const dayOf = (e: TimelineEntry) => e.at.slice(0, 10);

function rejectReason(claim: Claim, byId: Map<string, TimelineEntry>): string | null {
  if (claim.recordIds.length === 0) return 'Cites no records';

  const cited: TimelineEntry[] = [];
  for (const id of claim.recordIds) {
    const entry = byId.get(id);
    if (!entry) return `Cites ${id}, which is not a record of this dispute`;
    cited.push(entry);
  }

  const bad = claim.text.match(NON_ISO_DATE) ?? claim.text.match(RELATIVE_DAY);
  if (bad) return `Writes a date as "${bad[0]}"; dates must be YYYY-MM-DD`;

  const citedDays = new Set(cited.map(dayOf));
  for (const date of claim.text.match(ISO_DATE) ?? []) {
    if (!citedDays.has(date)) return `Says ${date}, but no cited record is from that day`;
  }

  for (const [, rawNumber, noun] of claim.text.matchAll(COUNT)) {
    const said = NUMBER_WORDS[rawNumber!.toLowerCase()] ?? Number(rawNumber);
    const base = noun!.toLowerCase().replace(/s$/, '');
    const actual =
      base === 'day' ? citedDays.size : cited.filter((e) => e.type === NOUN_TO_TYPE[base]).length;
    if (said !== actual) return `Says ${said} ${noun}, but the cited records show ${actual}`;
  }
  return null;
}

/** Splits the LLM's claims into the ones backed by records and the ones that are not, with a reason each. */
export function checkClaims(draft: Draft, timeline: Timeline): CheckResult {
  const byId = new Map(timeline.entries.map((e) => [e.recordId, e]));
  const result: CheckResult = { accepted: [], rejected: [] };
  for (const claim of draft.claims) {
    const reason = rejectReason(claim, byId);
    if (reason) result.rejected.push({ claim, reason });
    else result.accepted.push(claim);
  }
  return result;
}
