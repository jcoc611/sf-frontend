import React from "react";
import { render, screen } from "@testing-library/react";
import ContactAvatar from "@/components/contacts/ContactAvatar";
import { makeContact } from "../mocks/handlers";

describe("ContactAvatar", () => {
  it("renders initials when the contact has no photo", () => {
    render(<ContactAvatar contact={makeContact()} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the photo as a circular image when present", () => {
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    render(<ContactAvatar contact={makeContact({ photo })} />);

    const img = screen.getByRole("img", { name: "Ada Lovelace" });
    expect(img).toHaveAttribute("src", photo);
    expect(img.className).toContain("rounded-full");
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
  });
});
