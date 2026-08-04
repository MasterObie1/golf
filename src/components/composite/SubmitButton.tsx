"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type SubmitButtonProps = React.ComponentProps<typeof Button> & {
  /** Override for non-form-action flows (fetch/mutation handlers). */
  pending?: boolean;
};

/**
 * Submit button with a spinner. Inside a <form action={...}> the pending
 * state comes from useFormStatus automatically; elsewhere pass `pending`.
 */
export function SubmitButton({
  children,
  pending: pendingProp,
  disabled,
  type = "submit",
  ...props
}: SubmitButtonProps) {
  const { pending: formPending } = useFormStatus();
  const isPending = pendingProp ?? formPending;

  return (
    <Button type={type} disabled={disabled || isPending} {...props}>
      {isPending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
