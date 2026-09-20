"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  partnerRegistrationNextPath, partnerRegistrationSchema,
  type PartnerAcquisitionAttribution,
} from "@/lib/partner/acquisition";

export function PartnerRegistrationForm({ configured, attribution }: {
  configured: boolean;
  attribution?: PartnerAcquisitionAttribution;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(configured);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const registrationKey = useRef<string | null>(null);

  const nextPath = partnerRegistrationNextPath(attribution);
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

  useEffect(() => {
    if (!configured) return;
    let active = true;
    createClient().auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error && error.name !== "AuthSessionMissingError") {
        setMessage("We could not check your sign-in status. Please refresh before continuing.");
        return;
      }
      setSignedInEmail(data.user?.email || null);
      setCheckingAccount(false);
    }).catch(() => {
      if (active) setMessage("We could not check your sign-in status. Please refresh before continuing.");
    });
    return () => { active = false; };
  }, [configured]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || loading || checkingAccount) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = partnerRegistrationSchema.safeParse({
      propertyName: form.get("propertyName"), firstName: form.get("firstName"), lastName: form.get("lastName"),
      phone: form.get("phone"), countryCode: String(form.get("countryCode") || "").trim().toUpperCase(),
      region: form.get("region"), propertyType: form.get("propertyType"), roomCount: Number(form.get("roomCount")),
      continueOnboarding: form.get("continueOnboarding") === "on",
      ...(attribution ? { attribution } : {}),
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message || "Complete the required registration details.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data: identity, error: identityError } = await supabase.auth.getUser();
      if (identityError && identityError.name !== "AuthSessionMissingError") throw new Error("Your sign-in status could not be verified. Please try again.");
      registrationKey.current ??= crypto.randomUUID();
      let user = identity.user;
      if (!user) {
        const email = String(form.get("email") || "").trim();
        const password = String(form.get("password") || "");
        if (!email || email.length > 254 || password.length < 8) throw new Error("Enter a valid email and a password of at least 8 characters.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            data: {
              full_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
              partner_onboarding_registration: parsed.data,
              partner_onboarding_registration_key: registrationKey.current,
            },
          },
        });
        const passwordInput = formElement.elements.namedItem("password");
        if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
        if (error) throw error;
        if (!data.session) {
          setConfirmationEmail(email);
          return;
        }
        user = data.user;
      }
      setSignedInEmail(user?.email || null);
      if (!user?.email_confirmed_at) throw new Error("Confirm your account email before creating your property draft. Then sign in to continue.");
      const response = await fetch("/api/partner/registration", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationKey: registrationKey.current, registration: parsed.data }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Your registration could not be saved. Your entered details remain here; please retry.");
      if (!body?.draft || typeof body.draft.id !== "string") throw new Error("Your draft could not be confirmed. Sign in to check your applicant workspace before retrying.");
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registration could not be completed. Your details remain here.");
    } finally {
      setLoading(false);
    }
  }

  if (!configured) return <div className="border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-950"><h2 className="text-xl">Partner recruitment is not yet open.</h2><p className="mt-2">Registration is currently paused. No property information is collected on this page.</p><Link href="/partners" className="mt-3 inline-block font-semibold underline">Review the partner program</Link></div>;
  if (confirmationEmail) return <section role="status" className="border border-sky-200 bg-sky-50 p-5 text-sm leading-7 text-sky-950"><h2 className="text-2xl">Continue with your email.</h2><p className="mt-3">If confirmation is needed, check <strong className="break-all">{confirmationEmail}</strong> for the next step. After verification, sign in to continue. New-account registration details are retained with the account request.</p><p className="mt-3">After email verification, you can sign in on another device to resume. The confirmation link may need to be opened in the browser where you registered.</p><p className="mt-3">Already have an account? Sign in with that email to create or resume a property draft. This step does not submit or approve an application.</p><Link href={loginHref} className="btn-secondary mt-5">Sign in to continue</Link></section>;

  return <form onSubmit={submit} className="grid gap-6">
    {checkingAccount ? <p role="status" className="text-sm text-neutral-600">Checking sign-in status…</p> : null}
    {signedInEmail ? <p className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">Signed in as <strong className="break-all">{signedInEmail}</strong>. This property will belong to this verified account. To use another account, sign out before returning.</p> : <p className="text-sm">Already have an account? <Link href={loginHref} className="font-semibold underline">Sign in to continue</Link></p>}
    <fieldset disabled={loading || checkingAccount} className="grid min-w-0 gap-5 disabled:opacity-60">
      <legend className="sr-only">Property and business contact details</legend>
      <label className="grid gap-2 text-sm font-medium">Property name<input name="propertyName" className="input" autoComplete="organization" minLength={2} maxLength={160} required /></label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">First name<input name="firstName" className="input" autoComplete="given-name" minLength={2} maxLength={50} required /></label>
        <label className="grid gap-2 text-sm font-medium">Last name<input name="lastName" className="input" autoComplete="family-name" minLength={2} maxLength={50} required /></label>
      </div>
      {signedInEmail ? null : <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">Business email<input name="email" className="input" type="email" autoComplete="email" maxLength={254} required /></label>
        <label className="grid gap-2 text-sm font-medium">Create password<input name="password" className="input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /><span className="text-xs font-normal text-neutral-500">At least 8 characters.</span></label>
      </div>}
      <label className="grid gap-2 text-sm font-medium">Business phone<input name="phone" className="input" type="tel" autoComplete="tel" minLength={7} maxLength={30} required /></label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">Country code<input name="countryCode" className="input uppercase" autoComplete="country" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" defaultValue="US" aria-describedby="country-code-help" required /><span id="country-code-help" className="text-xs font-normal text-neutral-500">Two letters, such as US, CA, or GB.</span></label>
        <label className="grid gap-2 text-sm font-medium">State or region<input name="region" className="input" autoComplete="address-level1" maxLength={100} /></label>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">Property type<select name="propertyType" className="input" defaultValue="hotel" required><option value="hotel">Hotel</option><option value="resort">Resort</option><option value="vacation_home">Vacation home</option></select></label>
        <label className="grid gap-2 text-sm font-medium">Number of rooms<input name="roomCount" className="input" type="number" inputMode="numeric" min={1} max={10000} step={1} required /></label>
      </div>
      <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 h-4 w-4 shrink-0" name="continueOnboarding" type="checkbox" required /><span>I want to create a private property draft and continue the onboarding application. I understand that the property must meet iRatePilot’s 4- or 5-star eligibility and verification requirements.</span></label>
    </fieldset>
    {message ? <p role="alert" className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{message}</p> : null}
    <button type="submit" className="btn-primary min-h-12 disabled:cursor-not-allowed disabled:opacity-50" disabled={loading || checkingAccount}>{loading ? "Saving registration…" : signedInEmail ? "Create property draft" : "Create account and continue"}</button>
    <p className="text-xs leading-6 text-neutral-500">This application does not grant additional hotel operating access. Please do not provide guest information, identity documents, banking details, or hotel-system credentials.</p>
  </form>;
}
