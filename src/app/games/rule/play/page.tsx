import { notFound } from "next/navigation";
import { RulePlayer } from "@/components/rule-player";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; mode?: string }>;
}) {
  const params = await searchParams,
    stage = Number(params.stage ?? 1);
  if (!Number.isInteger(stage) || stage < 1 || stage > 30) {
    notFound();
  }
  return (
    <RulePlayer
      key={`${stage}-${params.mode}`}
      stage={stage}
      mode={params.mode === "practice" ? "practice" : "stage"}
    />
  );
}
