import { toast } from "sonner";

/**
 * App-wide toast helper. Replaces the per-tab `message` state pattern.
 * Renders through the themed <Toaster /> mounted in the root layout.
 */
export const notify = {
  success: (text: string) => toast.success(text),
  error: (text: string) => toast.error(text),
  info: (text: string) => toast.info(text),
};
