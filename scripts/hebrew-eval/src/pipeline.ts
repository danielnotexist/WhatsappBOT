import { parseArgs, HELP } from './cli.js';
import { runEval } from './eval.js';
import { runJudge } from './judge.js';
import { runReport } from './report.js';

/** eval → judge → report in one go. `--dry-run` runs everything with the mock provider + mock judge. */
async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(HELP);
    return;
  }
  const runId = await runEval(args);
  await runJudge(args, runId);
  await runReport(args, runId);
}

main().catch((e) => {
  console.error(`שגיאה: ${(e as Error).message}`);
  process.exit(1);
});
