"use client";

import { forwardRef } from "react";
import { toast } from "react-hot-toast";

/**
 * A "Call" link. On a phone (a touch screen) it dials; on a computer, where tel: usually opens nothing, it copies the
 * number and says so. Decided at the click, not at render.
 */
export const CallLink = forwardRef<HTMLAnchorElement, { phone: string; className?: string; children: React.ReactNode }>(
  ({ phone, className, children, ...rest }, ref) => {
    const number = phone.trim();
    const onClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (window.matchMedia("(pointer: coarse)").matches) return; // a phone: let tel: dial
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(number);
        toast.success(`Number copied: ${number}`);
      } catch {
        toast(`Call ${number}`);
      }
    };
    return (
      <a ref={ref} {...rest} href={`tel:${number.replace(/[^\d+]/g, "")}`} onClick={onClick} className={className}>
        {children}
      </a>
    );
  },
);
CallLink.displayName = "CallLink";
