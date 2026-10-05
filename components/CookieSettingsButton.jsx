export default function CookieSettingsButton() {
  const enabled = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

  if (!enabled) return null;

  return (
    <button
      type="button"
      className="cookie-settings-button"
      data-cookie-settings="true"
    >
      Cookie settings
    </button>
  );
}
