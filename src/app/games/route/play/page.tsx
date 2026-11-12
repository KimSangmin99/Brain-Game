import { notFound } from "next/navigation";
import { RoutePlayer } from "@/components/route-player";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; mode?: string }>;
}) {
  const p = await searchParams,
    stage = Number(p.stage ?? 1);
  if (!Number.isInteger(stage) || stage < 1 || stage > 30) notFound();
  const mode = p.mode === "practice" ? "practice" : "stage";
  return <RoutePlayer key={`${stage}-${mode}`} stage={stage} mode={mode} />;
}
