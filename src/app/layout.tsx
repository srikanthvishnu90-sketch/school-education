import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Sans = Inter, for all data / academic UI.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// NOTE: the serif "voice" font (--font-voice) is intentionally NOT loaded yet.
// The variable is wired in globals.css and falls back to a serif stack until a
// reflection/emotional surface task adopts it.

export const metadata: Metadata = {
  title: "plumb",
  description: "A personal instrument for accurate academic self-knowledge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
