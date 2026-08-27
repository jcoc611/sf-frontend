"use client";

import { useRef, useState } from "react";
import { User } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_DATA_URL_LENGTH,
} from "@/lib/contacts/schema";

/**
 * Photo picker for the contact form. The selected file is read as a base64
 * data URL and carried in a hidden input, so the server action receives it
 * like any other field.
 */
export default function PhotoField({
  defaultPhoto,
  error,
}: {
  defaultPhoto: string;
  error?: string;
}) {
  const [photo, setPhoto] = useState(defaultPhoto || null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const readId = useRef(0);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setMessage("Photo must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }
    setMessage(null);
    const currentReadId = ++readId.current;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (currentReadId !== readId.current) return;
      if (typeof result !== "string" || result.length > MAX_PHOTO_DATA_URL_LENGTH) {
        setPhoto(null);
        setMessage("Photo must be 2 MB or smaller.");
        event.target.value = "";
        return;
      }
      setPhoto(result);
    };
    reader.readAsDataURL(file);
  }

  const shown = message ?? error ?? null;

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-foreground">
        Photo
        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
          optional
        </span>
      </span>

      <div className="flex items-center gap-3">
        {photo ? (
          // next/image cannot optimise a data URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt="Selected contact photo"
            className="aspect-square h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <User className="h-7 w-7" strokeWidth={1.5} />
          </span>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInput.current?.click()}
          >
            {photo ? "Change photo" : "Upload photo"}
          </Button>
          {photo ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                ++readId.current;
                setPhoto(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <input type="hidden" name="photo" value={photo ?? ""} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a photo"
        onChange={onFileChange}
      />

      {shown ? (
        <p role="alert" className="mt-1.5 text-[13px] text-destructive">
          {shown}
        </p>
      ) : null}
    </div>
  );
}
