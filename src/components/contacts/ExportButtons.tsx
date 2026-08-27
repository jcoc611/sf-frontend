"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { contactToVCard } from "@/lib/contacts/vcf";
import { exportAllContactsVcf } from "@/app/contacts/vcf-actions";
import type { Contact } from "@/lib/contacts/types";

/** Kebab-case a display name for a filename like `ada-lovelace.vcf`. */
function vcfFileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "contact";
}

/** Trigger a browser download of a text payload as a named file. */
function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads the whole collection as one .vcf. The serialised document comes
 * from a server action (the browser cannot reach the backend directly); the
 * download itself is a plain client-side blob.
 */
export function ExportAllButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const vcf = await exportAllContactsVcf();
        downloadTextFile("contacts.vcf", vcf);
      } catch {
        setError("Export failed — is the API reachable?");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        disabled={isPending}
        aria-label="Export all contacts as a vCard file"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        Export all
      </Button>
      {error ? (
        <span role="alert" className="text-[13px] text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Downloads a single contact's vCard. No server round trip needed. */
export function ExportContactButton({ contact }: { contact: Contact }) {
  function onClick() {
    downloadTextFile(`${vcfFileSlug(contact.full_name)}.vcf`, contactToVCard(contact));
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      aria-label={`Export ${contact.full_name} as a vCard file`}
    >
      <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      Export
    </Button>
  );
}
