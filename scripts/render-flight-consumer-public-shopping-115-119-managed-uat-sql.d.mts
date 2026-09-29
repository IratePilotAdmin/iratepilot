import type { Managed115119Target } from "./manage-flight-consumer-public-shopping-115-119-uat.mjs";

export type Managed115119RenderPhase = "preflight" | "verification";
export function parseRenderArgs(argv: string[]): Readonly<{
  target: Managed115119Target;
  phase: Managed115119RenderPhase;
}>;
export function renderManagedSql(options: Readonly<{
  target: Managed115119Target;
  phase: Managed115119RenderPhase;
  artifacts?: Readonly<Record<string, Buffer>>;
}>): Buffer;
export function main(argv?: string[]): void;
