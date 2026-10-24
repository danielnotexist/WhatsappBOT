import type { Metadata } from "next";
import { Suspense } from "react";
import { ConversationView } from "./view";

export const metadata: Metadata = { title: "ניהול - השיחה בוואטסאפ", robots: { index: false, follow: false } };

/** The gate, the audit entry and the reader are in ./view.tsx (request-time, inside Suspense). */
export default function AdminConversationPage(props: PageProps<"/admin/users/[id]/conversation">) {
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
      <ConversationView params={props.params} />
    </Suspense>
  );
}
