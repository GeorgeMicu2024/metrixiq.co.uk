import Link from "next/link";

export default function TrackedLink({
  href,
  eventName = "cta_click",
  eventParams = {},
  children,
  ...props
}) {
  const destination = typeof href === "string" ? href : "";
  const params = JSON.stringify({ destination, ...eventParams });

  return (
    <Link
      href={href}
      data-track-event={eventName}
      data-track-params={params}
      {...props}
    >
      {children}
    </Link>
  );
}
