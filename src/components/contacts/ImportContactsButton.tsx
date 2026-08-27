"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, CircleMinus, FileUp, Loader2, Upload, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { parseVcf, type ParsedVCard } from "@/lib/contacts/vcf";
import { importVcfContactsAction, type ImportSummary } from "@/app/contacts/vcf-actions";

type Step = "pick" | "importing" | "done";

interface PendingRow {
  index: number;
  parsed: ParsedVCard;
}

function rowName(parsed: ParsedVCard, index: number): string {
  if (!parsed.ok) return "(unreadable card)";
  const { first_name, last_name, email } = parsed.input;
  return `${first_name} ${last_name}`.trim() || email || `Card ${index}`;
}

const STATUS_META = {
  imported: { label: "Imported", Icon: CheckCircle2, className: "text-green-600" },
  duplicate: { label: "Skipped — duplicate email", Icon: CircleMinus, className: "text-amber-600" },
  invalid: { label: "Invalid", Icon: CircleAlert, className: "text-destructive" },
  failed: { label: "Failed", Icon: CircleAlert, className: "text-destructive" },
} as const;

/** File.text() is missing from older jsdom; FileReader works everywhere. */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Wizard-style .vcf import: pick a file, review the parsed cards, then import.
 * Every card is created through the existing API; duplicates (409) are skipped
 * rather than merged, and each row reports its own outcome.
 */
export default function ImportContactsButton() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement | null>(null);

  function reset() {
    setStep("pick");
    setFileName(null);
    setPending([]);
    setSummary(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function onFileChosen(file: File) {
    const text = await readFileText(file);
    const parsed = parseVcf(text);
    setFileName(file.name);
    setPending(parsed.map((p, i) => ({ index: i + 1, parsed: p })));
    setStep("pick");
  }

  function runImport() {
    startTransition(async () => {
      setStep("importing");
      const result = await importVcfContactsAction(pending);
      setSummary(result);
      setStep("done");
    });
  }

  const creatable = pending.filter((row) => row.parsed.ok).length;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Import contacts from a vCard file"
      >
        <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Import
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import contacts from vCard"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-xl">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-display text-lg font-semibold text-foreground">
                Import contacts
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close import dialog"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </header>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-4">
              {step === "pick" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Choose a <code>.vcf</code> (vCard) file. Contacts whose email
                    already exists are skipped — nothing is merged or overwritten.
                  </p>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".vcf,text/vcard,text/x-vcard"
                    aria-label="vCard file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onFileChosen(file);
                    }}
                    className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
                  />

                  {pending.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[13px] text-muted-foreground">
                        {fileName}: {pending.length}{" "}
                        {pending.length === 1 ? "card" : "cards"} found,{" "}
                        {creatable} ready to import.
                      </p>
                      <ul className="divide-y divide-hairline rounded-md border border-border">
                        {pending.map((row) => (
                          <li
                            key={row.index}
                            className="flex items-center gap-2 px-3 py-2 text-sm"
                          >
                            <FileUp
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground">
                              {rowName(row.parsed, row.index)}
                            </span>
                            {row.parsed.ok ? null : (
                              <span className="text-[13px] text-destructive">
                                {row.parsed.reason}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}

              {step === "importing" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Importing {creatable} {creatable === 1 ? "contact" : "contacts"}…
                </p>
              ) : null}

              {step === "done" && summary ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    {summary.imported} imported · {summary.skipped} skipped ·{" "}
                    {summary.failed} failed
                  </p>
                  <ul className="divide-y divide-hairline rounded-md border border-border">
                    {summary.rows.map((row) => {
                      const { label, Icon, className } = STATUS_META[row.status];
                      return (
                        <li key={row.index} className="flex items-start gap-2 px-3 py-2 text-sm">
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${className}`}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-foreground">{row.name}</span>
                            <span className="block text-[13px] text-muted-foreground">
                              {label}
                              {row.message ? ` — ${row.message}` : ""}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>

            <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
              {step === "pick" ? (
                <>
                  <Button variant="ghost" size="sm" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={runImport}
                    disabled={isPending || creatable === 0}
                  >
                    Import {creatable > 0 ? creatable : ""}{" "}
                    {creatable === 1 ? "contact" : "contacts"}
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={close}>
                  Done
                </Button>
              )}
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
