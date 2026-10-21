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
  // "לילה ירוק" is dark by default (marketing + auth); light surfaces opt in with `.surface-light`.
  colorScheme: "dark",
  themeColor: "#0F1C17",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${fontVariables} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-honey focus:px-5 focus:py-2.5 focus:font-semibold focus:text-night"
        >
          דילוג לתוכן
        </a>
        <DirectionProvider direction="rtl">
          {children}
          <Toaster />
        </DirectionProvider>
      </body>
    </html>
  );
}
