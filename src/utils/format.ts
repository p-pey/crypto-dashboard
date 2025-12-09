export const formatCurrency = (value: number, decimals: number = 2): string => {
       if (value >= 1e12) {
              return `$${(value / 1e12).toFixed(2)}T`;
       }
       if (value >= 1e9) {
              return `$${(value / 1e9).toFixed(2)}B`;
       }
       if (value >= 1e6) {
              return `$${(value / 1e6).toFixed(2)}M`;
       }
       if (value >= 1e3) {
              return `$${(value / 1e3).toFixed(2)}K`;
       }
       if (value < 0.01) {
              return `$${value.toFixed(8)}`;
       }
       return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

export const formatNumber = (value: number, decimals: number = 2): string => {
       if (value >= 1e12) {
              return `${(value / 1e12).toFixed(2)}T`;
       }
       if (value >= 1e9) {
              return `${(value / 1e9).toFixed(2)}B`;
       }
       if (value >= 1e6) {
              return `${(value / 1e6).toFixed(2)}M`;
       }
       if (value >= 1e3) {
              return `${(value / 1e3).toFixed(2)}K`;
       }
       return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export const formatPercent = (value: number): string => {
       const sign = value >= 0 ? '+' : '';
       return `${sign}${value.toFixed(2)}%`;
};

export const formatSupply = (value: number, symbol: string): string => {
       if (value >= 1e12) {
              return `${(value / 1e12).toFixed(2)}T ${symbol}`;
       }
       if (value >= 1e9) {
              return `${(value / 1e9).toFixed(2)}B ${symbol}`;
       }
       if (value >= 1e6) {
              return `${(value / 1e6).toFixed(2)}M ${symbol}`;
       }
       return `${value.toLocaleString('en-US')} ${symbol}`;
};
