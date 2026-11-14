import { jsonLdScript, softwareApplicationJsonLdScript } from "@/lib/json-ld";

export function SoftwareApplicationJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: softwareApplicationJsonLdScript() }}
    />
  );
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
    />
  );
}
