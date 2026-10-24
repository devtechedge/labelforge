"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
  name,
  value,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
    >
      {pending ? (pendingLabel ?? "Working...") : children}
    </button>
  );
}
