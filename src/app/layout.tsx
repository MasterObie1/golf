import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { NavigationWrapper } from "@/components/NavigationWrapper";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
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
        className={`${jakarta.variable} ${inter.variable} ${playfair.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-green-800 focus:rounded-lg focus:shadow-lg focus:font-semibold"
        >
          Skip to main content
        </a>
        <NavigationWrapper />
        <main id="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
