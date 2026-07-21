import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// Sans = Inter, for all data / academic UI.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Voice = Fraunces, an optical-size serif with real character — used for display
// headings and the human/reflective "voice" moments (via `--font-voice`). It gives
// plumb an editorial, instrument-like identity instead of a generic sans-only look.
const fraunces = Fraunces({
  variable: "--font-voice-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://awareness-sepia.vercel.app";
const DESCRIPTION =
  "plumb helps K-12 students build accurate academic self-knowledge — private by default, task-focused, never a ranking.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "plumb — honest classroom reflection",
    template: "%s · plumb",
  },
  description: DESCRIPTION,
  applicationName: "plumb",
  openGraph: {
    title: "plumb — honest classroom reflection",
    description: DESCRIPTION,
    siteName: "plumb",
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "plumb — honest classroom reflection",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${fraunces.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
