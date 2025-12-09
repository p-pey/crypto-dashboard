import { mockCoins, mockTrendingCoins } from "@/data/mockData";
import { formatCurrency, formatPercent } from "@/utils/format";
import {
  ArrowRightOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  FireOutlined,
} from "@ant-design/icons";
import { Card } from "antd";

const TrendingSection = () => {
  const topGainers = [...mockCoins]
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 3);

  const topLosers = [...mockCoins]
    .sort((a, b) => a.change24h - b.change24h)
    .slice(0, 3);

  const renderCoinRow = (coin: (typeof mockCoins)[0], index: number) => {
    const isPositive = coin.change24h >= 0;
    return (
      <div
        key={coin.id}
        className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-secondary/30 px-2 -mx-2 rounded cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm w-4">{index + 1}</span>
          <img
            src={coin.logo}
            alt={coin.name}
            className="w-6 h-6 rounded-full"
            onError={(e) => {
              (
                e.target as HTMLImageElement
              ).src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=random&size=24`;
            }}
          />
          <div>
            <div className="font-medium text-foreground text-sm">
              {coin.name}
            </div>
            <div className="text-xs text-muted-foreground">{coin.symbol}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-foreground">
            {formatCurrency(coin.price)}
          </div>
          <div
            className={`flex items-center justify-end gap-1 text-xs ${
              isPositive ? "text-gain" : "text-loss"
            }`}
          >
            {isPositive ? <CaretUpOutlined /> : <CaretDownOutlined />}
            {formatPercent(coin.change24h).replace("+", "")}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in"
      style={{ animationDelay: "0.2s" }}
    >
      {/* Trending */}
      <Card className="bg-card border-border" style={{ padding: "16px" }}>
        <div className="flex items-center gap-2 mb-4">
          <FireOutlined className="text-warning text-lg" />
          <h3 className="font-semibold text-foreground">Trending</h3>
          <button className="ml-auto text-primary text-sm hover:text-primary/80 flex items-center gap-1">
            More <ArrowRightOutlined className="text-xs" />
          </button>
        </div>
        <div>
          {mockTrendingCoins.map((coin, index) => (
            <div
              key={coin.id}
              className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-secondary/30 px-2 -mx-2 rounded cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-sm w-4">
                  {index + 1}
                </span>
                <img
                  src={coin.logo}
                  alt={coin.name}
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    (
                      e.target as HTMLImageElement
                    ).src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=random&size=24`;
                  }}
                />
                <div>
                  <div className="font-medium text-foreground text-sm">
                    {coin.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {coin.symbol}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-foreground">
                  {formatCurrency(coin.price)}
                </div>
                <div
                  className={`flex items-center justify-end gap-1 text-xs ${
                    coin.change24h >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {coin.change24h >= 0 ? (
                    <CaretUpOutlined />
                  ) : (
                    <CaretDownOutlined />
                  )}
                  {formatPercent(coin.change24h).replace("+", "")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top Gainers */}
      <Card className="bg-card border-border" style={{ padding: "16px" }}>
        <div className="flex items-center gap-2 mb-4">
          <CaretUpOutlined className="text-gain text-lg" />
          <h3 className="font-semibold text-foreground">Top Gainers</h3>
          <button className="ml-auto text-primary text-sm hover:text-primary/80 flex items-center gap-1">
            More <ArrowRightOutlined className="text-xs" />
          </button>
        </div>
        <div>{topGainers.map(renderCoinRow)}</div>
      </Card>

      {/* Top Losers */}
      <Card className="bg-card border-border" style={{ padding: "16px" }}>
        <div className="flex items-center gap-2 mb-4">
          <CaretDownOutlined className="text-loss text-lg" />
          <h3 className="font-semibold text-foreground">Top Losers</h3>
          <button className="ml-auto text-primary text-sm hover:text-primary/80 flex items-center gap-1">
            More <ArrowRightOutlined className="text-xs" />
          </button>
        </div>
        <div>{topLosers.map(renderCoinRow)}</div>
      </Card>
    </div>
  );
};

export default TrendingSection;
