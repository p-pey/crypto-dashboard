import axios from "axios";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { Etf } from "./etfs";

const EtfList = new Etf();

export const EtfRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    return EtfList.getAll();
  }),
  getBTCEtf: publicProcedure.query(async () => {
    return Promise.all(
      EtfList.getAllBtcEtf().map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf.id}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getETHEtf: publicProcedure.query(async () => {
    return Promise.all(
      EtfList.getAllEthEtf().map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getSolanaEtf: publicProcedure.query(async () => {
    return Promise.all(
      EtfList.getAllSolEtf().map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getXRPEtf: publicProcedure.query(async () => {
    return Promise.all(
      EtfList.getAllXrpEtf().map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
  getDOGEtf: publicProcedure.query(async () => {
    return Promise.all(
      EtfList.getAllDogeEtf().map(async (etf) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
        );
        return { etf, data: response.data };
      }),
    );
  }),
});
