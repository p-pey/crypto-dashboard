"use client";
import { useQuery } from "@tanstack/react-query";
import "./PriceTicker.css";
import { api } from "~/trpc/react";

export default function PriceTicker() {
  const { data: prices = [], isFetching } = api.overview.getPrices.useQuery();
  return (
    <div className="ticker">
      <label className="ticker-label">24h:</label>
      <div className="ticker__track">
        {isFetching && prices.length === 0 ? (
          <span style={{ color: "#ccc" }}>Loading prices...</span>
        ) : (
          prices.map((coin, i) => (
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
          ))
        )}
      </div>
    </div>
  );
}
