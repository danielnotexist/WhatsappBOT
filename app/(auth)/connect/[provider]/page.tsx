import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConnectTransition, HandoffSheet } from "@/components/auth/connect-transition";
import { HEADER_BAR } from "@/components/brand/frame";
import { PageTransition } from "@/components/brand/page-transition";
import { Wordmark } from "@/components/brand/wordmark";
import { isConnectProvider, type ConnectProvider } from "@/lib/auth/oauth-providers";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "מתחברים", robots: NOINDEX };

export function generateStaticParams(): { provider: ConnectProvider }[] {
  return [{ provider: "microsoft" }, { provider: "google" }];
}

/** Step 5 (round plan §3): the light hand-off screen between עלזה and the provider. */
export default function ConnectProviderPage(props: PageProps<"/connect/[provider]">) {
  return (
    <PageTransition>
      <HandoffSheet>
        <header className={HEADER_BAR}>
          <Wordmark className="text-ink" />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-6 pb-24">
          <Suspense fallback={null}>
            <Transition params={props.params} />
          </Suspense>
        </main>
      </HandoffSheet>
    </PageTransition>
  );
}

async function Transition({ params }: { params: PageProps<"/connect/[provider]">["params"] }) {
  const { provider } = await params;
  if (!isConnectProvider(provider)) notFound();
  return <ConnectTransition provider={provider} />;
}
