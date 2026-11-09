import type { NextRequest } from "next/server";
import { handle } from "@/server/http";
import { productionDatabase } from "@/server/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: NextRequest) =>
  handle(request, productionDatabase);
export const POST = (request: NextRequest) =>
  handle(request, productionDatabase);
