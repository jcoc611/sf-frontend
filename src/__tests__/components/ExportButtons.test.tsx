import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportAllButton, ExportContactButton } from "@/components/contacts/ExportButtons";
import { exportAllContactsVcf } from "@/app/contacts/vcf-actions";
import { makeContact } from "@/__tests__/mocks/handlers";

jest.mock("@/app/contacts/vcf-actions", () => ({
  exportAllContactsVcf: jest.fn(),
  importVcfContactsAction: jest.fn(),
}));

const mockedExport = exportAllContactsVcf as jest.MockedFunction<
  typeof exportAllContactsVcf
>;

/** Capture the blob download instead of navigating. */
function mockDownload() {
  const clicks: { filename: string; content: string }[] = [];
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = jest.fn((blob: Blob) => {
    void blob.text().then((text) => {
      const anchor = lastAnchor;
      if (anchor) clicks.push({ filename: anchor.download, content: text });
    });
    return "blob:mock";
  });
  URL.revokeObjectURL = jest.fn();

  let lastAnchor: HTMLAnchorElement | null = null;
  const realCreateElement = document.createElement.bind(document);
  const createSpy = jest
    .spyOn(document, "createElement")
    .mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = realCreateElement(tag, options);
      if (tag === "a") {
        lastAnchor = el as HTMLAnchorElement;
        (el as HTMLAnchorElement).click = jest.fn();
      }
      return el;
    });

  return {
    clicks,
    async lastDownload(): Promise<{ filename: string; content: string }> {
      await waitFor(() => expect(clicks.length).toBeGreaterThan(0));
      return clicks[clicks.length - 1];
    },
    restore() {
      URL.createObjectURL = realCreate;
      createSpy.mockRestore();
    },
  };
}

beforeEach(() => {
  mockedExport.mockClear();
});

describe("ExportAllButton", () => {
  it("downloads contacts.vcf from the server action payload", async () => {
    mockedExport.mockResolvedValue("BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n");
    const download = mockDownload();
    try {
      render(<ExportAllButton />);
      await userEvent.click(screen.getByRole("button", { name: /export all contacts/i }));

      await waitFor(() => expect(mockedExport).toHaveBeenCalledTimes(1));
      const file = await download.lastDownload();
      expect(file.filename).toBe("contacts.vcf");
      expect(file.content).toContain("BEGIN:VCARD");
    } finally {
      download.restore();
    }
  });

  it("shows an error when the action fails", async () => {
    mockedExport.mockRejectedValue(new Error("down"));
    render(<ExportAllButton />);
    await userEvent.click(screen.getByRole("button", { name: /export all contacts/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/export failed/i);
  });
});

describe("ExportContactButton", () => {
  it("serialises the contact in-browser and downloads a named file", async () => {
    const download = mockDownload();
    try {
      render(<ExportContactButton contact={makeContact()} />);
      await userEvent.click(screen.getByRole("button", { name: /export ada lovelace/i }));

      const file = await download.lastDownload();
      expect(file.filename).toBe("ada-lovelace.vcf");
      expect(file.content).toContain("FN:Ada Lovelace");
      expect(file.content).toContain("EMAIL;TYPE=INTERNET:ada@example.com");
    } finally {
      download.restore();
    }
  });
});
