import type { Metadata } from "next";
import Image from "next/image";
import { PortfolioPageShell } from "@/components/PortfolioPageShell";
import { getPortfolioContent } from "@/sanity/lib/portfolio";

export const metadata: Metadata = {
  title: "Stills",
  description: "Selected production stills from the work of Yaslynn Rivera.",
  alternates: { canonical: "/stills" },
  openGraph: {
    url: "/stills",
    title: "Yaslynn Rivera — Stills",
    description: "Selected production stills from the work of Yaslynn Rivera.",
  },
};

export default async function StillsPage() {
  const { stillArtists } = await getPortfolioContent();

  return (
    <PortfolioPageShell title="Stills" maxWidthClassName="max-w-7xl">
      <div className="space-y-12">
        {stillArtists.map((artist) => (
          <section key={artist.key}>
            <h2 className="text-3xl leading-tight sm:text-4xl">{artist.name}</h2>
            {artist.role ? <p className="mt-1 text-sm text-black/55">{artist.role}</p> : null}
            <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {artist.images.map((image) => (
                <Image
                  key={image.key}
                  src={image.url}
                  alt={image.alt || `Still from ${artist.name}`}
                  width={image.width || 1200}
                  height={image.height || 800}
                  className="h-auto w-full object-cover"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PortfolioPageShell>
  );
}
