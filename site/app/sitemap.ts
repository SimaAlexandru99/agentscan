import type { MetadataRoute } from "next";

import { INDEXABLE_PATHS, SITE_LASTMOD, SITE_ORIGIN, absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({
    url: path === "/" ? `${SITE_ORIGIN}/` : absoluteUrl(path),
    lastModified: SITE_LASTMOD,
    changeFrequency: path === "/" || path === "/docs" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/docs" ? 0.8 : 0.5,
  }));
}
