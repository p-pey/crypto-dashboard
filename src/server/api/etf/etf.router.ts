import axios from "axios";
import { createTRPCRouter, publicProcedure } from "../trpc";

const BTC_ETFS = [
  { id: "GBTC", name: "Grayscale Bitcoin" },
  { id: "IBTC", name: "iShares Bitcoin Trust" },
  { id: "FBTC", name: "Fidelity Wise Origin Bitcoin Fund" },
  { id: "BTC", name: "Grayscale Bitcoin Mini Trust ETF" },
  { id: "BITB", name: "Bitwise Bitcoin ETF" },
  { id: "ARKB", name: "ARK 21Shares Bitcoin ETF" },
  { id: "BITO", name: "ProShares Bitcoin ETF" },
  { id: "HODL", name: "VanEck Bitcoin ETF" },
  { id: "BTCO", name: "Invesco Galaxy Bitcoin ETF" },
  { id: "EZBC", name: "Franklin Bitcoin ETF" },
  {
    id: "BRRR",
    name: "Coinshares Bitcoin ETF Common Shares of Beneficial Interest",
  },
  {
    id: "BTCW",
    name: "WisdomTree Bitcoin Fund",
  },
  {
    id: "BITS",
    name: "Global X Blockchain & Bitcoin Strategy ETF",
  },
  {
    id: "ARKA",
    name: "ARK 21Shares Active Bitcoin Futures Strategy ETF",
  },
  {
    id: "DEFI",
    name: "Hashdex Bitcoin ETF",
  },
  {
    id: "BITC",
    name: "Bitwise Trendwise Bitcoin and Treasuries Rotation Strategy ETF",
  },
  {
    id: "ARKC",
    name: "ARK 21Shares Active On-Chain Bitcoin Strategy ETF",
  },
  {
    id: "CHINAAMC",
    name: "ChinaAMC Bitcoin ETF",
  },
  {
    id: "HARVEST",
    name: "Harvest Bitcoin Spot ETF",
  },
  {
    id: "BOSERA&HASHKE",
    name: "Bosera HashKey Bitcoin ETF",
  },
] as const;
const ETH_ETFS = [
  {
    id: "ETHA",
    name: "iShares Ethereum Trust ETF",
  },
] as const;
export const EtfRouter = createTRPCRouter({
  getBTCEtf: publicProcedure.query(async () => {
    return Promise.all(
      BTC_ETFS.map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getETHEtf: publicProcedure.query(async () => {
    return Promise.all(
      ETH_ETFS.map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getSolanaEtf: publicProcedure.query(async () => {
    return Promise.all(
      SOLANA_ETFS.map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getXRPEtf: publicProcedure.query(async () => {
    return Promise.all(
      XRPE_ETFS.map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getDOGEtf: publicProcedure.query(async () => {
    return Promise.all(
      DOGE_ETFS.map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
});
