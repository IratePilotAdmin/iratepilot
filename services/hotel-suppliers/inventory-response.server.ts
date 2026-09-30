import "server-only";

import type { InventorySupplierId } from "./inventory-readiness";

export type InventoryJsonValue =
  | null
  | boolean
  | number
  | string
  | InventoryJsonValue[]
  | { [key: string]: InventoryJsonValue };

export type InventoryResponseErrorCode =
  | "invalid_status"
  | "supplier_error"
  | "invalid_content_type"
  | "invalid_body"
  | "response_too_large"
  | "invalid_json"
  | "response_too_complex";

export class InventorySupplierResponseError extends Error {
  constructor(
    readonly supplierId: InventorySupplierId,
    readonly code: InventoryResponseErrorCode,
    readonly status?: number,
  ) {
    super(`Supplier response rejected (${supplierId}:${code}).`);
    this.name = "InventorySupplierResponseError";
  }
}

const jsonContentTypePattern = /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/i;
const maximumBodyBytes = 5_000_000;
const maximumDepth = 32;
const maximumNodes = 100_000;

function reject(
  supplierId: InventorySupplierId,
  code: InventoryResponseErrorCode,
  status?: number,
): never {
  throw new InventorySupplierResponseError(supplierId, code, status);
}

function validateComplexity(
  supplierId: InventorySupplierId,
  root: InventoryJsonValue,
) {
  const pending: Array<{ value: InventoryJsonValue; depth: number }> = [
    { value: root, depth: 0 },
  ];
  let visited = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    visited += 1;
    if (visited > maximumNodes || current.depth > maximumDepth) {
      reject(supplierId, "response_too_complex");
    }
    if (Array.isArray(current.value)) {
      current.value.forEach((value) => pending.push({ value, depth: current.depth + 1 }));
    } else if (current.value && typeof current.value === "object") {
      Object.values(current.value).forEach((value) => pending.push({
        value,
        depth: current.depth + 1,
      }));
    }
  }
}

export function parseInventorySupplierResponse(input: {
  supplierId: InventorySupplierId;
  status: number;
  contentType: string | null | undefined;
  body: string;
}): InventoryJsonValue {
  if (!Number.isSafeInteger(input.status) || input.status < 100 || input.status > 599) {
    reject(input.supplierId, "invalid_status");
  }
  if (input.status < 200 || input.status >= 300) {
    reject(input.supplierId, "supplier_error", input.status);
  }

  const contentType = input.contentType?.split(";", 1)[0]?.trim() ?? "";
  if (!jsonContentTypePattern.test(contentType)) {
    reject(input.supplierId, "invalid_content_type", input.status);
  }
  if (!input.body.trim()) {
    reject(input.supplierId, "invalid_body", input.status);
  }
  if (Buffer.byteLength(input.body, "utf8") > maximumBodyBytes) {
    reject(input.supplierId, "response_too_large", input.status);
  }

  let parsed: InventoryJsonValue;
  try {
    parsed = JSON.parse(input.body) as InventoryJsonValue;
  } catch {
    reject(input.supplierId, "invalid_json", input.status);
  }
  if (!parsed || typeof parsed !== "object") {
    reject(input.supplierId, "invalid_body", input.status);
  }
  validateComplexity(input.supplierId, parsed);
  return parsed;
}
