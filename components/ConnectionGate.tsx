"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { apiGet } from "@/components/lib/api";

/**
 * Blocks its children until the user has at least one connected social account
 * (via Zernio). Keeps people from clipping / generating before they link a page.
 * The server routes enforce the same rule, so this is UX, not the security gate.
 */
export default function ConnectionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      // Pass if EITHER a Zernio-connected account or a manually-added page exists.
      const counts = await Promise.all([
        apiGet<{ accounts: unknown[] }>("/api/zernio/accounts")
          .then((r) => r.accounts?.length ?? 0)
          .catch(() => 0),
        apiGet<{ accounts: unknown[] }>("/api/accounts")
          .then((r) => r.accounts?.length ?? 0)
          .catch(() => 0),
      ]);
      if (active) setState(counts.some((c) => c > 0) ? "ok" : "none");
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state === "ok") return <>{children}</>;

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-clipr-card neo-raised p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full neo-inset text-clipr-gold">
        <Link2 className="size-5" />
      </span>
      {state === "loading" ? (
        <p className="text-sm text-clipr-secondary">Checking your connections…</p>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold text-clipr-text">
              Connect a social account first
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-clipr-secondary">
              Link at least one of your TikTok, Instagram, YouTube or Facebook
              pages before you start clipping or generating videos.
            </p>
          </div>
          <Link
            href="/dashboard/connections"
            className="inline-flex items-center gap-2 rounded-lg bg-clipr-gold px-4 py-2 text-sm font-semibold text-clipr-bg transition-transform active:scale-95"
          >
            <Link2 className="size-4" />
            Go to connections
          </Link>
        </>
      )}
    </div>
  );
}
