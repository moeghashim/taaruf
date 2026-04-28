import type { Metadata } from "next";
import { Cormorant_Garamond, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ConvexProvider } from "@/components/convex-provider";

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
      <body className={`${cormorant.variable} ${interTight.variable} ${jetbrainsMono.variable} antialiased`}>
        <ConvexProvider>{children}</ConvexProvider>
      </body>
    </html>
  );
}
