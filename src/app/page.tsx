import type { Metadata } from "next";
import Link from "next/link";
import { GalleryScene } from "@/components/GalleryScene";
import { getPortfolioContent } from "@/sanity/lib/portfolio";
import {
  getBioSummary,
  SITE_NAME,
  SITE_URL,
} from "@/sanity/lib/portfolioText";

export async function generateMetadata(): Promise<Metadata> {
  const portfolio = await getPortfolioContent();
  const description = getBioSummary(portfolio.bio.body);

  return {
    title: SITE_NAME,
    description,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      url: "/",
      title: SITE_NAME,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description,
    },
  };
}

export default async function Home() {
  const portfolio = await getPortfolioContent();
  const description = getBioSummary(portfolio.bio.body);
  const sameAs = [
    portfolio.bio.instagramUrl,
    portfolio.bio.linkedinUrl,
    portfolio.bio.imdbUrl,
  ].filter(Boolean);
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: SITE_NAME,
    url: SITE_URL,
    image: portfolio.bio.image?.url,
    description,
    jobTitle: "Director, producer, and writer",
    sameAs,
    email: portfolio.bio.email || undefined,
  };

  return (
    <main className="h-screen min-h-screen w-full overflow-hidden bg-[#15130f] text-[#f6f0e5] supports-[height:100dvh]:h-dvh supports-[height:100dvh]:min-h-dvh">
      <div className="sr-only">
        <h1>{SITE_NAME}</h1>
        <p>{description}</p>
        <nav aria-label="Portfolio pages">
          <Link href="/bio">Bio</Link>
          <Link href="/clients">Clients</Link>
          <Link href="/stills">Stills</Link>
        </nav>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(personSchema).replace(/</g, "\\u003c"),
        }}
      />
      <GalleryScene portfolio={portfolio} />
    </main>
  );
}
