import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultConfig } from "../config/schema";

export type InitOptions = {
  force?: boolean;
};

export type InitResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * Write `.agentscanrc.json` with defaultConfig.
 * Refuses to overwrite an existing file unless `force` is true.
 */
export async function runInit(
  dir?: string,
  options: InitOptions = {},
): Promise<InitResult> {
  const root = resolve(dir ?? process.cwd());
  const path = join(root, ".agentscanrc.json");

  if (existsSync(path) && !options.force) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `Refusing to overwrite existing ${path} (use --force)\n`,
    };
  }

  const body = `${JSON.stringify(defaultConfig, null, 2)}\n`;
  writeFileSync(path, body, "utf8");

  return {
    exitCode: 0,
    stdout: `Wrote ${path}\n`,
    stderr: "",
  };
}
