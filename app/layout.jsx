import "./globals.css";

export const metadata = {
  title: "MetrixIQ — Fleet & Driver Intelligence",
  description: "Operational intelligence for modern delivery fleets.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
