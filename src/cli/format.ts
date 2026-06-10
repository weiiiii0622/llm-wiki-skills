export function printResult(value: unknown, json: boolean, quiet: boolean, human: string): void {
  if (quiet) return;
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else {
    process.stdout.write(human);
  }
}
