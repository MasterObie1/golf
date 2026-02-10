import type { Metadata } from "next";
import { Oswald, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { NavigationWrapper } from "@/components/NavigationWrapper";
import { TimeProvider } from "@/components/grounds/TimeProvider";
import { MotionProvider } from "@/components/grounds/MotionProvider";
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "LeagueLinks",
    template: "%s | LeagueLinks",
  },
  description: "Premium golf league management - connecting golfers, teams, and leagues",
  openGraph: {
    type: "website",
    siteName: "LeagueLinks",
    title: "LeagueLinks",
    description: "Premium golf league management - connecting golfers, teams, and leagues",
  },
  twitter: {
    card: "summary",
    title: "LeagueLinks",
    description: "Premium golf league management - connecting golfers, teams, and leagues",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${oswald.variable} ${ibmPlexMono.variable} ${sourceSans.variable} antialiased`}
      >
        <TimeProvider />
        <MotionProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-fairway focus:rounded-lg focus:shadow-lg focus:font-semibold"
          >
            Skip to main content
          </a>
          <NavigationWrapper />
          <main id="main-content">
            {children}
          </main>
        </MotionProvider>
      </body>
    </html>
  );
}
