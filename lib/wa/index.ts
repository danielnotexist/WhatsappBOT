import "server-only";
import { liveWaInDemo, waMocked } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { WaClient } from "./client";
import { RecordingWaSender, type WaSender } from "./sender";

export type { WaSender } from "./sender";

const NAME = "wa-sender";

/** The website chat's virtual numbers live under +999, a country code no phone has (lib/demo-chat/phone.ts). */
function isVirtualNumber(to: string): boolean {
  return to.replace(/^\+/, "").startsWith("999");
}

/**
 * The live-WhatsApp demo's sender: real sends, except to the website chat's virtual numbers (reminders and summaries
 * of a /demo/chat account), which are recorded — Meta would only reject them.
 */
function demoLiveSender(real: WaClient): WaSender {
  const recorder = new RecordingWaSender();
  const pick = (to: string): WaSender => (isVirtualNumber(to) ? recorder : real);
  return {
    sendText: (to, ...rest) => pick(to).sendText(to, ...rest),
    sendButtons: (to, ...rest) => pick(to).sendButtons(to, ...rest),
    sendList: (to, ...rest) => pick(to).sendList(to, ...rest),
    sendImage: (to, ...rest) => pick(to).sendImage(to, ...rest),
    sendDocument: (to, ...rest) => pick(to).sendDocument(to, ...rest),
    sendReaction: (to, ...rest) => pick(to).sendReaction(to, ...rest),
    sendTemplate: (to, ...rest) => pick(to).sendTemplate(to, ...rest),
    markRead: (messageId, opts) => real.markRead(messageId, opts),
    downloadMedia: (mediaId, maxBytes) => real.downloadMedia(mediaId, maxBytes),
  };
}

/**
 * `DATA_MODE=memory` or `DEMO_MODE=1` (`waMocked()` — the demo even when keys exist) → recording sender (console);
 * the demo with `LIVE_WA=1` → the real client, virtual numbers excepted; otherwise the real client (Hebrew EnvError
 * when tokens are missing).
 */
export function getWaSender(): WaSender {
  return globalSingleton<WaSender>(NAME, () => {
    if (waMocked()) return new RecordingWaSender();
    const real = WaClient.fromEnv();
    return liveWaInDemo() ? demoLiveSender(real) : real;
  });
}

export function setWaSenderForTests(sender: WaSender | undefined): void {
  setGlobalSingleton(NAME, sender);
}
