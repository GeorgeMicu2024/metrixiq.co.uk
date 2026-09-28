"use client";

export default function TrackedPhoneLink({
  phoneE164,
  display,
  location,
  children,
  ...props
}) {
  const handleClick = () => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", "phone_click", {
      contact_method: "phone",
      phone_number: phoneE164,
      cta_location: location || "unknown",
    });
  };

  return (
    <a href={`tel:${phoneE164}`} onClick={handleClick} {...props}>
      {children || display}
    </a>
  );
}
