import "server-only";
import { supabaseAdmin } from "./supabase";

export type EligibilityList = { document_numbers: string[]; updated_at: string; updated_by: string };

export async function readEligibilityList(raffleId: string): Promise<EligibilityList | null> {
  const { data, error } = await supabaseAdmin().from("raffle_eligibility_lists")
    .select("document_numbers, updated_at, updated_by").eq("raffle_id", raffleId).maybeSingle();
  if (error) throw new Error("No se pudo leer la lista de participantes de la rifa. Comprueba la conexión y que se haya aplicado supabase/eligibility.sql.");
  return data as EligibilityList | null;
}
