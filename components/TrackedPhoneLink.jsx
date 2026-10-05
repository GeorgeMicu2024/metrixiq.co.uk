export default function TrackedPhoneLink({
  phoneE164,
  display,
  location,
  children,
  ...props
}) {
  const params = JSON.stringify({
    contact_method: "phone",
    phone_number: phoneE164,
    cta_location: location || "unknown",
  });

  return (
    <a
      href={`tel:${phoneE164}`}
      data-track-event="phone_click"
      data-track-params={params}
      {...props}
    >
      {children || display}
    </a>
  );
}
