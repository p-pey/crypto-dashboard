import SafetyPanel from "~/features/insights/SafetyPanel";

/**
 * Token safety, on its own page rather than inside the coin detail.
 *
 * The separation is deliberate. A safety check is a question you ask about an
 * address that arrived from somewhere else — a contract link, a message, a
 * ticker someone typed. Burying that behind a click on a coin in a list would
 * imply the token was already vetted by being listed, which is the opposite of
 * what an unvetted long-tail token is.
 */
export default function SafetyPage() {
  return (
    <div className="flex flex-col gap-4">
      <SafetyPanel />
    </div>
  );
}
