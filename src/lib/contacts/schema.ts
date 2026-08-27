import { z } from "zod";
import { ADDRESS_TYPES, type AddressInput, type ContactInput } from "./types";

/**
 * Client/server-shared validation for the contact form.
 *
 * The rules mirror the API's Pydantic models (`ContactCreate` / `ContactReplace`)
 * so the user sees a mistake before a round trip — the API stays the authority,
 * and anything it rejects anyway is surfaced by `toFieldErrors` in `./api.ts`.
 */

/** Optional text: trimmed, and blank becomes `null` (the API clears the field). */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((value) => value || null)
    .nullable()
    .default(null);
}

function requiredText(max: number, label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);
}

/** Matches the API's cap: about 2 MB of image data once base64-decoded. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Base64 expands data by 4/3; this is a transport-length guard, not the byte cap.
export const MAX_PHOTO_DATA_URL_LENGTH =
  Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64;

/** Matches the API's cap on addresses per contact. */
export const MAX_ADDRESSES = 10;

export const addressInputSchema = z
  .object({
    type: z.enum(ADDRESS_TYPES, { error: "Choose an address type" }),
    street: optionalText(300, "Street address"),
    city: optionalText(120, "City"),
    state: optionalText(120, "State / region"),
    postal_code: optionalText(20, "Postal code"),
    country: optionalText(120, "Country"),
  })
  .check((ctx) => {
    const value = ctx.value;
    const filled = [value.street, value.city, value.state, value.postal_code, value.country];
    if (filled.every((field) => !field)) {
      ctx.issues.push({
        code: "custom",
        input: value,
        message: "Fill in at least one address field, or remove the address",
      });
    }
  });

// Raster formats every browser renders; excludes svg (scriptable) and friends.
// Keep in sync with the API's validator.
const PHOTO_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,/;

function decodedPhotoByteLength(value: string): number {
  const payload = value.slice(value.indexOf(",") + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return (payload.length / 4) * 3 - padding;
}

export const contactInputSchema = z.object({
  first_name: requiredText(100, "First name"),
  last_name: requiredText(100, "Last name"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(320, "Email must be 320 characters or fewer")
    .pipe(z.email("Enter a valid email address"))
    .transform((value) => value.toLowerCase()),
  phone: optionalText(40, "Phone"),
  company: optionalText(200, "Company"),
  job_title: optionalText(200, "Job title"),
  addresses: z
    .array(addressInputSchema)
    .max(MAX_ADDRESSES, `At most ${MAX_ADDRESSES} addresses`)
    .default([]),
  notes: z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable()
    .default(null),
  photo: z
    .string()
    .max(MAX_PHOTO_DATA_URL_LENGTH, "Photo must be under 2 MB")
    .refine((value) => !value || PHOTO_DATA_URL.test(value), {
      error: "Photo must be a PNG, JPEG, GIF, or WebP image",
    })
    .refine((value) => !value || decodedPhotoByteLength(value) <= MAX_PHOTO_BYTES, {
      error: "Photo must be under 2 MB",
    })
    .transform((value) => value || null)
    .nullable()
    .default(null),
}) satisfies z.ZodType<ContactInput, unknown>;

export type ContactFormValues = z.input<typeof contactInputSchema>;

/** Collapse a ZodError into one message per field, keyed by input path. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    // An issue against the address object as a whole (e.g. all fields blank)
    // hangs off its type selector's path, so it renders inside the right block.
    const path =
      issue.path.length === 2 && issue.path[0] === "addresses"
        ? [...issue.path, "type"]
        : issue.path;
    const key = path.join(".");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/* ------------------------------------------------------------------ */
/* Form metadata — one source of truth for the fields and their limits */
/* ------------------------------------------------------------------ */

/** The contact fields rendered as plain string inputs in the metadata groups. */
type ScalarContactKey = Exclude<keyof ContactInput, "addresses">;

export interface ContactFieldSpec {
  name: ScalarContactKey;
  label: string;
  type?: "text" | "email" | "tel" | "textarea";
  required?: boolean;
  maxLength: number;
  placeholder?: string;
  autoComplete?: string;
  /** Column span inside the section grid. */
  wide?: boolean;
}

export interface ContactFieldGroup {
  title: string;
  description: string;
  fields: ContactFieldSpec[];
}

export const CONTACT_FIELD_GROUPS: ContactFieldGroup[] = [
  {
    title: "Identity",
    description: "First name, last name, and email are required.",
    fields: [
      {
        name: "first_name",
        label: "First name",
        required: true,
        maxLength: 100,
        placeholder: "Ada",
        autoComplete: "given-name",
      },
      {
        name: "last_name",
        label: "Last name",
        required: true,
        maxLength: 100,
        placeholder: "Lovelace",
        autoComplete: "family-name",
      },
      {
        name: "email",
        label: "Email",
        type: "email",
        required: true,
        maxLength: 320,
        placeholder: "ada@example.com",
        autoComplete: "email",
      },
      {
        name: "phone",
        label: "Phone",
        type: "tel",
        maxLength: 40,
        placeholder: "+1-415-555-0101",
        autoComplete: "tel",
      },
    ],
  },
  {
    title: "Work",
    description: "Where they work and what they do.",
    fields: [
      {
        name: "company",
        label: "Company",
        maxLength: 200,
        placeholder: "Analytical Engines",
        autoComplete: "organization",
      },
      {
        name: "job_title",
        label: "Job title",
        maxLength: 200,
        placeholder: "Mathematician",
        autoComplete: "organization-title",
      },
    ],
  },
  {
    title: "Notes",
    description: "Anything worth remembering. No length limit.",
    fields: [
      {
        name: "notes",
        label: "Notes",
        type: "textarea",
        maxLength: 10_000,
        placeholder: "Met at the SF hackathon.",
        wide: true,
      },
    ],
  },
];

export const CONTACT_FIELDS: ContactFieldSpec[] = CONTACT_FIELD_GROUPS.flatMap(
  (group) => group.fields,
);

export type AddressFieldName = keyof Omit<AddressInput, "type">;

export const ADDRESS_FIELDS: { name: AddressFieldName; label: string; placeholder?: string }[] = [
  { name: "street", label: "Street address", placeholder: "1 Market St, Suite 400" },
  { name: "city", label: "City", placeholder: "San Francisco" },
  { name: "state", label: "State / region", placeholder: "CA" },
  { name: "postal_code", label: "Postal code", placeholder: "94105" },
  { name: "country", label: "Country", placeholder: "USA" },
];

const ADDRESS_FIELD_NAME = /^addresses\.(\d+)\.(\w+)$/;

/** Collect the indexed `addresses.N.field` inputs into a nested array. */
function formDataToAddresses(formData: FormData): Record<string, string>[] {
  const byIndex = new Map<number, Record<string, string>>();
  for (const [key, value] of formData.entries()) {
    const match = ADDRESS_FIELD_NAME.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const fields = byIndex.get(index) ?? {};
    fields[match[2]] = String(value);
    byIndex.set(index, fields);
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, fields]) => fields);
}

/** Pull the contact fields out of a submitted form, as raw strings. */
export function formDataToValues(formData: FormData): Partial<ContactInput> {
  return {
    ...(Object.fromEntries(
      CONTACT_FIELDS.map((field) => [
        field.name,
        String(formData.get(field.name) ?? ""),
      ]),
    ) as Partial<ContactInput>),
    // Specialized fields submit their values through their own form controls.
    photo: String(formData.get("photo") ?? ""),
    addresses: formDataToAddresses(formData) as unknown as AddressInput[],
  };
}
