import type { Locale as AntLocale } from "antd/es/locale";
import deDE from "antd/locale/de_DE";
import enUS from "antd/locale/en_US";
import faIR from "antd/locale/fa_IR";

import type { Locale } from "./config";

/**
 * antd takes a resolved locale bundle rather than a BCP-47 tag, so the three
 * supported languages are mapped explicitly. All three are small, static and
 * tree shakable, so importing them up front is cheaper than a dynamic map.
 */
export const ANTD_LOCALES: Record<Locale, AntLocale> = {
  fa: faIR,
  en: enUS,
  de: deDE,
};
