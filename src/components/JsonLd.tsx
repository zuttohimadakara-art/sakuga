// JSON-LD structured data component
// Renders a <script type="application/ld+json"> tag with the given schema.
// Used on pages to give search engines / AI crawlers explicit structured data.

type JsonLdProps = {
  schema: object | object[];
};

export default function JsonLd({ schema }: JsonLdProps) {
  const data = JSON.stringify(schema).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: data }}
    />
  );
}
