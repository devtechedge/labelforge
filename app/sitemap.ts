import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/login",
    "/signup",
    "/terms",
    "/privacy",
  ].map((path) => ({
    url: `https://labelforge-app.vercel.app${path}`,
    lastModified: new Date("2026-10-27"),
  }));
}
