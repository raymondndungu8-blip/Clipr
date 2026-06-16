// Placeholder shown while a clip is still being generated, so the user sees
// one card per requested clip filling in. Mirrors ClipCard's layout.
export default function ClipCardSkeleton({ label }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-clipr-card neo-raised p-4">
      <div className="flex justify-center">
        <div className="relative w-[150px] overflow-hidden rounded-xl">
          <div className="clipr-shimmer aspect-[9/16] w-full rounded-xl" />
          {label && (
            <span className="absolute inset-x-0 bottom-2 text-center font-mono text-[10px] uppercase tracking-wide text-clipr-secondary">
              {label}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="clipr-shimmer h-4 w-3/4 rounded" />
        <div className="clipr-shimmer h-3 w-full rounded" />
        <div className="clipr-shimmer h-3 w-5/6 rounded" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <div className="clipr-shimmer h-5 w-14 rounded-full" />
        <div className="clipr-shimmer h-5 w-16 rounded-full" />
        <div className="clipr-shimmer h-5 w-12 rounded-full" />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <div className="clipr-shimmer h-8 w-full rounded-lg" />
        <div className="flex gap-2">
          <div className="clipr-shimmer h-8 flex-1 rounded-lg" />
          <div className="clipr-shimmer h-8 flex-1 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
