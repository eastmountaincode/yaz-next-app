import type { Metadata } from "next";
import Image from "next/image";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import { PortfolioPageShell } from "@/components/PortfolioPageShell";
import { getPortfolioContent } from "@/sanity/lib/portfolio";
import { getBioSummary } from "@/sanity/lib/portfolioText";

const portableTextComponents = {
  block: {
    normal: ({ children }) => <p>{children}</p>,
  },
  marks: {
    link: ({ children, value }) => {
      const href = typeof value?.href === "string" ? value.href : "";
      return href ? (
        <a
          href={href}
          className="underline decoration-black/30 underline-offset-4 hover:decoration-black"
        >
          {children}
        </a>
      ) : (
        <>{children}</>
      );
    },
  },
} satisfies PortableTextComponents;

export async function generateMetadata(): Promise<Metadata> {
  const portfolio = await getPortfolioContent();
  const description = getBioSummary(portfolio.bio.body);

  return {
    title: "Bio",
    description,
    alternates: { canonical: "/bio" },
    openGraph: {
      url: "/bio",
      title: "Yaslynn Rivera — Bio",
      description,
    },
  };
}

export default async function BioPage() {
  const { bio } = await getPortfolioContent();

  return (
    <PortfolioPageShell title={bio.heading || "Bio"}>
      <article className="grid gap-10 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-14">
        {bio.image ? (
          <Image
            src={bio.image.url}
            alt={bio.image.alt || "Portrait of Yaslynn Rivera"}
            width={bio.image.width || 1200}
            height={bio.image.height || 1500}
            className="h-auto w-full object-cover"
            priority
          />
        ) : null}
        <div className="space-y-5 text-base leading-8 text-black/75">
          <PortableText value={bio.body} components={portableTextComponents} />
        </div>
      </article>
    </PortfolioPageShell>
  );
}
