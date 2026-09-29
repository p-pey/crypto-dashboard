import Link from "next/link";
import { locale as rootLocale } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, withLocale } from "~/i18n/config";
import { getDictionary } from "~/i18n/dictionaries";

/**
 * Rendered for any unknown path under a valid `/<locale>` prefix. The locale
 * comes from the root parameter, so a bad URL in Persian shows a Persian 404
 * rather than falling back to the default language.
 */
export default async function LocaleNotFound() {
  const raw = await rootLocale();
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dictionary = await getDictionary(locale);

  return (
    <div className="panel grid place-items-center gap-3 px-6 py-20 text-center">
      <p className="num text-brand text-[44px] leading-none font-black tracking-tight">
        {dictionary.notFound.code}
      </p>
      <h2 className="text-fg text-[18px] font-bold">
        {dictionary.notFound.title}
      </h2>
      <p className="text-fg-3 max-w-md text-[13px] leading-relaxed">
        {dictionary.notFound.description}
      </p>
      <Link
        href={withLocale(locale, "/")}
        className="from-brand to-brand-2 mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-br px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_8px_24px_-10px_var(--glow-1)]"
      >
        {dictionary.notFound.backHome}
      </Link>
    </div>
  );
}
