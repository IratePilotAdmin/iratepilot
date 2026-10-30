import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { expediaB2cLaunchRequirements } from "@/lib/expedia-rapid/b2c-launch-requirements";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };
const requirementCodes = new Set(
  expediaB2cLaunchRequirements.flatMap((section) =>
    section.requirements.map((requirement) => requirement.code),
  ),
);
const receiptSchema = z.object({
  requirementCode: z.string().refine((code) => requirementCodes.has(code), "Unknown requirement code."),
  decision: z.enum(["verified", "not_applicable", "pending"]),
  evidenceReference: z.string().trim().max(500).optional().default(""),
  verificationNotes: z.string().trim().max(1000).optional().default(""),
  confirmation: z.literal("RECORD EXPEDIA SITE REVIEW EVIDENCE"),
}).superRefine((value, context) => {
  if (value.decision === "verified" && value.evidenceReference.length < 3) {
    context.addIssue({ code: "custom", path: ["evidenceReference"], message: "Verified requirements need an evidence reference." });
  }
  if (value.decision !== "verified" && value.verificationNotes.length < 3) {
    context.addIssue({ code: "custom", path: ["verificationNotes"], message: "Pending or not-applicable requirements need review notes." });
  }
});

function deploymentRevision() {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return revision && /^[a-f0-9]{7,64}$/i.test(revision) ? revision : null;
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  }

  const { data, error } = await createAdminClient()
    .from("expedia_b2c_site_review_receipts")
    .select("id,requirement_code,decision,evidence_reference,verification_notes,reviewed_at,deployment_revision")
    .order("reviewed_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Expedia site-review evidence could not be loaded." }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  const latestByRequirement = new Map<string, (typeof data)[number]>();
  for (const receipt of data ?? []) {
    if (!latestByRequirement.has(receipt.requirement_code)) {
      latestByRequirement.set(receipt.requirement_code, receipt);
    }
  }

  return NextResponse.json({ receipts: [...latestByRequirement.values()] }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  }

  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid site-review evidence." }, {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  const reviewedAt = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("expedia_b2c_site_review_receipts")
    .insert({
      requirement_code: parsed.data.requirementCode,
      decision: parsed.data.decision,
      evidence_reference: parsed.data.evidenceReference || null,
      verification_notes: parsed.data.verificationNotes || null,
      reviewed_by: auth.user.id,
      reviewed_at: reviewedAt,
      deployment_revision: deploymentRevision(),
    })
    .select("id,requirement_code,decision,evidence_reference,verification_notes,reviewed_at,deployment_revision")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Expedia site-review evidence could not be recorded." }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  return NextResponse.json({ receipt: data }, { headers: noStoreHeaders });
}
