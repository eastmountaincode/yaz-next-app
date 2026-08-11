import { CandleCompositeEditor } from "@/components/CandleCompositeEditor";

export default async function CandleEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const id = (await searchParams).id;
  const requestedId = typeof id === "string" ? id.trim() : "";
  return <CandleCompositeEditor requestedId={requestedId} />;
}
