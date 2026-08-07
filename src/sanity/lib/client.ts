import { createClient } from "next-sanity";

const projectId =
  process.env.SANITY_API_PROJECT_ID ?? process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "";
const dataset =
  process.env.SANITY_API_DATASET ?? process.env.NEXT_PUBLIC_SANITY_DATASET ?? "";
const token = process.env.SANITY_API_READ_TOKEN || undefined;

export const sanityIsConfigured = Boolean(projectId && dataset);

export const sanityClient = sanityIsConfigured
  ? createClient({
      projectId,
      dataset,
      apiVersion: "2026-08-01",
      token,
      useCdn: !token,
    })
  : null;
