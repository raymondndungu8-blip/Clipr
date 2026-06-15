import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { AddAccountSchema, RemoveAccountSchema } from "@/lib/validations/account";

// GET — list the signed-in user's connected social accounts.
export async function GET(req: NextRequest) {
  const guard = await guardRoute(req, "accountsManage");
  if (guard.error) return guard.error;
  const { user, supabase } = guard;

  const { data, error } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/accounts] list failed:", error);
    return NextResponse.json({ error: "Could not load accounts" }, { status: 500 });
  }
  return NextResponse.json({ accounts: data ?? [] });
}

// POST — connect (add) a page for a platform.
export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "accountsManage");
  if (guard.error) return guard.error;
  const { user, supabase } = guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AddAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { platform, displayName, profileUrl } = parsed.data;

  const { data, error } = await supabase
    .from("social_accounts")
    .insert({
      user_id: user.id,
      platform,
      display_name: displayName,
      profile_url: profileUrl ? profileUrl : null,
      status: "connected",
    })
    .select("*")
    .single();

  if (error) {
    // Unique violation → already connected.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That page is already connected." },
        { status: 409 }
      );
    }
    console.error("[api/accounts] insert failed:", error);
    return NextResponse.json({ error: "Could not connect account" }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

// DELETE — disconnect (remove) a connected page by id.
export async function DELETE(req: NextRequest) {
  const guard = await guardRoute(req, "accountsManage");
  if (guard.error) return guard.error;
  const { user, supabase } = guard;

  const body = await req.json().catch(() => null);
  const parsed = RemoveAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/accounts] delete failed:", error);
    return NextResponse.json({ error: "Could not disconnect account" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
