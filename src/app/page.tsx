import CoinsDataTable from "~/features/coins/CoinsDataTable";
import { HydrateClient } from "~/trpc/server";

export default async function Home() {
  return (
    <HydrateClient>
      <CoinsDataTable />
    </HydrateClient>
  );
}
