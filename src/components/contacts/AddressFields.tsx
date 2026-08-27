"use client";

import { useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  ADDRESS_FIELDS,
  MAX_ADDRESSES,
  type AddressFieldName,
} from "@/lib/contacts/schema";
import { ADDRESS_TYPES, type AddressInput } from "@/lib/contacts/types";

const CONTROL =
  "w-full rounded-md border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:bg-input";

let nextKey = 0;

function toBlock(address: AddressInput, sourceIndex: number) {
  return {
    key: ++nextKey,
    sourceIndex,
    type: address.type,
    street: address.street ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postal_code: address.postal_code ?? "",
    country: address.country ?? "",
  };
}

function emptyBlock() {
  return toBlock(
    { type: "home", street: "", city: "", state: "", postal_code: "", country: "" },
    -1,
  );
}

/**
 * Editable list of postal addresses. Each block submits its fields under
 * indexed names (`addresses.0.city`) so the server action can rebuild the
 * array, and PUT's full replacement keeps the edit form from losing addresses.
 */
export default function AddressFields({
  defaultAddresses,
  fieldErrors,
}: {
  defaultAddresses: AddressInput[];
  fieldErrors?: Record<string, string>;
}) {
  const [blocks, setBlocks] = useState(() =>
    defaultAddresses.map((address, index) => toBlock(address, index)),
  );

  // fieldErrors arrives keyed by the indices at submit time; map each block's
  // original index to its current position so removals shift errors correctly.
  function errorFor(block: (typeof blocks)[number], field: string): string | undefined {
    if (block.sourceIndex < 0) return undefined;
    return fieldErrors?.[`addresses.${block.sourceIndex}.${field}`];
  }

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Addresses</legend>

      <div className="border-b border-hairline pb-2">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Addresses
        </h2>
        <p className="text-[13px] text-muted-foreground">
          As many as you need, each tagged Home, Work, or Other.
        </p>
      </div>

      {fieldErrors?.addresses ? (
        <p role="alert" className="text-[13px] text-destructive">
          {fieldErrors.addresses}
        </p>
      ) : null}

      <div className="space-y-4">
        {blocks.map((block, index) => (
          <div
            key={block.key}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <MapPin
                  className="h-3.5 w-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="sr-only">Address type</span>
                <select
                  name={`addresses.${index}.type`}
                  defaultValue={block.type}
                  aria-label={`Address ${index + 1} type`}
                  aria-invalid={errorFor(block, "type") ? true : undefined}
                  className={`${CONTROL} w-auto py-1 pr-8 ${
                    errorFor(block, "type")
                      ? "border-destructive"
                      : "border-border"
                  }`}
                >
                  {ADDRESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type[0].toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove address ${index + 1}`}
                onClick={() =>
                  setBlocks((current) => current.filter((b) => b.key !== block.key))
                }
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Remove
              </Button>
            </div>

            {errorFor(block, "type") ? (
              <p role="alert" className="mb-3 text-[13px] text-destructive">
                {errorFor(block, "type")}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {ADDRESS_FIELDS.map((field) => {
                const name = `addresses.${index}.${field.name}`;
                const error = errorFor(block, field.name);
                return (
                  <div
                    key={field.name}
                    className={field.name === "street" ? "sm:col-span-2" : undefined}
                  >
                    <label
                      htmlFor={name}
                      className="mb-1.5 block text-[13px] font-medium text-foreground"
                    >
                      {field.label}
                    </label>
                    <input
                      id={name}
                      name={name}
                      type="text"
                      defaultValue={block[field.name as AddressFieldName]}
                      placeholder={field.placeholder}
                      aria-invalid={error ? true : undefined}
                      className={`${CONTROL} ${
                        error
                          ? "border-destructive focus:border-destructive"
                          : "border-border focus:border-primary"
                      }`}
                    />
                    {error ? (
                      <p role="alert" className="mt-1.5 text-[13px] text-destructive">
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {blocks.length < MAX_ADDRESSES ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setBlocks((current) => [...current, emptyBlock()])}
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Add address
        </Button>
      ) : null}
    </fieldset>
  );
}
