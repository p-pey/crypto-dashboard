"use client";

import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import { LOCALE_META, type Locale } from "./config";
import type {
  Dictionary,
  Translate,
  TranslationKey,
} from "./dictionaries/types";
import { interpolate } from "./format";

type I18nContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  dictionary: Dictionary;
  t: Translate;
  /** `true` when the locale renders right to left. */
  isRtl: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(dictionary: Dictionary, key: string): string {
  let node: unknown = dictionary;
  for (const segment of key.split(".")) {
    if (typeof node !== "object" || node === null) return key;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === "string" ? node : key;
}

/**
 * Every dictionary string in the app funnels through here. The dictionaries are
 * server files, but this provider serialises exactly one of them into the RSC
 * payload so Client Components (sidebar, tables, antd columns) can translate
 * without prop drilling or a client side fetch.
 */
export default function I18nProvider({
  locale,
  dictionary,
  children,
}: PropsWithChildren<{ locale: Locale; dictionary: Dictionary }>) {
  const value = useMemo<I18nContextValue>(() => {
    const meta = LOCALE_META[locale];
    return {
      locale,
      dir: meta.dir,
      isRtl: meta.dir === "rtl",
      dictionary,
      t: (key: TranslationKey, ...args: (string | number)[]) =>
        interpolate(resolve(dictionary, key), ...args),
    };
  }, [locale, dictionary]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return context;
}
