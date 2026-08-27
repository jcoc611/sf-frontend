import type { Contact, ContactInput } from "./types";

/**
 * Minimal vCard 3.0 codec for import/export.
 *
 * Deliberately pragmatic, not full RFC 6350: we emit vCard 3.0 UTF-8, and we
 * parse that plus the bits of vCard 2.1 that show up in the wild (QUOTED-
 * PRINTABLE soft breaks, ENCODING=b photos). Anything we cannot map to a
 * contact field is ignored; cards missing a name or email surface as errors
 * rather than aborting the file.
 */

/** One parsed vCard: either a contact payload or the reason it failed. */
export type ParsedVCard =
  | { ok: true; input: ContactInput }
  | { ok: false; reason: string };

/* ------------------------------------------------------------------ */
/* Text-level escaping & line folding                                  */
/* ------------------------------------------------------------------ */

/** Escape the characters vCard text values reserve. */
export function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function unescapeVCardText(value: string): string {
  return value.replace(/\\(.)|./g, (token) => {
    if (token.length === 1) return token;
    const char = token[1];
    if (char === "n" || char === "N") return "\n";
    return char; // \\, \; \, and anything else: keep the escaped char
  });
}

/**
 * Fold a content line to the 75-octet limit. We split at 74 chars and continue
 * with a leading space; a multi-byte char can push a line slightly past 75
 * octets, which every real-world parser tolerates.
 */
function foldLine(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 74) {
    chunks.push((first ? "" : " ") + rest.slice(0, 74));
    rest = rest.slice(74);
    first = false;
  }
  chunks.push((first ? "" : " ") + rest);
  return chunks.join("\r\n");
}

/** Unfold continuation lines (CRLF followed by space/tab) into logical lines. */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r\n|\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

const PHOTO_TYPE_FROM_DATA_URL: Record<string, string> = {
  png: "PNG",
  jpeg: "JPEG",
  gif: "GIF",
  webp: "WEBP",
};

/** Serialise one contact as a vCard 3.0 entry (without surrounding cards). */
export function contactToVCard(contact: Contact): string {
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCardText(contact.last_name)};${escapeVCardText(contact.first_name)};;;`,
    `FN:${escapeVCardText(contact.full_name)}`,
    `EMAIL;TYPE=INTERNET:${escapeVCardText(contact.email)}`,
  ];

  if (contact.phone) lines.push(`TEL:${escapeVCardText(contact.phone)}`);
  if (contact.company) lines.push(`ORG:${escapeVCardText(contact.company)}`);
  if (contact.job_title) lines.push(`TITLE:${escapeVCardText(contact.job_title)}`);

  const address = [
    "", // PO box — unused
    "", // extended — unused
    contact.address ?? "",
    contact.city ?? "",
    contact.state ?? "",
    contact.postal_code ?? "",
    contact.country ?? "",
  ];
  if (address.some((part) => part)) {
    lines.push(`ADR;TYPE=HOME:${address.map(escapeVCardText).join(";")}`);
  }

  if (contact.notes) lines.push(`NOTE:${escapeVCardText(contact.notes)}`);

  if (contact.photo) {
    const comma = contact.photo.indexOf(",");
    const match = /^data:image\/(\w+);base64$/.exec(contact.photo.slice(0, comma));
    if (match && PHOTO_TYPE_FROM_DATA_URL[match[1]]) {
      lines.push(
        `PHOTO;ENCODING=b;TYPE=${PHOTO_TYPE_FROM_DATA_URL[match[1]]}:${contact.photo.slice(comma + 1)}`,
      );
    }
  }

  lines.push(`REV:${contact.updated_at.replace(/[-:]/g, "").replace(/\.\d+/, "")}`);
  lines.push("END:VCARD");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Serialise a whole collection as one .vcf document. */
export function contactsToVcf(contacts: Contact[]): string {
  return contacts.map(contactToVCard).join("");
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

interface Property {
  name: string;
  params: Record<string, string[]>;
  value: string;
}

function parseProperty(line: string): Property | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [rawName, ...rawParams] = head.split(";");
  const name = rawName.toUpperCase();
  const params: Record<string, string[]> = {};
  for (const param of rawParams) {
    const [key, rawValues] = param.split("=");
    const upperKey = key.toUpperCase();
    // Bare params (2.1 style "PHOTO;JPEG;BASE64:") land under their own name.
    const values = (rawValues ?? key).split(",").map((v) => v.toUpperCase());
    params[upperKey] = [...(params[upperKey] ?? []), ...values];
  }
  return { name, params, value };
}

function isBase64Photo(params: Record<string, string[]>): boolean {
  const encoding = (params.ENCODING ?? []).map((v) => v.toUpperCase());
  return (
    encoding.some((v) => v === "B" || v === "BASE64") || "BASE64" in params
  );
}

const KNOWN_IMAGE_TYPES = new Set(["png", "jpeg", "gif", "webp", "tiff", "bmp"]);

/** vCard 3.0 uses TYPE=PNG; 2.1 uses a bare "PHOTO;JPEG;BASE64:" param. */
function photoTypeParam(params: Record<string, string[]>): string | null {
  const typed = (params.TYPE ?? [])[0]?.toLowerCase();
  if (typed) return typed;
  for (const key of Object.keys(params)) {
    if (KNOWN_IMAGE_TYPES.has(key.toLowerCase())) return key.toLowerCase();
  }
  return null;
}

/** Split a .vcf document into one set of content lines per card. */
function splitCards(text: string): string[][] {
  const cards: string[][] = [];
  let current: string[] | null = null;
  for (const line of unfold(text)) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VCARD") {
      current = [];
    } else if (upper === "END:VCARD") {
      if (current) cards.push(current);
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return cards;
}

const EMPTY: ContactInput = {
  first_name: "",
  last_name: "",
  email: "",
  phone: null,
  company: null,
  job_title: null,
  address: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  notes: null,
  photo: null,
};

/** Parse one card's content lines into a ContactInput, or report why not. */
function parseCard(lines: string[]): ParsedVCard {
  const input: ContactInput = { ...EMPTY };
  let photoType: string | null = null;

  for (const line of lines) {
    const prop = parseProperty(line);
    if (!prop) continue;

    switch (prop.name) {
      case "N": {
        const [family = "", given = ""] = prop.value
          .split(";")
          .map(unescapeVCardText);
        input.last_name = family.trim();
        input.first_name = given.trim();
        break;
      }
      case "FN": {
        const display = unescapeVCardText(prop.value).trim();
        if (!input.first_name && !input.last_name && display) {
          const space = display.indexOf(" ");
          if (space < 0) {
            input.first_name = display;
            input.last_name = display;
          } else {
            input.first_name = display.slice(0, space);
            input.last_name = display.slice(space + 1);
          }
        }
        break;
      }
      case "EMAIL":
        if (!input.email) input.email = unescapeVCardText(prop.value).trim();
        break;
      case "TEL":
        if (!input.phone) input.phone = unescapeVCardText(prop.value).trim() || null;
        break;
      case "ORG":
        input.company =
          unescapeVCardText(prop.value).replace(/;$/, "").trim() || null;
        break;
      case "TITLE":
        input.job_title = unescapeVCardText(prop.value).trim() || null;
        break;
      case "ADR": {
        const parts = prop.value.split(";").map(unescapeVCardText);
        input.address = parts[2]?.trim() || null;
        input.city = parts[3]?.trim() || null;
        input.state = parts[4]?.trim() || null;
        input.postal_code = parts[5]?.trim() || null;
        input.country = parts[6]?.trim() || null;
        break;
      }
      case "NOTE":
        input.notes = unescapeVCardText(prop.value).trim() || null;
        break;
      case "PHOTO": {
        if (!isBase64Photo(prop.params)) break;
        const type = photoTypeParam(prop.params);
        const raw = prop.value.replace(/[^A-Za-z0-9+/=]/g, "");
        if (type && raw) {
          input.photo = `data:image/${type};base64,${raw}`;
          photoType = type;
        }
        break;
      }
      default:
        break; // everything else is intentionally ignored
    }
  }

  if (photoType && !["png", "jpeg", "gif", "webp"].includes(photoType)) {
    input.photo = null; // keep the card, drop a photo the app cannot store
  }

  if (!input.first_name && !input.last_name) {
    return { ok: false, reason: "vCard has no N or FN name property" };
  }
  if (!input.first_name) input.first_name = input.last_name;
  if (!input.last_name) input.last_name = input.first_name;
  if (!input.email) {
    return { ok: false, reason: "vCard has no EMAIL property" };
  }
  return { ok: true, input };
}

/**
 * Parse a .vcf document. Returns one result per card, in file order, so the
 * import wizard can show row-by-row status. A file with no cards at all
 * yields a single error entry.
 */
export function parseVcf(text: string): ParsedVCard[] {
  const cards = splitCards(text);
  if (cards.length === 0) {
    return [{ ok: false, reason: "No BEGIN:VCARD blocks found in the file" }];
  }
  return cards.map(parseCard);
}
