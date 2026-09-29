import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_APP_THEME } from "~/constants/constants";
import { isLocale, negotiateLocale, withLocale } from "~/i18n/config";

const LOCALE_COOKIE = "NEXT_LOCALE";
const THEME_COOKIE = "theme";

/**
 * Two responsibilities, both of which have to happen before a route renders:
 *
 * 1. Locale prefix. A request without a supported first segment is redirected
 *    to `/{locale}{pathname}`. The locale comes from the visitor's explicit
 *    choice, then `Accept-Language`, then {@link DEFAULT_LOCALE}.
 * 2. Default theme. The `theme` cookie is seeded with the app default so the
 *    very first server render already matches what the user will see. The
 *    cookie has to be written on the *response*; setting it on the request
 *    object alone is discarded.
 */
export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";

  const hasLocale = isLocale(firstSegment);

  const locale = hasLocale
    ? firstSegment
    : negotiateLocale(
        req.headers.get("accept-language"),
        req.cookies.get(LOCALE_COOKIE)?.value ?? null,
      );

  const response = hasLocale
    ? NextResponse.next()
    : NextResponse.redirect(
        new URL(`${withLocale(locale, pathname)}${search}`, req.url),
      );

  if (!req.cookies.get(THEME_COOKIE)?.value) {
    response.cookies.set(THEME_COOKIE, DEFAULT_APP_THEME, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  // Remember the locale the visitor landed on so the next bare request does not
  // have to re-run negotiation.
  if (!hasLocale || req.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  // Everything except the API surface, Next internals and files with an
  // extension (favicon, images, robots.txt, ...).
  matcher: ["/((?!api|_next|favicon\\.ico|.*\\..*).*)"],
};
