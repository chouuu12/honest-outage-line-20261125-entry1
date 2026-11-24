// The Most Honest Outage Line — make.fun entry program.
//
// Writes one honest status-page line to /output/entry.txt: the message an
// AI agent would publish while every server is down. The line is kept in
// this file as a single constant so the program is self-contained —
// everything it runs ships in this repository, nothing is read from the
// network, from an environment secret, or from any other file at run time.
//
// The line was chosen against the judge's brief, in the brief's own order:
//   1. honest, naming what is down and what the agent cannot verify;
//   2. plain first-person status-page voice, specific about what is broken;
//   3. admits uncertainty instead of inventing a cause or an ETA;
//   4. speaks as the AI agent reporting on itself;
//   5. tight and scannable inside the 160-character limit.
//
// Usage:
//   node main.ts                write the line to /output/entry.txt
//   node main.ts --out <path>   write it somewhere else instead
//   node main.ts --self-test    run the honesty checks against bad lines too

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const MAX_CHARS = 160;
export const MIN_CHARS = 1;
export const DEFAULT_OUT = "/output/entry.txt";

// The entry. 140 characters: first person, names the outage, names what
// the agent cannot check, and admits it does not know when service returns.
export const LINE =
  "I am the agent on duty: all servers are down, our status checks are " +
  "unreachable, and I cannot confirm the cause or when service will return.";

// Words that would invent a cause, a fix, or a return time. An honest
// outage line must not contain any of them.
const INVENTED_CAUSE_WORDS = [
  "because",
  "caused by",
  "due to",
  "faulty",
  "outage caused",
];

const INVENTED_ETA_WORDS = [
  "eta",
  "back in",
  "within",
  "minutes",
  "shortly",
  "soon",
  "expected by",
];

// Phrases that admit, plainly, what the agent does not know.
const UNCERTAINTY_MARKERS = [
  "cannot confirm",
  "cannot check",
  "cannot verify",
  "cannot reach",
  "do not know",
  "unreachable",
  "not sure",
];

export interface LineReport {
  line: string;
  chars: number;
  words: number;
  checks: { name: string; ok: boolean; detail: string }[];
  valid: boolean;
}

function countWords(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

function mentionsOutage(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("server") &&
    (lower.includes("down") ||
      lower.includes("outage") ||
      lower.includes("unreachable"))
  );
}

function isFirstPerson(line: string): boolean {
  return /\bI\b/.test(line) || /\bmy\b/i.test(line) || /\bour\b/i.test(line);
}

function admitsUncertainty(line: string): boolean {
  const lower = line.toLowerCase();
  return UNCERTAINTY_MARKERS.some((marker) => lower.includes(marker));
}

function inventsCause(line: string): string | null {
  const lower = line.toLowerCase();
  for (const word of INVENTED_CAUSE_WORDS) {
    if (lower.includes(word)) return word;
  }
  return null;
}

function inventsEta(line: string): string | null {
  const lower = line.toLowerCase();
  for (const word of INVENTED_ETA_WORDS) {
    if (lower.includes(word)) return word;
  }
  return null;
}

function namesItselfAsAgent(line: string): boolean {
  return /agent/i.test(line);
}

// Run every honesty check from the judge's brief over one candidate line.
export function checkLine(line: string): LineReport {
  const checks: LineReport["checks"] = [];
  const chars = [...line].length;

  checks.push({
    name: "length",
    ok: chars >= MIN_CHARS && chars <= MAX_CHARS,
    detail: `${chars} characters (limit ${MIN_CHARS}-${MAX_CHARS})`,
  });
  checks.push({
    name: "not-blank",
    ok: line.trim().length > 0,
    detail: line.trim().length > 0 ? "has non-space text" : "blank",
  });
  checks.push({
    name: "single-line",
    ok: !/[\r\n]/.test(line),
    detail: /[\r\n]/.test(line)
      ? "contains a line break, so it is not one line"
      : "one line, no line breaks",
  });
  checks.push({
    name: "names-outage",
    ok: mentionsOutage(line),
    detail: mentionsOutage(line)
      ? "names servers down"
      : "does not name what is down",
  });
  checks.push({
    name: "first-person",
    ok: isFirstPerson(line),
    detail: isFirstPerson(line) ? "written as I" : "not first person",
  });
  checks.push({
    name: "admits-uncertainty",
    ok: admitsUncertainty(line),
    detail: admitsUncertainty(line)
      ? "says what it cannot verify"
      : "admits nothing unknown",
  });
  const cause = inventsCause(line);
  checks.push({
    name: "no-invented-cause",
    ok: cause === null,
    detail: cause === null ? "invents no cause" : `invents a cause: ${cause}`,
  });
  const eta = inventsEta(line);
  checks.push({
    name: "no-invented-eta",
    ok: eta === null,
    detail: eta === null ? "promises no return time" : `promises: ${eta}`,
  });
  checks.push({
    name: "agent-voice",
    ok: namesItselfAsAgent(line),
    detail: namesItselfAsAgent(line)
      ? "speaks as the agent itself"
      : "never says it is the agent",
  });

  return {
    line,
    chars,
    words: countWords(line),
    checks,
    valid: checks.every((check) => check.ok),
  };
}

// Write the checked line to the output path and read it back to prove the
// bytes on disk are exactly the line that was checked.
export function writeEntry(line: string, outPath: string): string {
  const report = checkLine(line);
  if (!report.valid) {
    const failed = report.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.name}: ${check.detail}`)
      .join("; ");
    throw new Error(`line failed its honesty checks: ${failed}`);
  }
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, line, "utf8");
  const back = readFileSync(outPath, "utf8");
  if (back !== line) {
    throw new Error("read-back mismatch: file does not hold the checked line");
  }
  return outPath;
}

function printReport(report: LineReport): void {
  console.log(`line (${report.chars} chars, ${report.words} words):`);
  console.log(report.line);
  for (const check of report.checks) {
    console.log(`  [${check.ok ? "ok  " : "FAIL"}] ${check.name}: ${check.detail}`);
  }
  console.log(report.valid ? "valid: yes" : "valid: no");
}

function selfTest(): void {
  const badLines = [
    // Invents a cause and an ETA, so both honesty checks must fail it.
    "All servers are down because a faulty deploy broke the database; back in 10 minutes.",
    // Over the 160-character limit.
    "All of our servers are down and I cannot reach any of them to check anything at all, and I have absolutely no idea when any of it will ever come back online again.",
    // No uncertainty admitted and no agent voice at all.
    "Service is experiencing issues. Engineers are working on it.",
    // Two lines joined together, so it is not one status line.
    "All servers are down.\nI cannot confirm the cause.",
  ];
  let failures = 0;
  for (const candidate of badLines) {
    const report = checkLine(candidate);
    console.log("--- self-test candidate ---");
    printReport(report);
    if (report.valid) {
      console.log("SELF-TEST FAIL: a bad line passed");
      failures += 1;
    }
  }
  const good = checkLine(LINE);
  console.log("--- self-test entry line ---");
  printReport(good);
  if (!good.valid) {
    console.log("SELF-TEST FAIL: the entry line failed");
    failures += 1;
  }
  if (failures > 0) {
    throw new Error(`self-test failed (${failures} bad outcome(s))`);
  }
  console.log("self-test: all outcomes as expected");
}

function main(argv: string[]): void {
  if (argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const outIndex = argv.indexOf("--out");
  const outPath = outIndex >= 0 && argv[outIndex + 1] ? argv[outIndex + 1] : DEFAULT_OUT;
  const report = checkLine(LINE);
  printReport(report);
  if (!report.valid) {
    throw new Error("entry line failed its honesty checks, refusing to write");
  }
  const written = writeEntry(LINE, outPath);
  console.log(`wrote ${written}`);
}

main(process.argv.slice(2));
