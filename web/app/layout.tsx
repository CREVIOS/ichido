import type { Metadata, Viewport } from "next";
import { Inter, DM_Mono, IBM_Plex_Sans_JP, Hind_Siliguri } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { META } from "@/content/catalogue";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = DM_Mono({ variable: "--font-mono", weight: ["400", "500"], subsets: ["latin"] });
const jp = IBM_Plex_Sans_JP({ variable: "--font-jp", weight: ["400", "500"], subsets: ["latin"], preload: false });
const bn = Hind_Siliguri({ variable: "--font-bn", weight: ["400", "500"], subsets: ["bengali", "latin"] });

export const metadata: Metadata = { title: META.title, description: META.description };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f5f5" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${sans.variable} ${mono.variable} ${jp.variable} ${bn.variable}`}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
