import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  appendVaryAccept,
  isFrameworkAccept,
  preferredType,
} from "@/lib/accept";
import {
  isNegotiablePath,
  markdownForPath,
  markdownResponse,
  notAcceptableResponse,
} from "@/lib/markdown";
import { absoluteUrl } from "@/lib/site";

function htmlPassThrough(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  appendVaryAccept(response.headers);
  const path = request.nextUrl.pathname;
  if (isNegotiablePath(path) && markdownForPath(path).status === 200) {
    const mdUrl =
      path === "/" ? absoluteUrl("/index.md") : `${absoluteUrl(path)}.md`;
    const describedBy = `<${absoluteUrl("/llms.txt")}>; rel="describedby"`;
    const alternate = `<${mdUrl}>; rel="alternate"; type="text/markdown"`;
    response.headers.append("Link", `${alternate}, ${describedBy}`);
  }
  return response;
}

function markdownFor(request: NextRequest): Response {
  const page = markdownForPath(request.nextUrl.pathname);
  const response = markdownResponse(page.body, page.status);
  if (request.method === "HEAD") {
    return new Response(null, {
      status: page.status,
      headers: response.headers,
    });
  }
  return response;
}

export function proxy(request: NextRequest) {
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") {
    return NextResponse.next();
  }

  const accept = request.headers.get("accept");
  if (isFrameworkAccept(accept)) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const explicitMarkdown = pathname.endsWith(".md");

  if (!explicitMarkdown && !isNegotiablePath(pathname)) {
    return NextResponse.next();
  }

  if (explicitMarkdown) {
    return markdownFor(request);
  }

  const chosen = preferredType(accept);
  switch (chosen) {
    case "text/markdown":
      return markdownFor(request);
    case "text/html":
      return htmlPassThrough(request);
    case null:
      if (accept) {
        return notAcceptableResponse();
      }
      return htmlPassThrough(request);
    default: {
      const _exhaustive: never = chosen;
      return _exhaustive;
    }
  }
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|_vercel|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg)$).*)",
    },
  ],
};
