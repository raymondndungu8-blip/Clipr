"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl bg-clipr-card neo-raised p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full neo-inset text-clipr-error">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="text-xl font-semibold text-clipr-text">
          Something went wrong
        </h2>
        <p className="text-sm text-clipr-secondary">
          We hit a snag loading this page. Try again — if it keeps happening,
          come back in a bit.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
