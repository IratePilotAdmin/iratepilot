import type { Managed104Target } from "./manage-flight-consumer-stripe-test-journal-104.mjs";

export type Managed104RenderPhase = "preflight" | "verification";

export function parseRenderArgs(argv: string[]): Readonly<{
  target: Managed104Target;
  phase: Managed104RenderPhase;
}>;

export function renderManagedSql(options: {
  target: Managed104Target;
  phase: Managed104RenderPhase;
  artifacts?: Readonly<Record<
    "preflight" | "migration" | "verification" | "rollback",
    Buffer
  >>;
}): Buffer;

export function main(argv?: string[]): void;
