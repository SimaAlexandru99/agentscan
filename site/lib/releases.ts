import releases from "@/data/releases.json";

export type SiteRelease = (typeof releases)[number];

export { releases };

export const NPM_NOTE =
  "Only 2.0.0 and 2.3.1 were published to npm; the versions between are tags on GitHub.";
