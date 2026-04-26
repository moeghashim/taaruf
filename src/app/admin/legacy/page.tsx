import { cookies } from "next/headers";
import crypto from "crypto";
import Link from "next/link";
import AdminLogin from "@/components/admin-login";
import AdminDashboard from "@/components/admin-dashboard";

/**
 * Legacy admin surface — the single-page dashboard that lived at
 * /admin before the redesign landed. Kept reachable at /admin/legacy
 * because it still owns features the new chrome hasn't re-skinned yet
 * (interests queue, profile shares, match notifications, image
 * thumbnails, applicant numbers, profile status filter).
 *
 * The new shell lives at /admin/dashboard and friends. Both routes
 * share the same cookie auth.
 */
export default async function AdminLegacyPage() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get("admin_token")?.value;

  const expectedToken = crypto
    .createHash("sha256")
    .update(process.env.ADMIN_PASSWORD + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt"))
    .digest("hex");

  const isAuthenticated = adminToken === expectedToken;

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  return (
    <>
      <div
        style={{
          padding: "10px 16px",
          background: "#FBF0DA",
          borderBottom: "1px solid #EEDAAA",
          fontSize: 12,
          color: "#8A5E1B",
          textAlign: "center",
        }}
      >
        You&apos;re viewing the legacy admin. The redesigned admin is at{" "}
        <Link href="/admin/dashboard" style={{ color: "#2E4A3E", fontWeight: 600 }}>
          /admin/dashboard
        </Link>
        .
      </div>
      <AdminDashboard />
    </>
  );
}
