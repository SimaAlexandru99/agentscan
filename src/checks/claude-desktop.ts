import type { Facts } from "../facts/types";
import type { Finding } from "../findings";
import { make } from "./make";

/** One finding per installed extension manifest with defects. See docs/spec/claude-desktop-extensions.md. */
export function checkClaudeDesktopExtensions(facts: Facts): Finding[] {
  return (facts.claudeDesktopExtensions ?? []).map((ext) => {
    const problems = [
      ...(ext.missingFields.length > 0 ? [`is missing ${ext.missingFields.join(", ")}`] : []),
      ...(ext.unknownServerType === undefined ? [] : [`has unknown server.type "${ext.unknownServerType}"`]),
    ];
    return make("claude-desktop.extension.missing-field", `extension:${ext.path}`, {
      message: `Claude Desktop extension manifest ${problems.join(" and ")}`,
      reason:
        "MCPB manifests require manifest_version, name, version, description, author (with name) and server; server.type is node, python, binary or uv. See docs/spec/claude-desktop-extensions.md.",
      evidence: [{ kind: "config", value: ext.path }],
      suggest: "Reinstall the extension, or fix its manifest.json",
    });
  });
}
