import { ConfigProvider, theme as antdTheme } from "antd";
import type { PropsWithChildren } from "react";
import { ANTD_LOCALES } from "~/i18n/antdLocale";
import type { Locale } from "~/i18n/config";
import { LOCALE_META } from "~/i18n/config";
import { buildAntdTheme } from "~/styles/colors";
import type { AppTheme } from "~/types/types";

/**
 * Bridges the cookie driven app theme and the route locale into antd, so its
 * algorithm and its internal layout direction both follow the shell.
 *
 * This stays a Server Component on purpose: antd's `ConfigProvider` only reads
 * context for its own descendants, and keeping it on the server avoids pulling
 * the whole antd runtime into an extra client boundary.
 */
export default function ThemeProvider({
  theme,
  locale,
  children,
}: PropsWithChildren<{ theme: AppTheme; locale: Locale }>) {
  const dir = LOCALE_META[locale].dir;

  return (
    <ConfigProvider
      direction={dir}
      locale={ANTD_LOCALES[locale]}
      theme={{
        ...buildAntdTheme(theme),
        algorithm:
          theme === "light"
            ? antdTheme.defaultAlgorithm
            : antdTheme.darkAlgorithm,
      }}
    >
      {children}
    </ConfigProvider>
  );
}
