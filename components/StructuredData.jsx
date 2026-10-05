export default function StructuredData({ data }) {
  const items = Array.isArray(data) ? data : [data];

  return items.filter(Boolean).map((item, index) => (
    <script
      key={index}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(item).replace(/</g, "\\u003c"),
      }}
    />
  ));
}
