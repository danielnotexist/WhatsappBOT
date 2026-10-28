"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native <details> (closed by default) that opens itself when the address names it - "/pricing#compare" from the
 * landing's "להשוואה המלאה" - and scrolls to it. On load and on a later hash change (an in-page link). Without
 * JavaScript the anchor still scrolls to the closed disclosure, and its summary opens it as usual.
 */
export function OpenOnHash({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      const el = ref.current;
      if (!el || window.location.hash !== `#${id}`) return;
      el.open = true;
      requestAnimationFrame(() => el.scrollIntoView?.({ block: "start" }));
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id]);
  return (
    <details ref={ref} id={id} className={className}>
      {children}
    </details>
  );
}
