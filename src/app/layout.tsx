import type { Metadata } from "next";
import "./globals.css";
import { ConvexProvider } from "@/components/convex-provider";

export const metadata: Metadata = {
  title: "1 Plus 1 | Taaruf Registration",
  description:
    "Find your perfect match with 1 Plus 1 Matching & Taaruf. A premium matchmaking service dedicated to helping you discover meaningful connections.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ConvexProvider>{children}</ConvexProvider>
      </body>
    </html>
  );
}
