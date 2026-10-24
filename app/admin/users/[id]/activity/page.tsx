import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityView } from "./view";

export const metadata: Metadata = { title: "ניהול - ציר הפעולות", robots: { index: false, follow: false } };

/** The gate, the audit entry and the timeline are in ./view.tsx (request-time, inside Suspense). */
export default function AdminActivityPage(props: PageProps<"/admin/users/[id]/activity">) {
  return (
    <Suspense
      fallback={
        <div className="stage flex min-h-dvh">
          <p role="status" className="m-auto text-cream-muted">
            טוען…
          </p>
        </div>
      }
    >
      <ActivityView params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
