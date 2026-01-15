import { cookies } from "next/headers";

/**
 * Check if the current request is from an authenticated admin.
 * Used by server actions to verify authorization.
 *
 * @throws Error if not authorized
 */
export async function requireAdmin(): Promise<void> {
  const adminSecret = process.env.ADMIN_SECRET;

  // In development without ADMIN_SECRET, allow all access
  if (!adminSecret && process.env.NODE_ENV !== "production") {
    return;
  }

  // In production without ADMIN_SECRET, deny all access
  if (!adminSecret) {
    throw new Error("Unauthorized: Admin access not configured");
  }

  // Check for valid admin token in cookies
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (token !== adminSecret) {
    throw new Error("Unauthorized: Invalid or missing admin token");
  }
}

/**
 * Check if the current request is from an authenticated admin.
 * Returns boolean instead of throwing.
 */
export async function isAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}
