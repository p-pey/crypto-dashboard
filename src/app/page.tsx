import {HydrateClient} from "~/trpc/server";
import CoinsDataTable from "~/features/coins/components/CoinsDataTable";


export default async function Home() {

  return (
    <HydrateClient>
    <CoinsDataTable />
    </HydrateClient>
  );
}
