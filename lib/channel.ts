import { getVersion } from "./version.js";

/**
 * The npm dist-tag channel this CLI build ships on. Prerelease builds
 * (e.g. 2026.7.200-beta.5) publish to `beta` — the dev-stack testing channel;
 * stable builds publish to `latest` (prod). There is no configuration: a build
 * derives its channel from its own version string, so every self-reference the
 * CLI prints or scaffolds (update fixes, remediation commands, workspace docs)
 * stays on the channel the user installed from instead of quietly pointing a
 * beta workspace back at prod.
 */
export type Channel = "beta" | "latest";

export function channelOf(version: string): Channel {
  return version.includes("-beta") ? "beta" : "latest";
}

export function getChannel(): Channel {
  return channelOf(getVersion());
}

/** Tagged package ref for the npx commands the CLI prints or scaffolds. */
export function pkgRef(channel: Channel = getChannel()): string {
  return `@aicopycoders/exodus@${channel}`;
}

/**
 * Re-tag every `npx @aicopycoders/exodus[@tag]` invocation in `content` with
 * this build's channel. Beta-only on purpose: each npx call re-resolves its
 * tag independently, so an untagged (or `@latest`) command in a beta-scaffolded
 * workspace silently runs the prod CLI. On `latest` the content passes through
 * untouched — the assets are authored in the untagged/`@latest` form that
 * already resolves to prod, keeping stable output byte-identical.
 */
export function stampChannel(content: string, channel: Channel = getChannel()): string {
  if (channel !== "beta") return content;
  return content.replace(
    /npx @aicopycoders\/exodus(@[A-Za-z0-9.-]+)?/g,
    `npx ${pkgRef(channel)}`,
  );
}
