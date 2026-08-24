import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ConfigErrorFact, HookFact } from "../facts/types";
import { hooksFromObject } from "./hooks";
import {
  NESTED_DISCOVERY_MAX_DEPTH,
  NESTED_DISCOVERY_SKIP,
  readJsonConfig,
} from "./shared";

/**
 * Plugin roots inside the scanned tree.
 *
 * Quoted from the plugins reference: "The plugin root is the individual
 * plugin's own directory: the one you pass to `--plugin-dir` or that contains
 * `.claude-plugin/plugin.json`." So a manifest marks a plugin root, and the
 * scan root counts when it carries `hooks/hooks.json` itself — that is the
 * `claude --plugin-dir .` case, a plugin repo being scanned from inside.
 *
 * Installed marketplace plugins under `~/.claude/plugins` are deliberately not
 * found here: they live outside the project, and the docs say their install
 * directory changes on every update. See docs/spec/hook-sources.md.
 */
export function findPluginRoots(
  root: string,
  errors: ConfigErrorFact[],
): string[] {
  const found: string[] = [];
  if (existsSync(join(root, "hooks", "hooks.json"))) {
    found.push(root);
  }

  const walk = (dir: string, depth: number): void => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      errors.push({
        path: dir,
        kind: "unreadable",
        detail: "could not read directories while looking for plugins",
      });
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || NESTED_DISCOVERY_SKIP.has(entry.name)) {
        continue;
      }
      // `.claude/plugins/<name>` is a real in-tree location, so `.claude` is
      // walked; `.claude-plugin` is a manifest container, never a plugin root.
      if (entry.name.startsWith(".") && entry.name !== ".claude") {
        continue;
      }
      const child = join(dir, entry.name);
      if (existsSync(join(child, ".claude-plugin", "plugin.json"))) {
        // A plugin does not contain another plugin; stop descending.
        found.push(child);
        continue;
      }
      if (depth >= NESTED_DISCOVERY_MAX_DEPTH) {
        continue;
      }
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/**
 * Hooks declared by plugins that live in the scanned tree.
 *
 * `hooks/hooks.json` carries the same `hooks` object as a settings file, so it
 * goes through the same reader. What differs is the base: `${CLAUDE_PLUGIN_ROOT}`
 * resolves against the plugin root, and 31 of 33 commands measured across 17
 * real plugins use it — without that expansion this check would read two of
 * them. See docs/spec/hook-sources.md.
 */
export function discoverPluginHooks(
  root: string,
  errors: ConfigErrorFact[],
): HookFact[] {
  const facts: HookFact[] = [];
  for (const pluginRoot of findPluginRoots(root, errors)) {
    const filePath = join(pluginRoot, "hooks", "hooks.json");
    if (!existsSync(filePath)) {
      continue;
    }
    const raw = readJsonConfig(filePath, errors);
    if (raw === undefined) {
      continue;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: "hooks.json is not a JSON object",
      });
      continue;
    }
    // `description` is a documented sibling of `hooks` and 10 of 17 real files
    // carry one; it is ignored rather than treated as an unexpected shape.
    const hooks = (raw as Record<string, unknown>).hooks;
    if (hooks === undefined) {
      continue;
    }
    facts.push(
      ...hooksFromObject(hooks, filePath, "plugin", {
        project: root,
        plugin: pluginRoot,
        own: pluginRoot,
      }, errors),
    );
  }
  return facts;
}
