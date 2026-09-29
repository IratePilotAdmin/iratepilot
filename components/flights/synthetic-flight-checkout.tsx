"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { SyntheticFlightOffer } from "@/lib/flights/synthetic-marketplace";

export function SyntheticFlightCheckout({ offer, confirmationHref }: { offer: SyntheticFlightOffer; confirmationHref: string }) {
  const [complete, setComplete] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setComplete(true);
  }
  if (complete) return <section className="border border-emerald-400 bg-emerald-50 p-7" role="status"><span className="section-kicker">Local simulation passed</span><h2 className="mt-3 text-3xl">The review flow completed without an external action.</h2><p className="mt-3 text-emerald-950">No passenger record was stored, no card data was requested, no payment was created, no airline order was submitted, and no ticket was issued.</p><Link href={confirmationHref} className="btn-primary mt-6 inline-flex">View synthetic receipt</Link></section>;
  return <form onSubmit={submit} className="grid gap-6" autoComplete="off">
    <div className="border border-amber-400 bg-amber-50 p-5 text-sm text-amber-950"><strong>Use fictional test information only.</strong><p className="mt-1">This browser-only form does not submit, persist, or transmit its values. Do not enter a real name, birth date, email address, passport, loyalty number, or payment information.</p></div>
    {Array.from({ length: offer.travelerCount }, (_, index) => <fieldset className="grid gap-4 border border-neutral-300 p-5 sm:grid-cols-2" key={index}><legend className="px-2 font-semibold">Test traveler {index + 1}</legend><label className="text-sm font-medium">First name<input className="input mt-2" autoComplete="off" defaultValue={`TEST${index + 1}`} maxLength={40} pattern="[A-Za-z -]+" required /></label><label className="text-sm font-medium">Last name<input className="input mt-2" autoComplete="off" defaultValue="TRAVELER" maxLength={40} pattern="[A-Za-z -]+" required /></label><label className="text-sm font-medium sm:col-span-2">Traveler type<select className="input mt-2" autoComplete="off" defaultValue="adult"><option value="adult">Adult test traveler</option></select></label></fieldset>)}
    <section className="border border-neutral-300 p-5"><h2 className="font-semibold">Payment boundary</h2><p className="mt-2 text-sm text-neutral-600">No card fields are rendered. A future approved flow must collect payment through a PCI-scoped provider, reconcile payment with the selected offer, and create exactly one airline order.</p></section>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="mt-1" /><span>I understand this is a local product simulation and does not create a reservation, payment, booking reference, or ticket.</span></label>
    <button className="btn-primary" type="submit">Run local checkout simulation</button>
  </form>;
}
