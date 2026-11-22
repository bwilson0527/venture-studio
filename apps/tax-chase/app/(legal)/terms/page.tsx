import { formatUsd, PLANS } from "@studio/core/billing";
import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/lib/brand";

import { legal, LegalPage, type LegalSection } from "../legal-page";

export const metadata: Metadata = {
  title: `Terms of service | ${BRAND.name}`,
  description: `The rules for using ${BRAND.name}.`,
  robots: legal.isDraft ? { index: false, follow: false } : undefined,
};

const name = BRAND.name;
const season = formatUsd(PLANS.season.priceCents);
const firm = formatUsd(PLANS.firm.priceCents);

const sections: LegalSection[] = [
  {
    heading: "The agreement",
    body: [
      `These terms are an agreement between ${legal.company} ("we") and the firm that uses ${name} ("you"). You accept them when you create an account or use the service. If you do so for a firm, you confirm that you are allowed to accept them for that firm.`,
      "Vendors who only fill in a W-9 through a private link do not need an account and are not charged anything. The privacy policy explains how their information is handled.",
    ],
  },
  {
    heading: "What the service does, and what it does not",
    body: [
      `${name} asks the vendors of your client businesses for a Form W-9, reminds them until it arrives, keeps the signed forms, and gives you a list to use for 1099 filing.`,
      [
        `${name} is not a tax, legal or accounting advisor. The 1099 column is a first sort to work from. The decision about who receives a 1099, and for how much, is yours.`,
        `${name} does not file returns with the IRS or any state.`,
        `${name} checks that a taxpayer identification number is validly formed. It does not match names and numbers against IRS records.`,
        "You are responsible for reviewing what vendors submit before you rely on it.",
      ],
    ],
  },
  {
    heading: "Your account",
    body: [
      "People sign in with a code sent to their email address, so keep those mailboxes secure. You are responsible for what is done in your firm's account. Give us accurate details and keep them up to date. The service is for businesses, and users must be at least 18.",
    ],
  },
  {
    heading: "Your responsibilities toward vendors",
    body: [
      "When you add a vendor and send a request, you confirm that:",
      [
        "your firm or its client has a real business reason to ask that vendor for a Form W-9;",
        "you are allowed to give us the vendor's name, email address and payment details for that purpose;",
        "you will use what vendors submit only for tax reporting and related record keeping, and not for marketing;",
        "you will handle exported files, which can contain full taxpayer identification numbers, lawfully and as carefully as the forms themselves. Once a file is downloaded, protecting it is up to you.",
      ],
      "Requests and reminders go out by email in your firm's name, with your reply-to address. We may stop emailing an address that bounces or reports our email as spam, and we may pause sending for an account that draws complaints.",
    ],
  },
  {
    heading: "Your data",
    body: [
      <>
        The information you add and the forms your vendors submit belong to you and your clients,
        not to us. We handle them as your service provider, only to provide the service, as set out
        in the{" "}
        <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">
          privacy policy
        </Link>
        . We do not sell that information or use it for our own marketing.
      </>,
      "We keep administrative, technical and physical safeguards that are appropriate to the sensitivity of taxpayer information, including encrypting taxpayer identification numbers and keeping each firm's information separate. If we learn that your information has been reached by someone who should not have it, we will tell you without undue delay and give you what we know.",
      "You can download your data at any time while your account is open. Keep your own copies of what you need for filing.",
    ],
  },
  {
    heading: "Plans and payment",
    body: [
      [
        "The free plan covers one client business and up to 10 vendors.",
        `Paid plans are a single payment for one 1099 season: Season (${season}, up to ${PLANS.season.businessLimit} client businesses) and Firm (${firm}, up to ${PLANS.firm.businessLimit} client businesses), with no limit on vendors. The price and the tax year it covers are shown before you pay.`,
        "A paid plan is not a subscription. It does not renew and you are not charged again unless you buy again.",
        "Payment is taken by Stripe. Prices do not include any sales tax that may apply to your purchase.",
        `If the service is not right for your firm, write to us within ${legal.refundDays} days of paying and we will refund the payment. Your account then goes back to the free plan.`,
        "When a season ends you can still sign in and download what was collected. Collecting for a new tax year needs a plan for that year.",
      ],
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "You agree not to:",
      [
        "use the service to break the law, or to send requests to people you have no business reason to ask;",
        "try to reach another firm's information, or a vendor's form that is not yours to see;",
        "interfere with the service, probe it for weaknesses without our written permission, or copy data from it by automated means;",
        "resell the service or offer it to others under another name without our written permission.",
      ],
    ],
  },
  {
    heading: "Changes and availability",
    body: [
      `${name} is new and will change. We may add, change or remove features, and we will tell you ahead of a change that makes the service materially worse for a plan you have paid for. We work to keep the service running, but we do not promise that it will always be available or free of faults, so do not leave collection to the last days before a filing deadline.`,
    ],
  },
  {
    heading: "Ending the agreement",
    body: [
      "You can stop using the service at any time and ask us to close your account. We may suspend or close an account that breaks these terms or puts vendors, other firms or the service at risk, and we will give notice first where that is practical.",
      "After an account is closed you have 30 days to ask for a copy of your data, unless it was closed for abuse or the law prevents it. We then delete it as the privacy policy describes.",
    ],
  },
  {
    heading: "Disclaimers",
    body: [
      `To the extent the law allows, the service is provided "as is", without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose and non-infringement. We do not warrant that information submitted by vendors is accurate.`,
    ],
  },
  {
    heading: "Limit of liability",
    body: [
      "To the extent the law allows, neither side is liable to the other for indirect, incidental, special or consequential losses, or for lost profits, including tax penalties that arise from a filing decision. Our total liability for all claims connected with the service is limited to the greater of what you paid us in the 12 months before the claim arose and $100.",
    ],
  },
  {
    heading: "Claims caused by your use",
    body: [
      "If someone brings a claim against us because you sent requests you had no right to send, misused information obtained through the service, or otherwise broke these terms, you will cover our reasonable costs and losses from that claim.",
    ],
  },
  {
    heading: "Governing law",
    body: [
      `These terms are governed by the laws of the State of ${legal.state}, and disputes will be heard in the state or federal courts located there.`,
    ],
  },
  {
    heading: "Changes to these terms",
    body: [
      "If we change these terms we will post the new version here with a new date, and we will email firms before a material change takes effect. Using the service after that date means you accept the new terms.",
    ],
  },
  {
    heading: "Contact",
    body: [`${legal.company}, ${legal.postalAddress}. Email ${legal.contactEmail}.`],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro={
        <p>
          The rules for using {name}, in plain language. They cover what the service does, what you
          are responsible for, what a plan costs, and what happens if something goes wrong.
        </p>
      }
      sections={sections}
    />
  );
}
