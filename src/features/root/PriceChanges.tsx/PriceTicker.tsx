import "./PriceTicker.css";
import { api } from "~/trpc/server";

export default async function PriceTicker() {
  const prices = await api.overview.getPrices();
  return (
    <div className="ticker">
      <label className="ticker-label">24h:</label>
      <div className="ticker__track">
       {   prices.map((coin, i) => (
            <span
              key={i}
              style={{
                marginRight: 32,
                color:
                  coin.priceChangePercentage24h >= 0 ? "#4caf50" : "#f44336",
                fontWeight: 600,
              }}
            >
              {coin.symbol.toUpperCase()}:{" "}
              {coin.priceChangePercentage24h.toFixed(2)}%
            </span>
          ))}

      </div>
    </div>
  );
}
