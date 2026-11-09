import { notFound } from "next/navigation";
import { games } from "@/lib/catalog";
import { GameDetail } from "@/components/lab";
export function generateStaticParams() {
  return games.map((g) => ({ id: g.id }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!games.some((g) => g.id === id)) notFound();
  return <GameDetail key={id} id={id} />;
}
