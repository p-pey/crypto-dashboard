import { ConfigProvider, theme } from "antd";
import type { PropsWithChildren } from "react";
import { COLORS } from "~/styles/colors";

export default function ThemeProvider(
  props: PropsWithChildren<{ theme: "dark" | "light" }>,
) {
  const activeThemeAlgorithm =
    props.theme === "light" ? theme.defaultAlgorithm : theme.darkAlgorithm;
  const colors = COLORS[props.theme];
  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        algorithm: activeThemeAlgorithm,
        token: {
          colorPrimary: colors.primary,
          borderRadius: 4,
          colorBgContainer: colors.secondary,
          colorText: colors.trittary,
          colorBorder: colors.fourthly,
          padding: 8,
        },
      }}
    >
      {props.children}
    </ConfigProvider>
  );
}
