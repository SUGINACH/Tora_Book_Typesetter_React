#!/usr/bin/env node
/**
 * main.ts — נקודת הכניסה של ה־CLI (שלב 34).
 *
 * דק במכוון: ניתוח טיעונים ← runCli ← מיפוי שגיאה לקוד יציאה + מפתח
 * i18n (לעולם לא message גולמי; §12.1). stdout נשאר לפלט הקנוני בלבד.
 */
import { parseCliArgs, USAGE } from './args.js';
import { CliError } from './errors.js';
import { EXIT_SUCCESS, EXIT_USAGE } from './exit-codes.js';
import { runCli } from './runner.js';

async function main(): Promise<number> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`שגיאת שימוש: ${parsed.error}\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }
  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_SUCCESS;
  }
  try {
    const outcome = await runCli(parsed.args, (line) => process.stderr.write(`${line}\n`));
    if (outcome.report !== undefined) {
      // שורת סיכום קנונית אחת ל-stdout (מכונה)
      process.stdout.write(`${JSON.stringify(outcome.report)}\n`);
    }
    return outcome.exitCode;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`שגיאה [${e.catalogKey}] ${JSON.stringify(e.params)}\n${e.message}\n`);
      return e.exitCode;
    }
    process.stderr.write(`שגיאה בלתי-צפויה: ${e instanceof Error ? e.message : String(e)}\n`);
    return EXIT_USAGE;
  }
}

main().then((code) => {
  process.exit(code);
}, (e) => {
  process.stderr.write(`כשל פנימי: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(2);
});
