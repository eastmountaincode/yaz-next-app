import "server-only";

import type { PortableTextBlock } from "@portabletext/react";
import { defineQuery } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import {
  EMPTY_PORTFOLIO_CONTENT,
  type PortfolioContent,
  type SanityImageContent,
} from "@/sanity/types";

const portfolioQuery = defineQuery(`
  {
    "directorReelUrl": *[_type == "directorReel" && _id == "director-reel"][0].videoUrl,
    "bioHeading": *[_type == "bio" && _id == "bio"][0].heading,
    "bioBody": *[_type == "bio" && _id == "bio"][0].body,
    "bioInstagramUrl": *[_type == "bio" && _id == "bio"][0].instagramUrl,
    "bioLinkedinUrl": *[_type == "bio" && _id == "bio"][0].linkedinUrl,
    "bioEmail": *[_type == "bio" && _id == "bio"][0].email,
    "bioImage": *[_type == "bio" && _id == "bio"][0].image {
      "key": coalesce(_key, asset._ref),
      "url": asset->url,
      "width": asset->metadata.dimensions.width,
      "height": asset->metadata.dimensions.height,
      alt
    },
    "clients": *[_type == "clients" && _id == "clients"][0].items[] {
      "key": _key,
      name,
      coverImage {
        "key": coalesce(_key, asset._ref),
        "url": asset->url,
        "width": asset->metadata.dimensions.width,
        "height": asset->metadata.dimensions.height,
        alt
      },
      projects[] {
        "key": _key,
        "slug": slug.current,
        title,
        role,
        videoUrl
      }
    },
    "stillArtists": *[_type == "stills" && _id == "stills"][0].artists[] {
      "key": _key,
      name,
      coverImage {
        "key": coalesce(_key, asset._ref),
        "url": asset->url,
        "width": asset->metadata.dimensions.width,
        "height": asset->metadata.dimensions.height,
        alt
      },
      images[] {
        "key": coalesce(_key, asset._ref),
        "url": asset->url,
        "width": asset->metadata.dimensions.width,
        "height": asset->metadata.dimensions.height,
        alt
      }
    }
  }
`);

type RawPortfolioContent = {
  directorReelUrl?: string;
  bioHeading?: string;
  bioBody?: Array<string | PortableTextBlock>;
  bioInstagramUrl?: string;
  bioLinkedinUrl?: string;
  bioEmail?: string;
  bioImage?: Partial<SanityImageContent> | null;
  clients?: Array<{
    key?: string;
    name?: string;
    coverImage?: Partial<SanityImageContent> | null;
    projects?: Array<{
      key?: string;
      slug?: string;
      title?: string;
      role?: string;
      videoUrl?: string;
    }>;
  }>;
  stillArtists?: Array<{
    key?: string;
    name?: string;
    coverImage?: Partial<SanityImageContent> | null;
    images?: Array<Partial<SanityImageContent>>;
  }>;
};

function normalizeImage(
  image: Partial<SanityImageContent> | null | undefined,
): SanityImageContent | null {
  if (!image?.url) {
    return null;
  }

  return {
    key: image.key || image.url,
    url: image.url,
    alt: image.alt || "",
    width: image.width,
    height: image.height,
  };
}

function normalizeBioBody(
  body: Array<string | PortableTextBlock> | undefined,
): PortableTextBlock[] {
  return (body ?? []).flatMap((item, index) => {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) {
        return [];
      }

      return [
        {
          _key: `legacy-bio-${index}`,
          _type: "block",
          style: "normal",
          markDefs: [],
          children: [
            {
              _key: `legacy-bio-span-${index}`,
              _type: "span",
              marks: [],
              text,
            },
          ],
        },
      ];
    }

    return item?._type === "block" && Array.isArray(item.children) ? [item] : [];
  });
}

function normalizePortfolio(content: RawPortfolioContent | null): PortfolioContent {
  if (!content) {
    return EMPTY_PORTFOLIO_CONTENT;
  }

  return {
    directorReelUrl: content.directorReelUrl || "",
    bio: {
      heading: content.bioHeading || "",
      body: normalizeBioBody(content.bioBody),
      image: normalizeImage(content.bioImage),
      instagramUrl: content.bioInstagramUrl || "",
      linkedinUrl: content.bioLinkedinUrl || "",
      email: content.bioEmail || "",
    },
    clients: (content.clients ?? [])
      .filter((client) => client.name)
      .map((client, clientIndex) => ({
        key: client.key || `client-${clientIndex}`,
        name: client.name || "",
        coverImage: normalizeImage(client.coverImage),
        projects: (client.projects ?? [])
          .filter((project) => project.title && project.videoUrl)
          .map((project, projectIndex) => ({
            key: project.key || `project-${projectIndex}`,
            slug: project.slug || project.key || `project-${projectIndex}`,
            title: project.title || "",
            role: project.role || "",
            videoUrl: project.videoUrl || "",
          })),
      })),
    stillArtists: (content.stillArtists ?? [])
      .filter((artist) => artist.name)
      .map((artist, artistIndex) => ({
        key: artist.key || `stills-artist-${artistIndex}`,
        name: artist.name || "",
        coverImage: normalizeImage(artist.coverImage),
        images: (artist.images ?? [])
          .map(normalizeImage)
          .filter((image): image is SanityImageContent => image !== null),
      })),
  };
}

export async function getPortfolioContent(): Promise<PortfolioContent> {
  if (!sanityClient) {
    return EMPTY_PORTFOLIO_CONTENT;
  }

  try {
    const content = await sanityClient.fetch<RawPortfolioContent | null>(
      portfolioQuery,
      {},
      {
        next: {
          revalidate: 60,
          tags: ["director-reel", "bio", "clients", "stills"],
        },
      },
    );
    return normalizePortfolio(content);
  } catch (error) {
    console.error("Could not load portfolio content from Sanity.", error);
    return EMPTY_PORTFOLIO_CONTENT;
  }
}
