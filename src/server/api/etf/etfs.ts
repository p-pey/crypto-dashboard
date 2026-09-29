import etfJson from "./etf.json";

export type TEtf = {
  id: string;
  name: string;
};

export class Etf {
  private readonly BTC_ETFS: TEtf[];
  private readonly ETH_ETFS: TEtf[];
  private readonly SOL_ETFS: TEtf[];
  private readonly XRP_ETFS: TEtf[];
  private readonly DOGE_ETFS: TEtf[];

  constructor() {
    this.BTC_ETFS = etfJson.BTC;
    this.ETH_ETFS = etfJson.ETH;
    this.SOL_ETFS = etfJson.SOL;
    this.XRP_ETFS = etfJson.XRP;
    this.DOGE_ETFS = etfJson.DOGE;
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
