import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bookingMessagesRollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608020024_booking_messages.rollback.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

const unpaidCancellationRollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608020025_cancel_unpaid_confirmed_bookings.rollback.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

const mobilePushTokensRollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608060030_mobile_push_tokens.rollback.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

describe("production migration rollback scripts", () => {
  it("refuses to remove booking messages after customer data exists", () => {
    expect(bookingMessagesRollback).toContain(
      "refusing rollback: public.booking_messages contains data",
    );
    expect(bookingMessagesRollback).toContain(
      "drop function if exists public.send_booking_message(uuid, text)",
    );
    expect(bookingMessagesRollback).toContain(
      "drop table if exists public.booking_messages",
    );
  });

  it("removes only the unpaid-cancellation function for migration 025", () => {
    expect(unpaidCancellationRollback).toContain(
      "drop function if exists public.cancel_unpaid_confirmed_booking(uuid, text)",
    );
    expect(unpaidCancellationRollback).not.toContain("drop table");
  });

  it("refuses to remove registered mobile devices before rolling back migration 030", () => {
    expect(mobilePushTokensRollback).toContain(
      "refusing rollback: public.mobile_push_tokens contains data",
    );
    expect(mobilePushTokensRollback).toContain(
      "drop table if exists public.mobile_push_tokens",
    );
  });
});
