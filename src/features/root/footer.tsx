"use client";
import { Layout } from "antd";
import PriceTicker from "./PriceChanges.tsx/PriceTicker";

const { Footer } = Layout;

export default function AppFooter() {
  return (
    <Footer
        className="fixed bottom-0 left-0 w-full"
      style={{
        background: "#001529",
        color: "white",
        padding: "8px 16px",
        overflow: "hidden",
      }}
    >
      <PriceTicker />
    </Footer>
  );
}
