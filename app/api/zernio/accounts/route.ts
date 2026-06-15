import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { listAccounts } from "@/lib/zernio";

// GET — list social accounts connected in Zernio (shared workspace).
export async function GET(req: NextRequest) {
  const guard = await guardRoute(req, "accountsManage");
  if (guard.error) return guard.error;

  try {
    const accounts = await listAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("[api/zernio/accounts] failed:", err);
    return NextResponse.json(
      { error: "Could not load connected accounts." },
      { status: 502 }
    );
  }
}
