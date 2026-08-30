import { LLMS_TXT, markdownResponse } from "@/lib/markdown";

export function GET() {
  return markdownResponse(LLMS_TXT);
}
