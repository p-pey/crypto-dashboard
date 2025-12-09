import { mockETFs } from "@/data/mockData";
import { EtfService } from "@/services/etf/EtfService";
import { formatCurrency, formatPercent } from "@/utils/format";
import {
  ArrowRightOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Card } from "antd";
import { container } from "tsyringe";
import SparklineChart from "./SparklineChart";

const FetchService = container.resolve<EtfService>(EtfService);
function ETFSection() {
  const { isLoading, data } = useQuery({
    queryKey: ["GetALLETF"],
    queryFn: () => {
      return FetchService.getAllEtfData();
    },
  });
  console.log("-------------------------");
  console.log(data);
  console.log("-------------------------");
  return (
    <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Crypto ETFs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track spot Bitcoin and Ethereum ETFs
          </p>
        </div>
        <button className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium">
          View All <ArrowRightOutlined />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockETFs.map((etf, index) => {
          const isPositive = etf.change24h >= 0;
          return (
            <Card
              key={etf.id}
              className="bg-card border-border hover:border-primary/50 transition-all duration-300 cursor-pointer group"
              style={{ animationDelay: `${index * 0.05}s`, padding: "16px" }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={etf.logo}
                    alt={etf.name}
                    className="w-10 h-10 rounded-full"
                    onError={(e) => {
                      (
                        e.target as HTMLImageElement
                      ).src = `https://ui-avatars.com/api/?name=${etf.symbol}&background=random`;
                    }}
                  />
                  <div>
                    <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {etf.symbol}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {etf.name}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-foreground">
                    {formatCurrency(etf.price)}
                  </div>
                  <div
                    className={`flex items-center justify-end gap-1 text-sm ${
                      isPositive ? "text-gain" : "text-loss"
                    }`}
                  >
                    {isPositive ? <CaretUpOutlined /> : <CaretDownOutlined />}
                    {formatPercent(etf.change24h).replace("+", "")}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center py-2">
                <SparklineChart
                  data={etf.sparklineData}
                  color={isPositive ? "gain" : "loss"}
                  width={200}
                  height={50}
                  strokeWidth={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-border">
                <div>
                  <div className="text-xs text-muted-foreground">AUM</div>
                  <div className="text-sm font-medium text-foreground">
                    {formatCurrency(etf.aum)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Volume</div>
                  <div className="text-sm font-medium text-foreground">
                    {formatCurrency(etf.volume24h)}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default ETFSection;
