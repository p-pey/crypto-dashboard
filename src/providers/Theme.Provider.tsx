import { ConfigProvider, theme as antdTheme } from "antd";
import type { PropsWithChildren } from "react";
import { buildAntdTheme } from "~/styles/colors";

export default function ThemeProvider({
  theme,
  children,
}: PropsWithChildren<{ theme: "dark" | "light" }>) {
  return (
    <ConfigProvider
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
