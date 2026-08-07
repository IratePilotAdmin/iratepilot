import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/mobile/push-token/route.ts");
const migration = read("supabase/migrations/202608060030_mobile_push_tokens.sql").toLowerCase();
const rollback = read("supabase/rollbacks/202608060030_mobile_push_tokens.rollback.sql").toLowerCase();
const client = read("mobile/src/lib/notifications.ts");
const navigation = read("mobile/src/components/NotificationNavigation.tsx");
const account = read("mobile/src/app/(tabs)/account.tsx");

describe("mobile booking notifications", () => {
  it("requires authentication and validates Expo tokens on register and removal", () => {
    expect(route).toContain("createRequestClient(request)");
    expect(route).toContain("supabase.auth.getUser()");
    expect(route).toContain('status: 401');
    expect(route).toContain("ExponentPushToken");
    expect(route).toContain("ExpoPushToken");
    expect(route).toContain('z.enum(["ios", "android"])');
  });

  it("keeps token mutations scoped to the authenticated owner", () => {
    expect(route).toContain("user_id: user.id");
    expect(route).toContain('.eq("user_id", user.id)');
    expect(route).toContain('{ onConflict: "expo_push_token" }');
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.mobile_push_tokens from anon");
  });

  it("requests permission explicitly and stores a token only after server acceptance", () => {
    expect(client).toContain("requestPermissionsAsync()");
    expect(client).toContain("Device.isDevice");
    expect(client.indexOf("if (!response.ok)")).toBeLessThan(client.indexOf("SecureStore.setItemAsync"));
    expect(account).toContain("Enable notifications");
    expect(account).toContain("disableBookingNotifications");
  });

  it("restricts notification taps to owned application routes", () => {
    expect(client).toContain('/^[0-9a-f-]{36}$/i');
    expect(client).toContain('"/(tabs)/trips"');
    expect(navigation).toContain("notificationRoute(data ?? {})");
    expect(navigation).not.toContain("data.url");
  });

  it("provides a data-preserving rollback guard", () => {
    expect(rollback).toContain("refusing rollback: public.mobile_push_tokens contains data");
    expect(rollback).toContain("drop table if exists public.mobile_push_tokens");
  });
});
