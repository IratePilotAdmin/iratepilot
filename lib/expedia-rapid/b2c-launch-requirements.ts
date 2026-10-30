export type ExpediaB2cRequirementSection = {
  id: string;
  label: string;
  requirements: Array<{
    code: string;
    label: string;
    evidenceLabel?: string;
  }>;
};

export const expediaB2cLaunchRequirements: ExpediaB2cRequirementSection[] = [
  {
    id: "general",
    label: "General requirements",
    requirements: [
      { code: "GR1", label: "Use Expedia Group names and logos correctly" },
      { code: "GR2", label: "Display links to Expedia Group terms and conditions" },
      { code: "GR4", label: "Apply the correct merchant-of-record credit-card disclosures" },
      { code: "GR5", label: "Supply PCI compliance evidence when applicable" },
      { code: "GR10", label: "Restrict member-only deals to eligible travelers" },
    ],
  },
  {
    id: "search",
    label: "Search page",
    requirements: [
      { code: "SP1", label: "Collect and send each child age when children are included" },
    ],
  },
  {
    id: "availability",
    label: "Hotel and room availability",
    requirements: [
      { code: "AP1", label: "Show the bed type for every room" },
      { code: "AP2", label: "Clearly identify non-refundable rates" },
      { code: "AP3", label: "Display check-in and special check-in instructions" },
    ],
  },
  {
    id: "booking",
    label: "Booking page",
    requirements: [
      { code: "BP1", label: "Use SSL encryption for personal data" },
      { code: "BP2", label: "Repeat check-in and special check-in instructions" },
      { code: "BP3", label: "Clearly show cancellation terms and non-refundable status" },
      { code: "BP4", label: "Separate charges due at the property in the price breakdown" },
      { code: "BP5", label: "Show the total price with taxes and fees" },
      { code: "BP7", label: "Repeat the selected child ages" },
      { code: "BP8", label: "State when payment will be collected" },
      { code: "BP9", label: "Support applicable PSD2 requirements" },
      { code: "BP10", label: "Display the payment-processing location when Expedia is merchant of record" },
    ],
  },
  {
    id: "confirmation",
    label: "Confirmation page",
    requirements: [
      { code: "CP1", label: "Show the total price and taxes and fees when a breakdown is provided" },
    ],
  },
  {
    id: "email",
    label: "Confirmation email",
    requirements: [
      { code: "ER1", label: "Display itinerary IDs correctly" },
      { code: "ER2", label: "Clearly display customer support and online support links" },
      { code: "ER3", label: "Include the room bed type" },
      { code: "ER4", label: "Include check-in and special check-in instructions" },
      { code: "ER5", label: "Separate charges due at the property in the price breakdown" },
      { code: "ER6", label: "Show the total price with taxes and fees" },
    ],
  },
  {
    id: "technical",
    label: "Technical and sanctions",
    requirements: [
      { code: "TR1", label: "Send a unique affiliate reference ID with every booking" },
      { code: "TR2", label: "Send the traveler country code" },
      { code: "TR3", label: "Send required billing information" },
      { code: "TR3a", label: "Send the payor name" },
      { code: "TR3b", label: "Send the billing country" },
      { code: "TR3c", label: "Send the billing postal code" },
      { code: "TR4", label: "Send the customer email or a monitored mailbox" },
      { code: "TR5", label: "Send accurate traveler information" },
      { code: "TR5a", label: "Send the traveler name" },
      { code: "TR5b", label: "Send the traveler phone number" },
      {
        code: "TR6",
        label: "If multi-room bookings are supported, provide test booking and cancellation logs",
        evidenceLabel: "Evidence if supported",
      },
      { code: "TR7", label: "Implement Rapid error-handling recommendations" },
    ],
  },
];

export const expediaB2cRequirementCount = expediaB2cLaunchRequirements
  .reduce((total, section) => total + section.requirements.length, 0);

export const expediaB2cChecklistUrl =
  "https://a.travel-assets.com/documentation-hubs/prod/rapid/latest/en-US/resources/assets/B2C-SA-Requirement-List_2025_v2.docx";
