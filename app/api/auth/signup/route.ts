import { NextRequest, NextResponse } from "next/server";
import { getLimiters } from "@/lib/ratelimit";
import { createServiceClient } from "@/lib/supabase/server";
import { SignupSchema } from "@/lib/validations/auth";

// Public route (no session yet) — IP rate limited only. Creates the account
// pre-confirmed via the admin API so the user can sign in immediately and land
// straight on the dashboard, regardless of the project's email-confirm setting.
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipResult = await getLimiters().globalIp.limit(ip);
  if (!ipResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { email, password, displayName } = parsed.data;

  try {
    const admin = createServiceClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: displayName ? { display_name: displayName } : undefined,
    });

    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists")
      ) {
        return NextResponse.json(
          { error: "An account with that email already exists. Try signing in." },
          { status: 409 }
        );
      }
      console.error("[api/auth/signup] createUser failed:", error);
      return NextResponse.json(
        { error: "Couldn't create your account." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/signup] error:", err);
    return NextResponse.json(
      { error: "Couldn't create your account." },
      { status: 500 }
    );
  }
}
