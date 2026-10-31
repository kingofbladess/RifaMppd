import { seeOther } from "@/lib/redirect";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const res = seeOther("/");
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
