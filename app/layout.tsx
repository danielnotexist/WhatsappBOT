import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { PageBeacon } from "@/components/analytics/page-beacon";
import { A11yMotion } from "@/components/brand/a11y-motion";
import { AccessibilityWidget } from "@/components/brand/accessibility-widget";
import { DemoBar } from "@/components/demo/DemoBar";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { A11Y_INIT_SCRIPT } from "@/lib/a11y/settings";
import { BRAND } from "@/lib/brand";
import { isDemo } from "@/lib/demo";
import { fontVariables } from "@/lib/fonts";
import { HOME_TITLE, SITE_IMAGE, siteOrigin } from "@/lib/seo/site";
import "./globals.css";

const APP_NAME = BRAND.name;

/**
 * The site's defaults (lib/seo/site.ts): every URL field resolves against APP_URL, the title template adds the name,
 * and a page without its own share image gets the site's (app/opengraph-image.tsx). Public pages set their own full
 * metadata with pageMetadata(); private ones are noindex.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  applicationName: APP_NAME,
  title: {
    default: HOME_TITLE,
    template: `%s · ${APP_NAME}`,
  },
  description: BRAND.description,
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: APP_NAME,
    title: HOME_TITLE,
    description: BRAND.description,
    images: [{ url: SITE_IMAGE, width: 1200, height: 630, alt: HOME_TITLE, type: "image/png" }],
  },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: BRAND.description, images: [SITE_IMAGE] },
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
        {/* cookie-less page views (lib/analytics): reads the URL on the client, so it waits in its own boundary */}
        <Suspense fallback={null}>
          <PageBeacon />
        </Suspense>
      </body>
    </html>
  );
}
