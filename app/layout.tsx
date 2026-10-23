import type { Metadata, Viewport } from "next";
import { A11yMotion } from "@/components/brand/a11y-motion";
import { AccessibilityWidget } from "@/components/brand/accessibility-widget";
import { DemoBar } from "@/components/demo/DemoBar";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { A11Y_INIT_SCRIPT } from "@/lib/a11y/settings";
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
    // suppressHydrationWarning: the inline script below adds the saved accessibility settings (data-a11y-*) to <html>
    // before React hydrates. It covers this element's own attributes only.
    <html lang="he" dir="rtl" className={`${fontVariables} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* the accessibility menu's saved settings, applied before the first paint (lib/a11y/settings.ts) */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-honey focus:px-5 focus:py-2.5 focus:font-semibold focus:text-night"
        >
          דילוג לתוכן
        </a>
        <DemoBar />
        <DirectionProvider direction="rtl">
          <A11yMotion>{children}</A11yMotion>
          <AccessibilityWidget />
          <Toaster />
        </DirectionProvider>
      </body>
    </html>
  );
}
