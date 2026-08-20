import Link from "next/link";
import type { ReactNode } from "react";

export function PortfolioPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white px-6 py-8 font-sans text-black sm:px-10 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-sm text-black/60 underline decoration-black/20 underline-offset-4 hover:text-black"
        >
          Yaslynn Rivera
        </Link>
        <h1 className="mt-8 text-4xl font-medium tracking-tight sm:text-6xl">{title}</h1>
        <div className="mt-10">{children}</div>
      </div>
    </main>
  );
}
