import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { formatPhoneIl } from "@/lib/admin/view";
import type { UserRow } from "@/lib/db/types";
import { CopyButton } from "./copy-button";
import { Ltr } from "./parts";

/**
 * The slim bar of the pages about one user that open in their own tab (the conversation, the activity): the way back
 * to the user's card, who this is (name, business, phone) and "העתקת פרטים". The page's h1 is the user's name.
 */
export function UserBar({ user, phone, page, details }: { user: UserRow; phone: string | null; page: string; details: string }) {
  const name = user.name || user.business_name || user.email;
  return (
    <header className="flex-none border-b border-line bg-night/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-8">
        <Link
          href={`/admin/users/${user.id}` as Route}
          className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-full text-[0.875rem] text-cream-muted underline-offset-4 hover:text-cream hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
        >
          <ArrowRight aria-hidden="true" className="size-4 ltr:-scale-x-100" />
          לכרטיס המשתמש
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 max-sm:order-last max-sm:basis-full">
          <h1 className="min-w-0 truncate text-[1.125rem] leading-tight font-bold text-cream">
            {name}
            <span className="sr-only">, {page}</span>
          </h1>
          <p className="min-w-0 truncate text-[0.875rem] text-cream-muted">
            {user.business_name && user.name ? user.business_name : null}
            {phone ? (
              <>
                {user.business_name && user.name ? ", " : null}
                <Ltr className="tabular">{formatPhoneIl(phone)}</Ltr>
              </>
            ) : null}
          </p>
        </div>
        <span aria-hidden="true" className="flex-none rounded-full border border-honey/45 px-2.5 py-0.5 text-[0.8125rem] text-honey max-sm:hidden">
          {page}
        </span>
        <div className="ms-auto flex-none">
          <CopyButton text={details} />
        </div>
      </div>
    </header>
  );
}
