import type { Metadata, Viewport } from "next";
import { Inter, DM_Mono, IBM_Plex_Sans_JP, Hind_Siliguri, Noto_Sans_Devanagari } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { META } from "@/content/catalogue";
import { Splash, SPLASH_GATE } from "@/components/splash";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin", "vietnamese"] });
const mono = DM_Mono({ variable: "--font-mono", weight: ["400", "500"], subsets: ["latin"] });
const jp = IBM_Plex_Sans_JP({ variable: "--font-jp", weight: ["400", "500"], subsets: ["latin"], preload: false });
const bn = Hind_Siliguri({ variable: "--font-bn", weight: ["400", "500"], subsets: ["bengali", "latin"] });
const ne = Noto_Sans_Devanagari({ variable: "--font-ne", weight: ["400", "500"], subsets: ["devanagari"], preload: false });

export const metadata: Metadata = { title: META.title, description: META.description };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f5f5" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${jp.variable} ${bn.variable} ${ne.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: SPLASH_GATE }} /></head>
      <body>
        <Splash />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
