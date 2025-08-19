import { NextResponse, type NextRequest } from "next/server";

export default function middleware(req: NextRequest) {
       const currentTheme = req.cookies.get("theme");
       if (!currentTheme?.value) {
              req.cookies.set("theme", 'light')
       }
       return NextResponse.next();
}