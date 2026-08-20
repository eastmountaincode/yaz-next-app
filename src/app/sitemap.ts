import type { MetadataRoute } from "next";
import { SITE_URL } from "@/sanity/lib/portfolioText";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/bio`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/clients`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/stills`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
