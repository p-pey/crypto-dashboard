type TEtf = {
  id: string;
  name: string;
};

export class Etf {
  private readonly BTC_ETFS: TEtf[] = [];
  private readonly ETH_ETFS: TEtf[] = [
    {
      id: "ETHA",
      name: "iShares Ethereum Trust ETF",
    },
    {
      id: "ETHE",
      name: "Grayscale Ethereum Trust ETF",
    },
    {
      id: "FETH",
      name: "Fidelity Ethereum Fund",
    },
    {
      id: "ETH",
      name: "Grayscale Ethereum Mini Trust ETF",
    },
    {
      id: "ETHW",
      name: "Bitwise Ethereum ETF",
    },
    {
      id: "ETHV",
      name: "VanEck Ethereum ETF",
    },
    {
      id: "EZET",
      name: "Franklin Ethereum ETF",
    },
    {
      id: "EETH",
      name: "ProShares Ether ETF",
    },
    {
      id: "QETH",
      name: "Invesco Galaxy Ethereum ETF",
    },
    {
      id: "CETH",
      name: "21Shares Core Ethereum ETF",
    },
    {
      id: "FUT",
      name: "VanEck Ethereum Strategy ETF",
    },
    {
      id: "ARKZ",
      name: "ARK 21Shares Active Ethereum Futures Strategy ETF",
    },
    {
      id: "AETH",
      name: "Bitwise Trendwise Ether and Treasuries Rotation Strategy ETF",
    },
  ] as const;
  private readonly SOL_ETFS: TEtf[] = [];
  private readonly XRP_ETFS: TEtf[] = [];
  private readonly DOGE_ETFS: TEtf[] = [];

  constructor() {
    this.BTC_ETFS = require("./etf.json").BTC;
    this.ETH_ETFS = require("./etf.json").ETH;
    this.SOL_ETFS = require("./etf.json").SOL;
    this.XRP_ETFS = require("./etf.json").XRP;
    this.DOGE_ETFS = require("./etf.json").DOGE;
  }
  public getAll() {
    return [
      ...this.BTC_ETFS,
      ...this.ETH_ETFS,
      ...this.SOL_ETFS,
      ...this.XRP_ETFS,
      ...this.DOGE_ETFS,
    ];
  }
  public getAllBtcEtf() {
    return this.BTC_ETFS;
  }
  public getAllEthEtf() {
    return this.ETH_ETFS;
  }
  public getAllSolEtf() {
    return this.SOL_ETFS;
  }
  public getAllXrpEtf() {
    return this.XRP_ETFS;
  }
  public getAllDogeEtf() {
    return this.DOGE_ETFS;
  }
  public getBTCEtf(etfId: string) {
    return this.BTC_ETFS.find((etf) => etfId === etf.id);
  }
  public getETHEf(etfId: string) {
    return this.ETH_ETFS.find((etf) => etfId === etf.id);
  }
  public getSOL_Etf(etfId: string) {
    return this.SOL_ETFS.find((etf) => etfId === etf.id);
  }
  public getXRP_Etf(etfId: string) {
    return this.XRP_ETFS.find((etf) => etfId === etf.id);
  }
  public getDogeEtf(etfId: string) {
    return this.DOGE_ETFS.find((etf) => etfId === etf.id);
  }
}
