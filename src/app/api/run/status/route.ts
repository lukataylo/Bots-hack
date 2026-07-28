import { NextResponse } from "next/server";
import { getRunState } from "@/lib/db";

export const dynamic = "force-dynamic";

// Polled by the dashboard while an analyse run is in flight.
export async function GET() {
  return NextResponse.json(getRunState());
}
