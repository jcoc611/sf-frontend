import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactForm from "@/components/contacts/ContactForm";
import { makeContact } from "../mocks/handlers";
import type { FormState } from "@/lib/contacts/types";

function renderForm(action: jest.Mock, contact?: ReturnType<typeof makeContact>) {
  return render(
    <ContactForm
      action={action as never}
      contact={contact}
      submitLabel="Create contact"
      cancelHref="/contacts"
    />,
  );
}

describe("ContactForm", () => {
  it("renders every editable field", () => {
    renderForm(jest.fn());

    expect(screen.getByLabelText(/first name/i)).toBeRequired();
    expect(screen.getByLabelText(/last name/i)).toBeRequired();
    expect(screen.getByLabelText(/^email/i)).toBeRequired();
    expect(screen.getByLabelText(/phone/i)).not.toBeRequired();
    expect(screen.getByLabelText(/notes/i).tagName).toBe("TEXTAREA");
  });

  it("prefills from an existing contact", () => {
    renderForm(jest.fn(), makeContact());

    expect(screen.getByLabelText(/first name/i)).toHaveValue("Ada");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("ada@example.com");
    // Nulls become empty inputs rather than the string "null".
    expect(screen.getByLabelText(/notes/i)).toHaveValue("");
    // Existing addresses render as editable blocks.
    expect(screen.getByLabelText(/address 1 type/i)).toHaveValue("home");
    expect(screen.getByLabelText(/city/i)).toHaveValue("San Francisco");
  });

  it("adds and removes address blocks", async () => {
    renderForm(jest.fn(), makeContact({ addresses: [] }));

    expect(screen.queryByLabelText(/address 1 type/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /add address/i }));
    await userEvent.click(screen.getByRole("button", { name: /add address/i }));

    expect(screen.getByLabelText(/address 1 type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address 2 type/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /remove address 1/i }));

    expect(screen.queryByLabelText(/address 2 type/i)).not.toBeInTheDocument();
  });

  it("submits addresses under indexed field names", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action, makeContact());

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1];
    expect(formData.get("addresses.0.type")).toBe("home");
    expect(formData.get("addresses.0.city")).toBe("San Francisco");
  });

  it("keeps an address error on its block after an earlier block is removed", async () => {
    const contact = makeContact({
      addresses: [
        { id: 1, type: "home", street: null, city: "Berkeley", state: null, postal_code: null, country: null },
        { id: 2, type: "work", street: null, city: "Oakland", state: null, postal_code: null, country: null },
      ],
    });
    const action = jest.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "Please fix the highlighted fields.",
        fieldErrors: { "addresses.1.city": "City is wrong" },
        values: { addresses: contact.addresses },
      }),
    );
    renderForm(action, contact);

    // Trigger the error state, then drop the first block.
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));
    await screen.findByText("City is wrong");
    await userEvent.click(screen.getByRole("button", { name: /remove address 1/i }));

    // The surviving Oakland block keeps its error even though it is now index 0.
    expect(screen.getByText("City is wrong")).toBeInTheDocument();
  });

  it("submits the entered values to the action", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action);

    await userEvent.type(screen.getByLabelText(/first name/i), "Grace");
    await userEvent.type(screen.getByLabelText(/last name/i), "Hopper");
    await userEvent.type(screen.getByLabelText(/^email/i), "grace@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1];
    expect(formData.get("first_name")).toBe("Grace");
    expect(formData.get("email")).toBe("grace@example.com");
  });

  it("shows the summary and the per-field errors the action returns", async () => {
    const action = jest.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "That email address is already taken.",
        fieldErrors: { email: "This email is already in use." },
        values: { first_name: "Grace" },
      }),
    );
    renderForm(action);

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((node) => node.textContent)).toEqual(
      expect.arrayContaining([
        "That email address is already taken.",
        "This email is already in use.",
      ]),
    );
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("links back out without submitting", () => {
    renderForm(jest.fn());
    expect(screen.getByRole("link", { name: /cancel/i })).toHaveAttribute(
      "href",
      "/contacts",
    );
  });
});
