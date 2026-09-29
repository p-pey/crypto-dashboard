import type { PropsWithChildren } from "react";
import { cookies } from "next/headers";

import AppFooter from "./footer";
import AppHeader from "./header";
import Sidebar from "./sidebar";
import { DEFAULT_APP_THEME } from "~/constants/constants";
import type { AppTheme } from "~/types/types";

export default async function AppShell({ children }: PropsWithChildren) {
  const cookie = await cookies();
  const theme =
    (cookie.get("theme")?.value as AppTheme | null) ?? DEFAULT_APP_THEME;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div className="aurora" aria-hidden>
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1800px] gap-3.5 p-3.5 sm:gap-4 sm:p-4">
        <aside className="hidden w-[248px] shrink-0 lg:block">
          <Sidebar />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5 sm:gap-4">
          <AppHeader theme={theme} />
          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pe-0.5 pb-1">
            {children}
          </main>
          <AppFooter />
        </div>
      </div>
    </div>
  );
}
