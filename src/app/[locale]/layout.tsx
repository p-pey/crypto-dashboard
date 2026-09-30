import "~/styles/globals.css";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Vazirmatn } from "next/font/google";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import "reflect-metadata";

import AppShell from "~/components/layout/layout";
import { DEFAULT_APP_THEME, isAppTheme } from "~/constants/constants";
import { isLocale, LOCALES, LOCALE_META, type Locale } from "~/i18n/config";
import { getDictionary } from "~/i18n/dictionaries";
import I18nProvider from "~/i18n/I18nProvider";
import ThemeProvider from "~/providers/Theme.Provider";
import { TRPCReactProvider } from "~/trpc/react";
import type { AppTheme } from "~/types/types";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#08090e" },
  ],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

/** Persian needs an Arabic script face; the Latin fonts have no Persian glyphs. */
const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

/** Pre-render every locale at build time so the first paint needs no redirect. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const resolved: Locale = isLocale(locale) ? locale : "fa";
  const dictionary = await getDictionary(resolved);

  return {
    title: {
      default: dictionary.meta.title,
      template: dictionary.meta.titleTemplate,
    },
    description: dictionary.meta.description,
    icons: [{ rel: "icon", url: "/favicon.ico" }],
    alternates: {
      canonical: `/${resolved}`,
      languages: Object.fromEntries(
        LOCALES.map((candidate) => [candidate, `/${candidate}`]),
      ),
    },
    openGraph: {
      siteName: dictionary.brand.name,
      type: "website",
      locale: LOCALE_META[resolved].htmlLang,
    },
  };
}

export default async function RootAppLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  if (!isLocale(locale)) notFound();

  const [cookie, dictionary] = await Promise.all([
    cookies(),
    getDictionary(locale),
  ]);

  const cookieTheme = cookie.get("theme")?.value;
  const theme: AppTheme = isAppTheme(cookieTheme)
    ? cookieTheme
    : DEFAULT_APP_THEME;
  const meta = LOCALE_META[locale];

  return (
    <html
      lang={meta.htmlLang}
      dir={meta.dir}
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${vazirmatn.variable} ${
        // Tailwind's `dark:` variant is keyed off this class, so it stays a
        // class. The themes themselves are attributes: `.glass` is already a
        // component class in the stylesheet and must not be reused here.
        theme === "dark" ? "dark" : ""
      }`}
      data-theme={theme}
      // `color-scheme` only understands light/dark, so glass reports dark.
      style={{ colorScheme: theme === "light" ? "light" : "dark" }}
    >
      <body className="antialiased">
        <AntdRegistry>
          <TRPCReactProvider>
            <I18nProvider locale={locale} dictionary={dictionary}>
              <ThemeProvider theme={theme} locale={locale}>
                <AppShell>{children}</AppShell>
              </ThemeProvider>
            </I18nProvider>
          </TRPCReactProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
