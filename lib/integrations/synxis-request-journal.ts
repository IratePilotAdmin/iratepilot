import { createAdminClient } from "../supabase/admin";
import {
  SynxisRequestJournal,
  type SynxisJournalRpcClient,
} from "../../services/hotel-suppliers/synxis/request-journal";

export function createSynxisRequestJournal() {
  return new SynxisRequestJournal(
    createAdminClient() as unknown as SynxisJournalRpcClient,
  );
}
