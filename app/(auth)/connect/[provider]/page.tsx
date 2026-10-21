import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConnectTransition, HandoffSheet } from "@/components/auth/connect-transition";
import { Wordmark } from "@/components/brand/wordmark";
import { isConnectProvider, type ConnectProvider } from "@/lib/auth/oauth-providers";

export const metadata: Metadata = { title: "מתחברים", robots: { index: false } };

export function generateStaticParams(): { provider: ConnectProvider }[] {
  return [{ provider: "microsoft" }, { provider: "google" }];
}

/** Step 5 (round plan §3): the light hand-off screen between עלזה and the provider. */
export default function ConnectProviderPage(props: PageProps<"/connect/[provider]">) {
  return (
    <HandoffSheet>
      <header className="mx-auto flex h-[4.75rem] w-full max-w-6xl items-center px-4 sm:px-8">
        <Wordmark className="text-ink" />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 pb-24">
        <Suspense fallback={null}>
          <Transition params={props.params} />
        </Suspense>
      </main>
    </HandoffSheet>
  );
}

async function Transition({ params }: { params: PageProps<"/connect/[provider]">["params"] }) {
  const { provider } = await params;
  if (!isConnectProvider(provider)) notFound();
  return <ConnectTransition provider={provider} />;
}
