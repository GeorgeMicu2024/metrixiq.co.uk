"use client";

import Link from "next/link";

export default function TrackedLink({
  href,
  eventName = "cta_click",
  eventParams = {},
  children,
  ...props
}) {
  const track = () => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", eventName, {
      destination: typeof href === "string" ? href : "",
      ...eventParams,
    });
  };

  return (
    <Link href={href} onClick={track} {...props}>
      {children}
    </Link>
  );
}
