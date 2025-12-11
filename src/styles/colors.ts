import type { Themes } from "~/constants/constants";

export const COLORS: Record<keyof typeof Themes, {
       primary: string;
       secondary: string;
       trittary: string;
       fourthly: string
}> = {
       light: {
              primary: "#B6AE9F",
              secondary: "#C5C7BC",
              trittary: "#000000",
              fourthly: "#FBF3D1"
       },
       dark: {
              primary: "#002455",
              secondary: "#050E3C",
              trittary: "#DC0000",
              fourthly: "#FF3838",
       },
}