import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_JP, Hind_Siliguri } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const jp = IBM_Plex_Sans_JP({ variable: "--font-jp", weight: ["400", "500", "600"], subsets: ["latin"], preload: false });
const bn = Hind_Siliguri({ variable: "--font-bn", weight: ["400", "500", "600"], subsets: ["bengali", "latin"] });

export const metadata: Metadata = {
  title: "Ichido 一度",
  description: "Say it once: the machine's alert, the caller's own words and the operator's decision, in the caller's language.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e9e9e7" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${sans.variable} ${mono.variable} ${jp.variable} ${bn.variable}`}>
      <body>{children}</body>
    </html>
  );
}
