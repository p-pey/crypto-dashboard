import axios from "axios";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { Etf } from "./etfs";
import {z} from "zod";

const EtfList = new Etf();

export const EtfRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    return EtfList.getAll();
  }),
    getEtf: publicProcedure
        .input(
            z.object({
                symbol: z.string()
            })
        )
        .query(async (param)=> {
       switch (param.input.symbol) {
           case "BTC":  return Promise.all(
               EtfList.getAllBtcEtf().map(async (etf) => {
                   const response = await axios.get(
                       `https://query1.finance.yahoo.com/v8/finance/chart/${etf.id}`,
                   );
                   return { etf, data: response.data };
               }),
           );
           case "ETH": return Promise.all(
               EtfList.getAllEthEtf().map(async (etf) => {
                   const response = await axios.get(
                       `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
                   );
                   return { etf, data: response.data };
               }),
           );
           case "SOL":  return Promise.all(
               EtfList.getAllSolEtf().map(async (etf) => {
                   const response = await axios.get(
                       `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
                   );
                   return { etf, data: response.data };
               }),
           );
           case "XRP": return Promise.all(
               EtfList.getAllXrpEtf().map(async (etf) => {
                   const response = await axios.get(
                       `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
                   );
                   return { etf, data: response.data };
               }),
           );
           case "DOGE": return Promise.all(
               EtfList.getAllDogeEtf().map(async (etf) => {
                   const response = await axios.get(
                       `https://query1.finance.yahoo.com/v8/finance/chart/${etf}`,
                   );
                   return { etf, data: response.data };
               }),
           );
           default: return [];
       }
    }),
});
