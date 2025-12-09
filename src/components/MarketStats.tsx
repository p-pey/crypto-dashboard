import { mockMarketStats } from '@/data/mockData';
import { formatCurrency, formatNumber, formatPercent } from '@/utils/format';
import { CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';

const MarketStatsBar = () => {
  const stats = mockMarketStats;
  const isPositive = stats.marketCapChange24h >= 0;

  return (
    <div className="bg-card/50 border-b border-border py-2 px-4 overflow-x-auto">
      <div className="flex items-center gap-6 text-sm whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Cryptos:</span>
          <span className="text-foreground font-medium">{formatNumber(stats.totalCryptos, 0)}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Exchanges:</span>
          <span className="text-foreground font-medium">{stats.totalExchanges}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Market Cap:</span>
          <span className="text-foreground font-medium">{formatCurrency(stats.totalMarketCap)}</span>
          <span className={`flex items-center ${isPositive ? 'text-gain' : 'text-loss'}`}>
            {isPositive ? <CaretUpOutlined /> : <CaretDownOutlined />}
            {formatPercent(stats.marketCapChange24h)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">24h Vol:</span>
          <span className="text-foreground font-medium">{formatCurrency(stats.totalVolume24h)}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Dominance:</span>
          <span className="text-foreground font-medium">
            BTC: {stats.btcDominance}% ETH: {stats.ethDominance}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default MarketStatsBar;
