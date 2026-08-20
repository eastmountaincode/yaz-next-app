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
    <PortfolioPageShell title="Clients">
      <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <section key={client.key}>
            {client.coverImage ? (
              <Image
                src={client.coverImage.url}
                alt={client.coverImage.alt || `${client.name} cover image`}
                width={client.coverImage.width || 900}
                height={client.coverImage.height || 900}
                className="aspect-square w-full object-cover"
              />
            ) : null}
            <h2 className="mt-4 text-2xl font-medium">{client.name}</h2>
            <ul className="mt-3 space-y-3">
              {client.projects.map((project) => (
                <li key={project.key}>
                  <a
                    href={project.videoUrl}
                    className="underline decoration-black/25 underline-offset-4 hover:decoration-black"
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
