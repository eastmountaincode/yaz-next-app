import type { PortableTextBlock } from "@portabletext/react";

export type SanityImageContent = {
  key: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
};

export type PortfolioProject = {
  key: string;
  slug: string;
  title: string;
  role: string;
  videoUrl: string;
};

export type PortfolioClient = {
  key: string;
  name: string;
  coverImage: SanityImageContent | null;
  projects: PortfolioProject[];
};

export type StillArtist = {
  key: string;
  name: string;
  coverImage: SanityImageContent | null;
  images: SanityImageContent[];
};

export type PortfolioContent = {
  directorReelUrl: string;
  bio: {
    heading: string;
    body: PortableTextBlock[];
    image: SanityImageContent | null;
    instagramUrl: string;
    linkedinUrl: string;
    email: string;
  };
  clients: PortfolioClient[];
  stillArtists: StillArtist[];
};

export const EMPTY_PORTFOLIO_CONTENT: PortfolioContent = {
  directorReelUrl: "",
  bio: {
    heading: "",
    body: [],
    image: null,
    instagramUrl: "",
    linkedinUrl: "",
    email: "",
  },
  clients: [],
  stillArtists: [],
};
