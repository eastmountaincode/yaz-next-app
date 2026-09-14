import type { Metadata } from "next";
import Link from "next/link";
import { GalleryScene } from "@/components/GalleryScene";
import { getPortfolioContent } from "@/sanity/lib/portfolio";
import {
  getBioSummary,
  PORTRAIT_IMAGE,
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
      images: [PORTRAIT_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description,
      images: [PORTRAIT_IMAGE],
    },
  };
}

export default async function Home() {
  const portfolio = await getPortfolioContent();
  const description = getBioSummary(portfolio.bio.body);
  const portraitUrl = new URL(PORTRAIT_IMAGE.url, SITE_URL).toString();
  const websiteId = `${SITE_URL}/#website`;
  const webpageId = `${SITE_URL}/#webpage`;
  const personId = `${SITE_URL}/#person`;
  const primaryImageId = `${portraitUrl}#primaryimage`;
  const sameAs = [
    portfolio.bio.instagramUrl,
    portfolio.bio.linkedinUrl,
    portfolio.bio.imdbUrl,
  ].filter(Boolean);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: "en-US",
        hasPart: [
          { "@id": `${SITE_URL}/bio#webpage` },
          { "@id": `${SITE_URL}/clients#webpage` },
          { "@id": `${SITE_URL}/stills#webpage` },
        ],
      },
      {
        "@type": "ImageObject",
        "@id": primaryImageId,
        url: portraitUrl,
        contentUrl: portraitUrl,
        width: PORTRAIT_IMAGE.width,
        height: PORTRAIT_IMAGE.height,
        caption: PORTRAIT_IMAGE.alt,
      },
      {
        "@type": "WebPage",
        "@id": webpageId,
        url: SITE_URL,
        name: SITE_NAME,
        description,
        isPartOf: { "@id": websiteId },
        primaryImageOfPage: { "@id": primaryImageId },
        mainEntity: { "@id": personId },
      },
      {
        "@type": "Person",
        "@id": personId,
        mainEntityOfPage: { "@id": webpageId },
        name: SITE_NAME,
        url: SITE_URL,
        image: { "@id": primaryImageId },
        description,
        jobTitle: "Director, producer, and writer",
        sameAs,
        email: portfolio.bio.email || undefined,
      },
    ],
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
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <GalleryScene portfolio={portfolio} />
    </main>
  );
}
