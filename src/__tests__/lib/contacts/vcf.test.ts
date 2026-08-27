import {
  contactToVCard,
  contactsToVcf,
  escapeVCardText,
  parseVcf,
  unescapeVCardText,
} from "@/lib/contacts/vcf";
import { makeContact } from "@/__tests__/mocks/handlers";
import type { Contact } from "@/lib/contacts/types";

/** Tiny valid PNG (1x1) as base64, for photo round-trip tests. */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("escapeVCardText / unescapeVCardText", () => {
  it("round-trips reserved characters", () => {
    const original = "a;b,c\\d\ne";
    expect(unescapeVCardText(escapeVCardText(original))).toBe(original);
  });

  it("unescapes \\n as newline and \\N too", () => {
    expect(unescapeVCardText("line1\\nline2\\Nline3")).toBe("line1\nline2\nline3");
  });

  it("leaves unknown escapes readable", () => {
    expect(unescapeVCardText("100\\% sure")).toBe("100% sure");
  });
});

describe("contactToVCard", () => {
  it("emits the core properties", () => {
    const vcard = contactToVCard(makeContact());
    expect(vcard).toContain("BEGIN:VCARD");
    expect(vcard).toContain("VERSION:3.0");
    expect(vcard).toContain("N:Lovelace;Ada;;;");
    expect(vcard).toContain("FN:Ada Lovelace");
    expect(vcard).toContain("EMAIL;TYPE=INTERNET:ada@example.com");
    expect(vcard).toContain("TEL:+1-415-555-0101");
    expect(vcard).toContain("ORG:Analytical Engines");
    expect(vcard).toContain("TITLE:Mathematician");
    expect(vcard).toContain("ADR;TYPE=HOME:;;");
    expect(vcard).toContain("END:VCARD");
  });

  it("escapes reserved characters in values", () => {
    const vcard = contactToVCard(
      makeContact({ company: "A; B, Inc", notes: "line one\nline two" }),
    );
    expect(vcard).toContain("ORG:A\\; B\\, Inc");
    expect(vcard).toContain("NOTE:line one\\nline two");
  });

  it("omits empty optional fields", () => {
    const contact = makeContact({ phone: null, company: null, notes: null, photo: null });
    const vcard = contactToVCard(contact);
    expect(vcard).not.toContain("TEL:");
    expect(vcard).not.toContain("ORG:");
    expect(vcard).not.toContain("NOTE:");
    expect(vcard).not.toContain("PHOTO");
  });

  it("encodes a base64 photo", () => {
    const vcard = contactToVCard(
      makeContact({ photo: `data:image/png;base64,${PNG_B64}` }),
    );
    // The photo line folds past 75 chars, so compare against the unfolded form.
    const unfolded = vcard.replace(/\r\n /g, "");
    expect(unfolded).toContain(`PHOTO;ENCODING=b;TYPE=PNG:${PNG_B64}`);
  });

  it("folds long lines with a leading-space continuation", () => {
    const vcard = contactToVCard(makeContact({ notes: "x".repeat(200) }));
    const lines = vcard.split("\r\n");
    const noteStart = lines.findIndex((l) => l.startsWith("NOTE:"));
    expect(noteStart).toBeGreaterThan(-1);
    expect(lines[noteStart].length).toBeLessThanOrEqual(75);
    expect(lines[noteStart + 1].startsWith(" ")).toBe(true);
  });
});

describe("contactsToVcf", () => {
  it("concatenates one card per contact", () => {
    const vcf = contactsToVcf([
      makeContact(),
      makeContact({ id: 2, first_name: "Grace", last_name: "Hopper", full_name: "Grace Hopper" }),
    ]);
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(vcf.match(/END:VCARD/g)).toHaveLength(2);
  });
});

describe("parseVcf", () => {
  it("round-trips an exported contact", () => {
    const contact: Contact = makeContact({
      notes: "semi;colon, comma\nnewline",
      photo: `data:image/png;base64,${PNG_B64}`,
    });
    const [parsed] = parseVcf(contactToVCard(contact));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.first_name).toBe(contact.first_name);
    expect(parsed.input.last_name).toBe(contact.last_name);
    expect(parsed.input.email).toBe(contact.email);
    expect(parsed.input.phone).toBe(contact.phone);
    expect(parsed.input.company).toBe(contact.company);
    expect(parsed.input.job_title).toBe(contact.job_title);
    expect(parsed.input.city).toBe(contact.city);
    expect(parsed.input.notes).toBe(contact.notes);
    expect(parsed.input.photo).toBe(contact.photo);
  });

  it("parses multiple cards and keeps per-card status", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Hopper;Grace;;;",
      "FN:Grace Hopper",
      "EMAIL:grace@example.com",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:No Email",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Turing;Alan;;;",
      "EMAIL:alan@example.com",
      "END:VCARD",
    ].join("\r\n");

    const results = parseVcf(vcf);
    expect(results).toHaveLength(3);
    expect(results[0].ok).toBe(true);
    expect(results[1]).toEqual({ ok: false, reason: "vCard has no EMAIL property" });
    expect(results[2].ok).toBe(true);
  });

  it("derives a name from FN when N is missing", () => {
    const vcf = ["BEGIN:VCARD", "FN:Ada Lovelace", "EMAIL:ada@x.io", "END:VCARD"].join("\r\n");
    const [parsed] = parseVcf(vcf);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.first_name).toBe("Ada");
      expect(parsed.input.last_name).toBe("Lovelace");
    }
  });

  it("fails a card with no name at all", () => {
    const vcf = ["BEGIN:VCARD", "EMAIL:ada@x.io", "END:VCARD"].join("\r\n");
    const [parsed] = parseVcf(vcf);
    expect(parsed).toEqual({ ok: false, reason: "vCard has no N or FN name property" });
  });

  it("reports a file with no cards", () => {
    expect(parseVcf("hello world")).toEqual([
      { ok: false, reason: "No BEGIN:VCARD blocks found in the file" },
    ]);
  });

  it("unfolds continuation lines before parsing", () => {
    const vcf = [
      "BEGIN:VCARD",
      "N:Lovelace;Ada;;;",
      "EMAIL:ada@example.com",
      "NOTE:first part ",
      " second part",
      "END:VCARD",
    ].join("\r\n");
    const [parsed] = parseVcf(vcf);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input.notes).toBe("first part second part");
  });

  it("accepts 2.1-style quoted-printable soft breaks", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N:Hopper;Grace;;;",
      "EMAIL:grace@example.com",
      "NOTE;QUOTED-PRINTABLE:line one=",
      "line two",
      "END:VCARD",
    ].join("\r\n");
    // '=' at end of line is not a space/tab continuation, so both lines are
    // read; the second line is ignored as an unknown property-less line.
    const [parsed] = parseVcf(vcf);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input.email).toBe("grace@example.com");
  });

  it("parses a 2.1-style BASE64 photo with bare TYPE param", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N:Hopper;Grace;;;",
      "EMAIL:grace@example.com",
      `PHOTO;JPEG;BASE64:${PNG_B64}`,
      "END:VCARD",
    ].join("\r\n");
    const [parsed] = parseVcf(vcf);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input.photo).toBe(`data:image/jpeg;base64,${PNG_B64}`);
  });

  it("drops an unsupported photo type but keeps the card", () => {
    const vcf = [
      "BEGIN:VCARD",
      "N:Hopper;Grace;;;",
      "EMAIL:grace@example.com",
      `PHOTO;ENCODING=b;TYPE=TIFF:${PNG_B64}`,
      "END:VCARD",
    ].join("\r\n");
    const [parsed] = parseVcf(vcf);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input.photo).toBeNull();
  });
});
