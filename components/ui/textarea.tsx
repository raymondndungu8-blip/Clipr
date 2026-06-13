import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border-none bg-clipr-card neo-inset px-4 py-3 text-base transition-[color,box-shadow] outline-none placeholder:text-clipr-dim focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
