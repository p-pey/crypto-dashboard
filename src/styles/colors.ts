import type { Themes } from "~/constants/constants";

export const COLORS: Record<keyof typeof Themes, {
       primary: string;
       secondary: string;
       trittary: string;
       fourthly: string
}> = {
       light: {
              primary: "#9ECAD6",
              secondary: "#748DAE",
              trittary: "#F5CBCB",
              fourthly: "#FFEAEA"
       },
       dark: {
              primary: "#113F67",
              secondary: "#34699A",
              trittary: "#FDF5AA",
              fourthly: "#58A0C8"
       }
}