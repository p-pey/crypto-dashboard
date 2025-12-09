import {
  MenuOutlined,
  SearchOutlined,
  StarOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Dropdown, Input } from "antd";

const Header = () => {
  const menuItems: MenuProps["items"] = [
    { key: "cryptocurrencies", label: "Cryptocurrencies" },
    { key: "Liquidity", label: "Liquidity" },
    { key: "Etf", label: "ETF's" },
  ];

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">
                ₿
              </span>
            </div>
            <span className="text-xl font-bold text-foreground hidden sm:inline">
              CryptoTracker
            </span>
          </div>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-6">
            {["Cryptocurrencies", "Liquidity", "ETF's"].map((item) => (
              <button
                key={item}
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                {item}
              </button>
            ))}
          </nav>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <Input
              prefix={<SearchOutlined className="text-muted-foreground" />}
              placeholder="Search coins..."
              className="rounded-lg"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              type="text"
              icon={<StarOutlined />}
              className="text-muted-foreground hover:text-foreground hidden sm:flex"
            >
              <span className="hidden md:inline">Watchlist</span>
            </Button>
            <Button
              type="text"
              icon={<WalletOutlined />}
              className="text-muted-foreground hover:text-foreground hidden sm:flex"
            >
              <span className="hidden md:inline">Portfolio</span>
            </Button>
            {/* <Button
              type="primary"
              className="bg-primary hover:bg-primary/90 border-none"
            >
              Sign In
            </Button> */}
            <Dropdown
              menu={{ items: menuItems }}
              trigger={["click"]}
              className="lg:hidden"
            >
              <Button
                type="text"
                icon={<MenuOutlined />}
                className="text-foreground"
              />
            </Dropdown>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
