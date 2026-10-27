import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
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
    images: [
      {
        url: "/social-preview.png",
        width: 1280,
        height: 640,
        alt: "LabelForge: raw records in, reviewed evidence out",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LabelForge",
    description:
      "A collaborative, auditable workflow for structured data annotation.",
    images: ["/social-preview.png"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#f1efe8",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{if(localStorage.getItem("labelforge-theme")==="dark"){document.documentElement.dataset.theme="dark";}}catch(e){}})();',
          }}
        />
      </head>
      <body className={`${sans.variable} ${display.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
