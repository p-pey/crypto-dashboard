import { AxiosService } from "@/lib/axios";
import { inject, injectable } from "tsyringe";

@injectable()
class EtfService {
       constructor(@inject(AxiosService) private _AxiosService: AxiosService) {
       };
       private async getAllEtfName() {
              const etfs = await import('../../data/etf.json');
              return [...etfs.BTC, etfs.ETH, ...etfs.SOL, ...etfs.XRP, ...etfs.DOGE];
       }
       async getAllEtfData() {
              const etfs = await this.getAllEtfName();
              const response = await Promise.all(etfs.map(etf => {
                     return this._AxiosService.get(
                            `https://query1.finance.yahoo.com/v8/finance/chart/${etf.id}`,
                     );
              }));
              return response.map(resp => resp.data);
       }
       getEtf(name: string) {
              return this._AxiosService.get(
                     `https://query1.finance.yahoo.com/v8/finance/chart/${name}`,
              );
       }
}

export { EtfService };

