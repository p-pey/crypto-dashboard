import CoinTable from "@/components/CoinTable";
import ETFSection from "@/components/ETFSection";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import MarketStatsBar from "@/components/MarketStats";
import TrendingSection from "@/components/TrendingSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <MarketStatsBar />

      <main className="container mx-auto px-4 py-6 space-y-8">
        {/* Trending, Gainers, Losers */}
        <TrendingSection />

        {/* ETFs Section */}
        <ETFSection />

        {/* Main Coin Table */}
        <CoinTable />
      </main>

      <Footer />
    </div>
  );
};

export default Index;
