"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { contactsHref, type ContactListQuery } from "@/lib/contacts/query";
import { PER_PAGE_OPTIONS } from "@/lib/contacts/types";
import { ExportAllButton } from "./ExportButtons";
import ImportContactsButton from "./ImportContactsButton";

const DEBOUNCE_MS = 300;

/**
 * Search box and page-size picker. Both write to the URL rather than to local
 * state, so the server component re-renders with the new query and the result
 * stays bookmarkable and back-button friendly.
 */
export default function ContactsToolbar({ query }: { query: ContactListQuery }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState(query.search);
  const [urlTerm, setUrlTerm] = useState(query.search);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL can change without this component remounting — back/forward, or the
  // "clear search" link in the empty state. Adjust during render rather than in
  // an effect, so there is no flash of the stale term.
  if (query.search !== urlTerm) {
    setUrlTerm(query.search);
    setTerm(query.search);
  }

  useEffect(() => () => clearTimeout(debounce.current ?? undefined), []);

  function navigate(search: string) {
    startTransition(() => {
      router.replace(contactsHref(query, { search, page: 1 }), {
        scroll: false,
      });
    });
  }

  function onSearchChange(value: string) {
    setTerm(value);
    clearTimeout(debounce.current ?? undefined);
    debounce.current = setTimeout(() => navigate(value), DEBOUNCE_MS);
  }

  function clear() {
    clearTimeout(debounce.current ?? undefined);
    setTerm("");
    navigate("");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          type="search"
          value={term}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, email, company, or phone…"
          aria-label="Search contacts"
          className="h-9 w-full rounded-md border border-border bg-input pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {isPending ? (
            <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : term ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </span>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        Per page
        <select
          value={query.perPage}
          aria-label="Contacts per page"
          onChange={(event) =>
            startTransition(() => {
              router.replace(
                contactsHref(query, {
                  perPage: Number(event.target.value),
                  page: 1,
                }),
                { scroll: false },
              );
            })
          }
          className="h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground focus:border-primary"
        >
          {PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <ImportContactsButton />
        <ExportAllButton />
      </div>
    </div>
  );
}
