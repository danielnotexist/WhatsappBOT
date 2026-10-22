import type { Metadata, Viewport } from "next";
import { DemoBar } from "@/components/demo/DemoBar";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/brand";
import { isDemo } from "@/lib/demo";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

const APP_NAME = BRAND.name;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} - ${BRAND.tagline}`,
    template: `%s · ${APP_NAME}`,
  },
  description: BRAND.description,
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: APP_NAME,
  },
  formatDetection: { telephone: false },
  // מצב הדגמה: noindex כבר ב-<head> (נקבע ב-build; ב-Vercel אותם משתנים ל-build ול-runtime). בזמן ריצה — X-Robots-Tag ב-proxy.ts.
  ...(isDemo() ? { robots: { index: false, follow: false } } : {}),
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
        <DemoBar />
        <DirectionProvider direction="rtl">
          {children}
          <Toaster />
        </DirectionProvider>
      </body>
    </html>
  );
}
