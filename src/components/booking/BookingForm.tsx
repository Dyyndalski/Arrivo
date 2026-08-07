import React, { useState } from "react";
import { CalendarCheck, Clock, Home, Phone, Send, User } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
// From ./limits, never a schema module — those pull zod into the client bundle.
import {
  BOOKING_MAX_AHEAD_DAYS,
  BOOKING_MIN_LEAD_HOURS,
  NAME_MAX,
  NOTE_MAX,
  PHONE_MAX,
  PHONE_MIN,
  POSTAL_CODE_PATTERN,
  STREET_MAX,
  STREET_MIN,
} from "@/lib/schemas/limits";
import type { BookingFormStrings } from "@/components/booking/strings";

interface Props {
  specialistId: string;
  serviceId: string;
  /** Prefilled from the client's saved profile; editable, because a visit may be elsewhere. */
  initial: {
    firstName: string;
    lastName: string;
    phone: string;
    street: string;
    postalCode: string;
  };
  /** Already translated by the page — this island never sees a catalog key. */
  serverError?: string | null;
  strings: BookingFormStrings;
}

export default function BookingForm({ specialistId, serviceId, initial, serverError, strings }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phone);
  const [street, setStreet] = useState(initial.street);
  const [postalCode, setPostalCode] = useState(initial.postalCode);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // Advisory only. The endpoint re-validates through src/lib/schemas/booking.ts, which composes
  // the instant in Europe/Warsaw — this check uses the browser's zone and is therefore
  // approximate at the boundary. That is fine for a hint and would not be fine for the decision,
  // which is why the decision is not made here.
  function validate() {
    const next: Record<string, string | undefined> = {};

    if (!date || !time) {
      next.when = strings.errorTimeRequired;
    } else {
      const proposed = new Date(`${date}T${time}`);
      if (Number.isNaN(proposed.getTime())) {
        next.when = strings.errorTimeRequired;
      } else if (proposed.getTime() < Date.now() + BOOKING_MIN_LEAD_HOURS * 3600_000) {
        next.when = strings.errorTooSoon;
      } else if (proposed.getTime() > Date.now() + BOOKING_MAX_AHEAD_DAYS * 86_400_000) {
        next.when = strings.errorTooFar;
      }
    }

    if (firstName.trim().length > NAME_MAX) next.firstName = strings.errorNameLength;
    if (lastName.trim().length > NAME_MAX) next.lastName = strings.errorNameLength;

    const p = phone.trim();
    if (p && (p.length < PHONE_MIN || p.length > PHONE_MAX)) next.phone = strings.errorPhoneLength;

    const s = street.trim();
    if (!s) next.street = strings.errorStreetRequired;
    else if (s.length < STREET_MIN || s.length > STREET_MAX) next.street = strings.errorStreetLength;

    const pc = postalCode.trim();
    if (pc && !POSTAL_CODE_PATTERN.test(pc)) next.postalCode = strings.errorPostalCodeFormat;

    if (note.trim().length > NOTE_MAX) next.note = strings.errorNoteTooLong;

    setErrors(next);
    return Object.values(next).every((v) => v === undefined);
  }

  function clear(field: string) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const inputBase =
    "w-full rounded-sm border bg-card px-3.5 py-2.5 text-sm text-foreground transition-colors focus:ring-[3px] focus:outline-none";

  return (
    <form method="POST" action="/api/bookings" className="space-y-5" onSubmit={handleSubmit} noValidate>
      {/* Both ids travel in the body so the endpoint reads them the same way. */}
      <input type="hidden" name="specialist_id" value={specialistId} />
      <input type="hidden" name="service_id" value={serviceId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className="text-foreground mb-1.5 block text-sm font-semibold">
            {strings.date}
          </label>
          <div className="relative">
            <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
              <CalendarCheck className="size-4" />
            </span>
            <input
              id="date"
              name="date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clear("when");
              }}
              className={`${inputBase} pl-10 ${errors.when ? "border-danger focus:ring-danger/30" : "border-border-strong focus:ring-ring/40"}`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="time" className="text-foreground mb-1.5 block text-sm font-semibold">
            {strings.time}
          </label>
          <div className="relative">
            <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
              <Clock className="size-4" />
            </span>
            <input
              id="time"
              name="time"
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                clear("when");
              }}
              className={`${inputBase} pl-10 ${errors.when ? "border-danger focus:ring-danger/30" : "border-border-strong focus:ring-ring/40"}`}
            />
          </div>
        </div>
      </div>

      {errors.when ? <p className="text-danger -mt-3 text-xs">{errors.when}</p> : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <FormField
          id="street"
          label={strings.street}
          value={street}
          onChange={(v) => {
            setStreet(v);
            clear("street");
          }}
          placeholder={strings.streetPlaceholder}
          error={errors.street}
          icon={<Home className="size-4" />}
        />
        <FormField
          id="postal_code"
          label={strings.postalCode}
          value={postalCode}
          onChange={(v) => {
            setPostalCode(v);
            clear("postalCode");
          }}
          placeholder={strings.postalCodePlaceholder}
          error={errors.postalCode}
          icon={<Home className="size-4" />}
        />
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">🔒 {strings.privacyNote}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="first_name"
          label={strings.firstName}
          value={firstName}
          onChange={(v) => {
            setFirstName(v);
            clear("firstName");
          }}
          error={errors.firstName}
          icon={<User className="size-4" />}
        />
        <FormField
          id="last_name"
          label={strings.lastName}
          value={lastName}
          onChange={(v) => {
            setLastName(v);
            clear("lastName");
          }}
          error={errors.lastName}
          icon={<User className="size-4" />}
        />
      </div>

      <FormField
        id="phone"
        label={strings.phone}
        value={phone}
        onChange={(v) => {
          setPhone(v);
          clear("phone");
        }}
        placeholder={strings.phonePlaceholder}
        error={errors.phone}
        icon={<Phone className="size-4" />}
      />

      <div>
        <label htmlFor="note" className="text-foreground mb-1.5 block text-sm font-semibold">
          {strings.note} <span className="text-muted-foreground text-xs font-normal">{strings.noteOptional}</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            clear("note");
          }}
          placeholder={strings.notePlaceholder}
          className="border-border-strong bg-card text-foreground placeholder:text-muted-foreground focus:ring-ring/40 w-full resize-y rounded-sm border px-3.5 py-2.5 text-sm transition-colors focus:ring-[3px] focus:outline-none"
        />
        {errors.note ? <p className="text-danger mt-1.5 text-xs">{errors.note}</p> : null}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText={strings.pending} icon={<Send className="size-4" />}>
        {strings.submit}
      </SubmitButton>
    </form>
  );
}
