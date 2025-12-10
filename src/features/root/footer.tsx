import { Footer } from "antd/lib/layout/layout";

export default async function AppFooter() {
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
      {/* <PriceTicker /> */}
    </Footer>
  );
}
