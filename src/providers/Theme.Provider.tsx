import { ConfigProvider, theme } from "antd";
import type { PropsWithChildren } from "react";

export default function ThemeProvider(
  props: PropsWithChildren<{ theme: "dark" | "light" }>,
) {
  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        algorithm:
          props.theme === "light"
            ? theme.defaultAlgorithm
            : theme.darkAlgorithm,
        token: {
          colorPrimary: "#113F67",
          borderRadius: 4,
          colorBgContainer: "#34699A",
          colorText: "#FDF5AA",
          colorBorder: "#58A0C8",
        },
      }}
    >
      {props.children}
    </ConfigProvider>
  );
}
