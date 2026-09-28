"use client";

import Link from "next/link";

export default function TrackedLink({
  href,
  eventName = "cta_click",
  eventParams = {},
  onClick,
  children,
  ...props
}) {
  const handleClick = (event) => {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      typeof window === "undefined" ||
      typeof window.gtag !== "function"
    ) return;

    window.gtag("event", eventName, {
      destination: typeof href === "string" ? href : "",
      ...eventParams,
    });
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
