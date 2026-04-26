import { cookies } from "next/headers";
import crypto from "crypto";
import { Cormorant_Garamond, Inter_Tight, JetBrains_Mono } from "next/font/google";
import AdminLogin from "@/components/admin-login";
import { AdminShell } from "@/components/admin/layout/admin-shell";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500"],
  style: ["normal", "italic"],
  variable: "--font-admin-serif",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-admin-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-admin-mono",
  display: "swap",
});

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
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
    <div className={`${cormorant.variable} ${interTight.variable} ${jetbrainsMono.variable}`}>
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
