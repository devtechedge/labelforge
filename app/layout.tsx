import type { Metadata, Viewport } from "next";
import { Gloock, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";

import "./globals.css";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  display: "swap",
});

const display = Gloock({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-gloock",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "LabelForge: auditable annotation workbench",
    template: "%s · LabelForge",
  },
  description:
    "Import CSV and JSONL records, assign annotation work, review disagreements, and publish immutable datasets with reproducible manifests.",
  applicationName: "LabelForge",
  openGraph: {
    title: "LabelForge: auditable annotation workbench",
    description:
      "A collaborative workflow for turning raw structured records into reviewed, versioned annotation datasets.",
    type: "website",
    url: appUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "LabelForge",
    description:
      "A collaborative, auditable workflow for structured data annotation.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f2ecdf",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${sans.variable} ${display.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
