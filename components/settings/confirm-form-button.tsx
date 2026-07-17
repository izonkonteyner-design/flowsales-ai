"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ConfirmFormButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage: string;
  children: ReactNode;
};

export function ConfirmFormButton({ confirmMessage, children, className, onClick, ...props }: ConfirmFormButtonProps) {
  return (
    <button
      type="submit"
      className={cn(className)}
      onClick={(event) => {
        if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </button>
  );
}
