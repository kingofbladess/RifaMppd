import "server-only";
import { supabaseAdmin } from "./supabase";

export type OperatorConfirmation = { participant_id: string; confirmed_at: string; confirmed_by_name: string };
export async function readOperatorConfirmations(ids: string[]) {
  const byId = new Map<string, OperatorConfirmation>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin().from("participant_operator_confirmations")
      .select("participant_id, confirmed_at, confirmed_by_name").in("participant_id", ids.slice(i, i + 200));
    // Un error nunca se interpreta como ausencia de confirmaciones.
    if (error) return { available: false, byId: new Map<string, OperatorConfirmation>() };
    for (const row of data ?? []) byId.set(row.participant_id, row);
  }
  return { available: true, byId };
}
