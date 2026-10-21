import type { Metadata, Viewport } from "next";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/brand";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

const APP_NAME = BRAND.name;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} — ${BRAND.tagline}`,
    template: `%s · ${APP_NAME}`,
  },
  description: BRAND.description,
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: APP_NAME,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <DirectionProvider direction="rtl">
          {children}
          <Toaster />
        </DirectionProvider>
      </body>
    </html>
  );
}
