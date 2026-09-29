import "~/styles/globals.css";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { type Viewport, type Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cookies } from "next/headers";
import "reflect-metadata";
import AppShell from "~/components/layout/layout";
import { DEFAULT_APP_THEME } from "~/constants/constants";
import ThemeProvider from "~/providers/Theme.Provider";
import { TRPCReactProvider } from "~/trpc/react";
import type { AppTheme } from "~/types/types";

export const metadata: Metadata = {
  title: "Obsidian · Crypto Markets",
  description:
    "Live crypto, ETF and Iranian exchange pricing with realtime market streams.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

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

export default async function RootAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookie = await cookies();
  const theme =
    (cookie.get("theme")?.value as AppTheme | null) ?? DEFAULT_APP_THEME;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${theme === "dark" ? "dark" : ""}`}
      style={{ colorScheme: theme }}
    >
      <body className="antialiased">
        <AntdRegistry>
          <TRPCReactProvider>
            <ThemeProvider theme={theme}>
              <AppShell>{children}</AppShell>
            </ThemeProvider>
          </TRPCReactProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
