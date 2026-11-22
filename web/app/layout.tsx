import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_JP, IBM_Plex_Mono, Hind_Siliguri } from "next/font/google";
import "./globals.css";

const jp = IBM_Plex_Sans_JP({ variable: "--font-jp", weight: ["400", "500", "600", "700"], subsets: ["latin"], preload: false });
const bn = Hind_Siliguri({ variable: "--font-bn", weight: ["400", "500", "600", "700"], subsets: ["bengali", "latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", weight: ["400", "500"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ichido 一度",
  description: "Say it once: the machine's alert, the caller's own words and the operator's decision, in the caller's language.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16191D" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${jp.variable} ${bn.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
