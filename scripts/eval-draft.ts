/**
 * eval:draft — runs S1 to S4 against real DeepSeek and prints a pass/fail table.
 *
 * Usage (from repo root):
 *   LLM_API_KEY=sk-... pnpm eval:draft
 *   Or set LLM_API_KEY in apps/api/.env and run: pnpm eval:draft
 *
 * What it checks (mirrors INTEGRATION.md section 5):
 *   S1 strong    → score >= 75, decision submit,        recommendation fight
 *   S2 medium    → score 40-74, decision await_approval
 *   S3 weak $9   → score < 40,  decision accept,         flag no_access_events
 *   S4 no match  → decision await_approval,              flag no_matching_order
 *
 * S5 (guardrail trap) is a unit test, not an eval — it uses a fake LLM by design.
 */

import { SCENARIOS, DEFAULT_RULES } from '../packages/shared/dist/fixtures/index.js';
import { runPipeline } from '../apps/api/src/pipeline/runPipeline.js';
import { createLlmClient } from '../apps/api/src/pipeline/llm.js';

// Load .env from apps/api
import { readFileSync } from 'fs';
try {
  const env = readFileSync('apps/api/.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = /^([^#=\s]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) process.env[m[1]!] ??= m[2]!.replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env file — rely on env vars already set
}

interface Check {
  id: string;
  pass: boolean;
  detail: string;
}

async function main() {
  const llm = createLlmClient();

  const checks: Array<{ scenario: string; checks: Check[]; pass: boolean }> = [];

  for (const s of SCENARIOS.filter((x) => ['S1', 'S2', 'S3', 'S4'].includes(x.id))) {
    console.log(`\nRunning ${s.id}: ${s.title}...`);
    let result: Awaited<ReturnType<typeof runPipeline>>;
    try {
      result = await runPipeline(s.context, DEFAULT_RULES, { llm });
    } catch (e) {
      checks.push({
        scenario: s.id,
        checks: [{ id: 'run', pass: false, detail: String(e) }],
        pass: false,
      });
      continue;
    }

    const c: Check[] = [];

    if (s.expected.scoreMin !== undefined) {
      const ok = result.score.value >= s.expected.scoreMin;
      c.push({ id: 'scoreMin', pass: ok, detail: `score ${result.score.value} >= ${s.expected.scoreMin}` });
    }
    if (s.expected.scoreMax !== undefined) {
      const ok = result.score.value <= s.expected.scoreMax;
      c.push({ id: 'scoreMax', pass: ok, detail: `score ${result.score.value} <= ${s.expected.scoreMax}` });
    }
    if (s.expected.decision !== undefined) {
      const ok = result.decision.action === s.expected.decision;
      c.push({ id: 'decision', pass: ok, detail: `decision ${result.decision.action} (want ${s.expected.decision})` });
    }
    if (s.expected.recommendation !== undefined) {
      const ok = result.recommendation === s.expected.recommendation;
      c.push({ id: 'recommendation', pass: ok, detail: `recommendation ${result.recommendation} (want ${s.expected.recommendation})` });
    }
    if (s.expected.flags) {
      for (const f of s.expected.flags) {
        const ok = result.flags.includes(f);
        c.push({ id: `flag:${f}`, pass: ok, detail: `flag ${f} ${ok ? 'present' : 'MISSING'}` });
      }
    }

    // Zero invented claims: every accepted claim must cite only records in the timeline
    const ids = new Set(result.timeline.entries.map((e) => e.recordId));
    const invented = result.accepted.filter((cl) => cl.recordIds.some((r) => !ids.has(r)));
    c.push({ id: 'no_invented', pass: invented.length === 0, detail: `${invented.length} invented claims` });

    checks.push({ scenario: s.id, checks: c, pass: c.every((x) => x.pass) });
  }

  // Print table
  console.log('\n' + '='.repeat(70));
  console.log('eval:draft results\n');
  let allPass = true;
  for (const s of checks) {
    const icon = s.pass ? '✓' : '✗';
    console.log(`${icon} ${s.scenario}`);
    for (const c of s.checks) {
      const ci = c.pass ? '  ✓' : '  ✗';
      console.log(`${ci} ${c.id}: ${c.detail}`);
    }
    if (!s.pass) allPass = false;
  }
  console.log('\n' + '='.repeat(70));
  console.log(allPass ? '✓ All checks passed' : '✗ Some checks failed');
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
