import { notFound } from "next/navigation";
import { PatternPlayer } from "@/components/pattern-player";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const stage = Number(query.stage ?? 1);
  if (!Number.isInteger(stage) || stage < 1 || stage > 30) notFound();
  const mode = query.mode === "practice" ? "practice" : "stage";
  return <PatternPlayer key={`${stage}-${mode}`} stage={stage} mode={mode} />;
}
