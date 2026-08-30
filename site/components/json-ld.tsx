import { softwareApplicationJsonLdScript } from "@/lib/json-ld";

export function SoftwareApplicationJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: softwareApplicationJsonLdScript() }}
    />
  );
}
