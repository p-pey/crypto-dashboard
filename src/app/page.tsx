import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export default async function Home() {
  const session = await auth();
  const etfs = api.etf.getAll();
  console.log(etfs);
  return <HydrateClient>{JSON.stringify(etfs)}</HydrateClient>;
}
