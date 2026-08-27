"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ApiUnreachableError } from "@/lib/apiClient";
import {
  apiErrorMessage,
  createContact,
  listContacts,
} from "@/lib/contacts/api";
import { contactInputSchema } from "@/lib/contacts/schema";
import { contactsToVcf, type ParsedVCard } from "@/lib/contacts/vcf";
import type { Contact, ContactInput } from "@/lib/contacts/types";

/**
 * Server actions backing the VCF import/export UI. The vCard parsing itself
 * happens in the browser (see `lib/contacts/vcf.ts`); these actions only move
 * data between the browser and the backend, which the browser cannot reach
 * directly.
 */

/** Serialise the entire collection as one .vcf document. */
export async function exportAllContactsVcf(): Promise<string> {
  const contacts: Contact[] = [];
  let offset = 0;
  const limit = 200; // the API's maximum page size
  for (;;) {
    const page = await listContacts({ limit, offset, sortBy: "id", order: "asc" });
    contacts.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) break;
  }
  return contactsToVcf(contacts);
}

export type ImportRowStatus = "imported" | "duplicate" | "invalid" | "failed";

export interface ImportRow {
  /** 1-based position of the card in the uploaded file. */
  index: number;
  /** Display name (or a placeholder) for the row. */
  name: string;
  status: ImportRowStatus;
  /** Extra detail for duplicate/invalid/failed rows. */
  message?: string;
}

export interface ImportSummary {
  rows: ImportRow[];
  imported: number;
  skipped: number;
  failed: number;
}

const UNREACHABLE =
  "Could not reach the Contacts API. Check that the backend is running.";

/**
 * Import parsed vCards one at a time via the existing create endpoint.
 *
 * Conflicts are not merged: a 409 (email already in use) marks the row
 * "duplicate" and the file moves on. Validation problems the browser-side
 * check missed surface from zod or the API as "invalid". Rows are processed
 * sequentially so the UI's per-row statuses stay in file order.
 */
export async function importVcfContactsAction(
  cards: { index: number; parsed: ParsedVCard }[],
): Promise<ImportSummary> {
  const rows: ImportRow[] = [];

  for (const { index, parsed } of cards) {
    if (!parsed.ok) {
      rows.push({ index, name: "(unreadable card)", status: "invalid", message: parsed.reason });
      continue;
    }

    const input: ContactInput = parsed.input;
    const name =
      `${input.first_name} ${input.last_name}`.trim() || input.email || `Card ${index}`;

    const local = contactInputSchema.safeParse(input);
    if (!local.success) {
      const first = local.error.issues[0];
      rows.push({
        index,
        name,
        status: "invalid",
        message: first ? `${first.path.join(".") || "field"}: ${first.message}` : "Invalid values",
      });
      continue;
    }

    try {
      await createContact(local.data);
      rows.push({ index, name, status: "imported" });
    } catch (error) {
      if (error instanceof ApiUnreachableError) {
        rows.push({ index, name, status: "failed", message: UNREACHABLE });
      } else if (error instanceof ApiError && error.status === 409) {
        rows.push({
          index,
          name,
          status: "duplicate",
          message: apiErrorMessage(error, "A contact with this email already exists."),
        });
      } else if (error instanceof ApiError) {
        rows.push({
          index,
          name,
          status: "failed",
          message: apiErrorMessage(error, `The API rejected this contact (HTTP ${error.status}).`),
        });
      } else {
        throw error;
      }
    }
  }

  if (rows.some((row) => row.status === "imported")) revalidatePath("/contacts");

  return {
    rows,
    imported: rows.filter((row) => row.status === "imported").length,
    skipped: rows.filter((row) => row.status === "duplicate" || row.status === "invalid").length,
    failed: rows.filter((row) => row.status === "failed").length,
  };
}
