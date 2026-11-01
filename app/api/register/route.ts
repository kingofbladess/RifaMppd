import { registerParticipant } from "@/lib/register-participant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return registerParticipant(req);
}
