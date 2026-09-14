import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";

const HEADING_STYLE = {
  fontFamily: '"Yaz Winky Show"',
} as const;

const PORTFOLIO_PAGES = [
  { href: "/bio", label: "Bio" },
  { href: "/clients", label: "Clients" },
  { href: "/stills", label: "Stills" },
] as const;

export function PortfolioPageShell({
  title,
  children,
  maxWidthClassName = "max-w-5xl",
}: {
  title: string;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <main className="min-h-screen bg-[#15130f] p-4 font-sans text-black sm:p-6">
      <section
        className={`relative mx-auto min-h-[calc(100vh-2rem)] bg-white sm:min-h-[calc(100vh-3rem)] ${maxWidthClassName}`}
      >
        <Link
          href="/"
          aria-label="Return to the gallery"
          className="absolute right-[6px] top-2 z-10 grid size-8 place-items-center text-black hover:bg-neutral-200 focus-visible:bg-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-black active:bg-neutral-300 sm:right-2 sm:size-9"
        >
          <X className="size-5 sm:size-6" strokeWidth={1.5} aria-hidden="true" />
        </Link>
        <header className="px-6 pb-3 pt-8 pr-14 sm:px-9 sm:pb-4 sm:pt-10 sm:pr-16">
          <h1 className="text-5xl leading-none sm:text-6xl" style={HEADING_STYLE}>
            {title}
          </h1>
        </header>
        <div className="px-6 pb-10 sm:px-9 sm:pb-12">{children}</div>
        <nav
          aria-label="Portfolio pages"
          className="mx-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-black/15 py-5 text-sm sm:mx-9"
        >
          <Link href="/" className="underline decoration-black/25 underline-offset-4 hover:opacity-65">
            Gallery
          </Link>
          {PORTFOLIO_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              aria-current={title === page.label ? "page" : undefined}
              className="underline decoration-black/25 underline-offset-4 hover:opacity-65 aria-[current=page]:font-semibold aria-[current=page]:no-underline"
            >
              {page.label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
