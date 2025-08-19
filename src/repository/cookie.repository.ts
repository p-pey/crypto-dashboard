import { injectable } from "tsyringe";

@injectable()
class CookieRepository {
       constructor(private _Cookies: Cookies) {

       }

}


