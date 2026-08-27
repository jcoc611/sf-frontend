import {
  CONTACT_FIELDS,
  contactInputSchema,
  formDataToValues,
  zodFieldErrors,
} from "@/lib/contacts/schema";

function values(overrides: Record<string, unknown> = {}) {
  return {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "Ada@Example.com",
    phone: "",
    company: "",
    job_title: "",
    addresses: [],
    notes: "",
    photo: "",
    ...overrides,
  };
}

const HOME = { type: "home", city: "San Francisco", state: "CA", postal_code: "", country: "USA" };
const WORK = { type: "work", street: "1 Market St", city: "San Francisco", state: "CA", postal_code: "94105", country: "USA" };

describe("contactInputSchema", () => {
  it("lowercases the email and nulls out the blanks", () => {
    const parsed = contactInputSchema.parse(values());

    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.phone).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("trims what the user typed", () => {
    expect(contactInputSchema.parse(values({ company: "  Acme  " })).company).toBe(
      "Acme",
    );
  });

  it("requires the three fields the API requires", () => {
    const result = contactInputSchema.safeParse(
      values({ first_name: " ", last_name: "", email: "" }),
    );

    expect(result.success).toBe(false);
    expect(zodFieldErrors(result.error!)).toEqual({
      first_name: "First name is required",
      last_name: "Last name is required",
      email: "Email is required",
    });
  });

  it("rejects a malformed email", () => {
    const result = contactInputSchema.safeParse(values({ email: "not-an-email" }));
    expect(zodFieldErrors(result.error!).email).toBe("Enter a valid email address");
  });

  it("accepts a base64 image data URL as the photo", () => {
    const parsed = contactInputSchema.parse(
      values({ photo: "data:image/png;base64,iVBORw0KGgo=" }),
    );
    expect(parsed.photo).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("rejects a photo that is not an image data URL", () => {
    const result = contactInputSchema.safeParse(values({ photo: "https://x.test/a.png" }));
    expect(zodFieldErrors(result.error!).photo).toBe(
      "Photo must be a PNG, JPEG, GIF, or WebP image",
    );
  });

  it("rejects svg photos", () => {
    const result = contactInputSchema.safeParse(
      values({ photo: "data:image/svg+xml;base64,PHN2Zz4=" }),
    );
    expect(zodFieldErrors(result.error!).photo).toBe(
      "Photo must be a PNG, JPEG, GIF, or WebP image",
    );
  });

  it("enforces the photo size limit", () => {
    const result = contactInputSchema.safeParse(
      values({ photo: `data:image/png;base64,${"A".repeat(2_800_001)}` }),
    );
    expect(zodFieldErrors(result.error!).photo).toBe("Photo must be under 2 MB");
  });

  it("enforces the API's length limits", () => {
    const result = contactInputSchema.safeParse(
      values({ first_name: "a".repeat(101) }),
    );

    expect(zodFieldErrors(result.error!)).toEqual({
      first_name: "First name must be 100 characters or fewer",
    });
  });

  it("parses multiple addresses and nulls their blanks", () => {
    const parsed = contactInputSchema.parse(values({ addresses: [HOME, WORK] }));

    expect(parsed.addresses).toHaveLength(2);
    expect(parsed.addresses[0]).toMatchObject({
      type: "home",
      city: "San Francisco",
      postal_code: null,
    });
    expect(parsed.addresses[1].street).toBe("1 Market St");
  });

  it("rejects an address with an unknown type", () => {
    const result = contactInputSchema.safeParse(
      values({ addresses: [{ ...HOME, type: "vacation" }] }),
    );

    expect(zodFieldErrors(result.error!)["addresses.0.type"]).toBeDefined();
  });

  it("rejects an address with every field blank", () => {
    const result = contactInputSchema.safeParse(
      values({ addresses: [{ type: "home", street: "", city: "", state: "", postal_code: "", country: "" }] }),
    );

    expect(zodFieldErrors(result.error!)["addresses.0.type"]).toBe(
      "Fill in at least one address field, or remove the address",
    );
  });

  it("caps the number of addresses", () => {
    const result = contactInputSchema.safeParse(
      values({ addresses: Array(11).fill(HOME) }),
    );

    expect(zodFieldErrors(result.error!).addresses).toBe("At most 10 addresses");
  });
});

describe("formDataToValues", () => {
  it("pulls every known field out, defaulting to an empty string", () => {
    const formData = new FormData();
    formData.set("first_name", "Grace");
    formData.set("email", "grace@example.com");
    formData.set("ignored", "nope");

    const extracted = formDataToValues(formData);

    expect(extracted.first_name).toBe("Grace");
    expect(extracted.last_name).toBe("");
    expect(extracted.photo).toBe("");
    expect(extracted.addresses).toEqual([]);
    expect(Object.keys(extracted).sort()).toEqual(
      [...CONTACT_FIELDS.map((field) => field.name), "photo", "addresses"].sort(),
    );
  });

  it("collects indexed address inputs into an array", () => {
    const formData = new FormData();
    formData.set("first_name", "Ada");
    formData.set("last_name", "Lovelace");
    formData.set("email", "ada@example.com");
    formData.set("addresses.0.type", "home");
    formData.set("addresses.0.city", "San Francisco");
    formData.set("addresses.0.country", "USA");
    formData.set("addresses.1.type", "work");
    formData.set("addresses.1.street", "1 Market St");

    const extracted = formDataToValues(formData);

    expect(extracted.addresses).toEqual([
      { type: "home", city: "San Francisco", country: "USA" },
      { type: "work", street: "1 Market St" },
    ]);

    const parsed = contactInputSchema.parse(extracted);
    expect(parsed.addresses).toHaveLength(2);
    expect(parsed.addresses[0]).toMatchObject({ type: "home", city: "San Francisco" });
  });
});
