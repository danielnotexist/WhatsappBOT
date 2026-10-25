"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { UTM_FIELDS } from "@/lib/analytics/events";
import { trackPageView } from "@/lib/analytics/send";

/**
 * Mounted once in the root layout (inside Suspense: it reads the URL on the client). One page view per route change —
 * the path and its utm_* parameters — through lib/analytics/send.ts (cookie-less, Do-Not-Track respected, nothing on
 * /admin, /api, /dev, /pay). The last reported URL is kept so a re-render or StrictMode's second effect sends nothing.
 * Renders nothing.
 */
export function PageBeacon() {
  const pathname = usePathname();
  const params = useSearchParams();
  // only the parts that are reported: a change of another parameter (?tab=, ?email=) is not a new page view
  const search = UTM_FIELDS.map((k) => params.get(k) ?? "").join("|");
  const last = useRef<string | null>(null);

  useEffect(() => {
    const key = `${pathname}?${search}`;
    if (last.current === key) return;
    last.current = key;
    trackPageView();
  }, [pathname, search]);

  return null;
}
