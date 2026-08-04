import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "w-full min-w-0 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "h-9 rounded-md border border-input bg-transparent px-3 py-1 shadow-xs selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        pencil:
          "rounded-none border-0 border-b border-scorecard-line bg-transparent px-0 py-2 font-mono text-scorecard-pencil focus-visible:border-primary focus-visible:shadow-[0_1px_0_var(--color-primary)] focus-visible:ring-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Input, inputVariants }
