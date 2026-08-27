import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportContactsButton from "@/components/contacts/ImportContactsButton";
import { importVcfContactsAction } from "@/app/contacts/vcf-actions";
import type { ImportSummary } from "@/app/contacts/vcf-actions";

jest.mock("@/app/contacts/vcf-actions", () => ({
  importVcfContactsAction: jest.fn(),
  exportAllContactsVcf: jest.fn(async () => ""),
}));

const mockedImport = importVcfContactsAction as jest.MockedFunction<
  typeof importVcfContactsAction
>;

const VCF = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Hopper;Grace;;;",
  "FN:Grace Hopper",
  "EMAIL:grace@example.com",
  "END:VCARD",
  "BEGIN:VCARD",
  "FN:No Email",
  "END:VCARD",
].join("\r\n");

function pickFile() {
  const input = screen.getByLabelText("vCard file");
  const file = new File([VCF], "friends.vcf", { type: "text/vcard" });
  return userEvent.upload(input, file);
}

async function openDialog() {
  render(<ImportContactsButton />);
  await userEvent.click(screen.getByRole("button", { name: /import contacts from a vcard file/i }));
  expect(screen.getByRole("dialog", { name: /import contacts from vcard/i })).toBeInTheDocument();
}

beforeEach(() => {
  mockedImport.mockClear();
});

describe("ImportContactsButton", () => {
  it("previews parsed cards before importing", async () => {
    await openDialog();
    await pickFile();

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText(/2 cards found, 1 ready to import/)).toBeInTheDocument();
    expect(screen.getByText("vCard has no EMAIL property")).toBeInTheDocument();
    expect(mockedImport).not.toHaveBeenCalled();
  });

  it("disables the import button when nothing is importable", async () => {
    await openDialog();
    const input = screen.getByLabelText("vCard file");
    await userEvent.upload(input, new File(["nonsense"], "bad.vcf", { type: "text/vcard" }));

    const button = await screen.findByRole("button", { name: /import contacts$/i });
    expect(button).toBeDisabled();
  });

  it("imports on confirm and shows per-row results", async () => {
    const summary: ImportSummary = {
      rows: [
        { index: 1, name: "Grace Hopper", status: "duplicate", message: "A contact with this email already exists." },
        { index: 2, name: "(unreadable card)", status: "invalid", message: "vCard has no EMAIL property" },
      ],
      imported: 0,
      skipped: 2,
      failed: 0,
    };
    mockedImport.mockResolvedValue(summary);

    await openDialog();
    await pickFile();
    await userEvent.click(await screen.findByRole("button", { name: /import 1 contact/i }));

    await waitFor(() => expect(mockedImport).toHaveBeenCalledTimes(1));
    const cards = mockedImport.mock.calls[0][0];
    expect(cards).toHaveLength(2);
    expect(cards[0].index).toBe(1);

    expect(await screen.findByText(/0 imported · 2 skipped · 0 failed/)).toBeInTheDocument();
    expect(screen.getByText(/Skipped — duplicate email/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid — vCard has no EMAIL property/)).toBeInTheDocument();
  });

  it("closes without importing on cancel", async () => {
    await openDialog();
    await pickFile();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedImport).not.toHaveBeenCalled();
  });
});
