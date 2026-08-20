import type { Metadata } from "next";
import Image from "next/image";
import { PortfolioPageShell } from "@/components/PortfolioPageShell";
import { getPortfolioContent } from "@/sanity/lib/portfolio";

export const metadata: Metadata = {
  title: "Clients",
  description: "Selected client work by director, producer, and writer Yaslynn Rivera.",
  alternates: { canonical: "/clients" },
  openGraph: {
    url: "/clients",
    title: "Yaslynn Rivera — Clients",
    description: "Selected client work by director, producer, and writer Yaslynn Rivera.",
  },
};

export default async function ClientsPage() {
  const { clients } = await getPortfolioContent();

  return (
    <PortfolioPageShell title="Clients" maxWidthClassName="max-w-6xl">
      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10">
        {clients.map((client) => (
          <section key={client.key}>
            <div className="aspect-square w-full overflow-hidden bg-neutral-200">
              {client.coverImage ? (
                <Image
                  src={client.coverImage.url}
                  alt={client.coverImage.alt || `${client.name} cover image`}
                  width={client.coverImage.width || 900}
                  height={client.coverImage.height || 900}
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <h2 className="mt-2 text-sm leading-tight sm:text-base">{client.name}</h2>
            <ul className="mt-3 space-y-3">
              {client.projects.map((project) => (
                <li key={project.key} className="text-sm leading-snug">
                  <a
                    href={project.videoUrl}
                    className="underline decoration-black/25 underline-offset-4 hover:opacity-80"
                  >
                    {project.title}
                  </a>
                  {project.role ? (
                    <div className="mt-1 text-sm text-black/55">{project.role}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PortfolioPageShell>
  );
}
