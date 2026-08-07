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
  videoUrl: string;
};

export type PortfolioClient = {
  key: string;
  name: string;
  projects: PortfolioProject[];
};

export type StillProject = {
  key: string;
  title: string;
  images: SanityImageContent[];
};

export type PortfolioContent = {
  directorReelUrl: string;
  bio: {
    heading: string;
    body: PortableTextBlock[];
    image: SanityImageContent | null;
  };
  clients: PortfolioClient[];
  stillProjects: StillProject[];
};

export const EMPTY_PORTFOLIO_CONTENT: PortfolioContent = {
  directorReelUrl: "",
  bio: {
    heading: "",
    body: [],
    image: null,
  },
  clients: [],
  stillProjects: [],
};
