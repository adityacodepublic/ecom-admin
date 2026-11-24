import React from "react";
import { CalendarIcon } from "lucide-react";
import { useController } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AutoFormFieldProps } from "@autoform/react";

const nativeDateInputStyles = `
  /* Removes native date input indicators rendered by the platform. */
  input[data-autoform-date] {
    -webkit-appearance: none;
    appearance: none;
    background-image: none;
  }

  /* Hides WebKit-specific native date controls. */
  input[data-autoform-date]::-webkit-calendar-picker-indicator,
  input[data-autoform-date]::-webkit-inner-spin-button,
  input[data-autoform-date]::-webkit-clear-button {
    display: none !important;
    -webkit-appearance: none !important;
    width: 0 !important;
    margin: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Hides the custom picker on touch-primary devices. */
  @media (pointer: coarse) and (hover: none) {
    input[data-autoform-date] {
      padding-right: 0.75rem;
    }

    button[data-autoform-date-picker] {
      display: none;
    }
  }
`;

function formatDate(date: Date | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("en-CA");
}

function isValidDate(date: Date | undefined) {
  return !!date && !isNaN(date.getTime());
}

function toDate(value: unknown) {
  if (value instanceof Date) return isValidDate(value) ? value : undefined;
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return isValidDate(date) ? date : undefined;
  }
  return undefined;
}

export const DateField: React.FC<AutoFormFieldProps> = ({
  inputProps,
  error,
  id,
}) => {
  const { field } = useController({ name: id });
  const { value, onChange, ref, ...restField } = field;
  const selectedDate = toDate(value);
  const selectedTime = selectedDate?.getTime();
  const [open, setOpen] = React.useState(false);
  const [monthOverride, setMonthOverride] = React.useState<{ forTime: number | undefined; month: Date | undefined } | null>(null);
  const [draftInput, setDraftInput] = React.useState<{ forValue: unknown; text: string } | null>(null);

  const month = monthOverride && monthOverride.forTime === selectedTime ? monthOverride.month : selectedDate;
  const inputValue = draftInput && draftInput.forValue === value ? draftInput.text : formatDate(selectedDate);

  return (
    <>
      <style>{nativeDateInputStyles}</style>
      <div className="relative">
        <Input
          id={id}
          {...inputProps}
          {...restField}
          ref={ref}
          type="date"
          data-autoform-date
          className={`${error ? "border-destructive " : ""} pr-10 appearance-none ${
            inputProps?.className ?? ""
          }`}
          value={inputValue}
          placeholder={inputProps?.placeholder ?? "Select date"}
          onBlur={(e) => {
            restField.onBlur();
            inputProps?.onBlur?.(e);
          }}
          onChange={(e) => {
            const nextValue = e.target.value;
            const nextDate = new Date(nextValue);

            if (isValidDate(nextDate)) {
              onChange(formatDate(nextDate));
              setDraftInput(null);
              setMonthOverride({ forTime: nextDate.getTime(), month: nextDate });
            } else if (!nextValue) {
              onChange("");
              setDraftInput(null);
            } else {
              setDraftInput({ forValue: value, text: nextValue });
            }
          }}
          onKeyDown={(e) => {
            inputProps?.onKeyDown?.(e);

            if (e.defaultPrevented) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={`${id}-date-picker`}
              data-autoform-date-picker
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1/2 size-8 text-muted-foreground"
              style={{ right: "0.25rem", transform: "translateY(-50%)" }}
              aria-label="Select date"
            >
              <CalendarIcon className="size-4" />
              <span className="sr-only">Select date</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={selectedDate}
              month={month}
              onMonthChange={(nextMonth) => setMonthOverride({ forTime: selectedTime, month: nextMonth })}
              onSelect={(date) => {
                onChange(formatDate(date));
                setDraftInput(null);
                setMonthOverride(null);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
};
