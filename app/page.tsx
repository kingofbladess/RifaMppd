import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/session";

export default async function Home() {
  const s = await getSession();
  redirect(!s ? "/login" : homeFor(s.role));
}
