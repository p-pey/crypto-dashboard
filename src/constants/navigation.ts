import {
  CandlestickChart,
  ChartPie,
  Droplets,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    href: "/",
    label: "Markets",
    hint: "Binance spot stream",
    icon: ChartPie,
  },
  {
    key: "etfs",
    href: "/etfs",
    label: "ETFs",
    hint: "Daily fund flow",
    icon: CandlestickChart,
  },
  {
    key: "ir-price",
    href: "/ir-price",
    label: "IR Price",
    hint: "Iranian exchanges",
    icon: Droplets,
  },
];
