import { GalleryScene } from "@/components/GalleryScene";
import { getPortfolioContent } from "@/sanity/lib/portfolio";

export default async function Home() {
  const portfolio = await getPortfolioContent();

  return (
    <main className="h-screen min-h-screen w-full overflow-hidden bg-[#15130f] text-[#f6f0e5] supports-[height:100dvh]:h-dvh supports-[height:100dvh]:min-h-dvh">
      <GalleryScene portfolio={portfolio} />
    </main>
  );
}
