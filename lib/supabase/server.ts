import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cookie-bound server client — respects the signed-in user's session and RLS.
 * Use in route handlers, server components, and server actions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookie writes are not allowed
            // there. Safe to ignore when middleware/proxy refreshes sessions.
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS. SERVER ONLY. Never expose to the browser.
 */
export function createServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createServiceClient() must never be called in the browser — it uses the service-role key."
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
