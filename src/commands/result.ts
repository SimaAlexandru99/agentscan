/** What every command returns; `cli.ts` writes it out and exits with `exitCode`. */
export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr?: string;
};
