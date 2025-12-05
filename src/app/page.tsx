import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export default async function Home() {
  const session = await auth();
  const etfs = await api.etf.getBTCEtf();
  console.log("ETF");
  console.log(etfs);
  console.log("ETF");
  return <HydrateClient>{JSON.stringify(etfs)}</HydrateClient>;
}
