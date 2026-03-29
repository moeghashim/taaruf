import { cookies } from "next/headers";
import crypto from "crypto";
import AdminLogin from "@/components/admin-login";
import AdminDashboard from "@/components/admin-dashboard";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get("admin_token")?.value;

  // Verify the token
  const expectedToken = crypto
    .createHash("sha256")
    .update(process.env.ADMIN_PASSWORD + (process.env.ADMIN_TOKEN_SALT || "taaruf-admin-salt"))
    .digest("hex");

  const isAuthenticated = adminToken === expectedToken;

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  return <AdminDashboard />;
}
