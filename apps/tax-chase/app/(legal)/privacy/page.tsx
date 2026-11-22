import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/lib/brand";

import { legal, LegalPage, type LegalSection } from "../legal-page";

export const metadata: Metadata = {
  title: `Privacy policy | ${BRAND.name}`,
  description: `What information ${BRAND.name} handles, why, and who can see it.`,
  robots: legal.isDraft ? { index: false, follow: false } : undefined,
};

const name = BRAND.name;

const sections: LegalSection[] = [
  {
    heading: "Who this covers",
    body: [
      `${name} is used by three groups of people, and this policy treats each one separately.`,
      [
        <>
          <strong className="text-foreground">Firms.</strong> Accounting, bookkeeping and tax firms
          that sign in and use {name} to collect W-9s for their clients.
        </>,
        <>
          <strong className="text-foreground">Vendors.</strong> People and businesses who are asked
          for a Form W-9 through a private link, because a firm&apos;s client paid them.
        </>,
        <>
          <strong className="text-foreground">Visitors.</strong> Anyone who reads our public pages
          or joins the early-access list.
        </>,
      ],
    ],
  },
  {
    heading: "What we collect",
    body: [
      "From firms:",
      [
        "The email address of each person who signs in, the firm's name, its reply-to address and its time zone.",
        "The client businesses the firm adds, and for each one its vendor list: names, email addresses, amounts paid, and whether the payments were for legal or medical services.",
        "A record of important actions, such as sending requests and downloading an export, with who did it and when.",
        "For a paid plan: the plan, the amount, the date and Stripe's reference for the payment. Stripe takes the payment on its own page. We never see or store card numbers.",
      ],
      "From vendors:",
      [
        "What Form W-9 asks for: name, business name, federal tax classification, exemption codes if any, address, and taxpayer identification number (a Social Security number or an employer identification number).",
        "The signature record: the name typed as the signature, the time, the network address and the browser used. The IRS expects an electronic W-9 to be signed and traceable to the person who signed it.",
        "Which request and reminder emails were sent to the vendor, whether an email bounced or was marked as spam, and whether the vendor turned reminders off.",
      ],
      "From visitors:",
      [
        "The email address you give us if you join the early-access list.",
        "Our hosting provider keeps ordinary request logs, which include network addresses.",
      ],
      `We use one cookie, which keeps a firm user signed in. ${name} has no advertising cookies and no analytics trackers. To stop abuse of the sign-in and sign-up forms we count attempts for a short time, using a scrambled form of the email or network address that cannot be turned back into the original.`,
    ],
  },
  {
    heading: "How we use it",
    body: [
      "We use this information to run the service and for nothing else:",
      [
        "to send W-9 requests and reminders on a firm's behalf, and to stop when a vendor has answered or asked us to stop;",
        "to show a firm which W-9s have arrived, and to produce the export it uses for 1099 filing;",
        "to sign firm users in, take payment for plans, and answer support questions;",
        "to keep the service secure, find faults and prevent abuse;",
        "to tell firms about changes to the service, and to write to people on the early-access list about their account.",
      ],
      "We do not sell personal information. We do not use it for advertising. We do not use taxpayer identification numbers for anything except delivering them to the firm that asked for them.",
    ],
  },
  {
    heading: "If you are a vendor",
    body: [
      `When you fill in a W-9 through ${name}, we hold it on behalf of the firm that asked for it and the business that paid you, both of which are named on your form page. They decide how your W-9 is used, and they need it to meet their tax reporting duties.`,
      [
        "To correct a mistake, open your private link again and send the form again. The newest one replaces the earlier one.",
        "To stop reminder emails, use the link at the bottom of any of them.",
        "To see your form, or to ask for it to be removed, contact the firm that asked for it. If you write to us instead, we will pass your request to that firm.",
      ],
      "Your taxpayer identification number is never shown in full on a web page, to you or to anyone else. The firm sees only its last four digits on screen.",
    ],
  },
  {
    heading: "Who we share it with",
    body: [
      [
        "The firm that asked for a W-9 receives it, including the full taxpayer identification number when it downloads the filing export. The firm shares it with its client and uses it to file information returns with the IRS and state tax agencies.",
        "Companies that run parts of the service for us and may handle information only to do that: Supabase (database and sign-in), Netlify (hosting), Resend (sending email) and Stripe (payments).",
        "Authorities, when the law requires it, or when it is needed to protect people or the service from harm or fraud.",
        "A buyer or successor, if the business is sold or merged. This policy would continue to apply to information already collected.",
      ],
      "We share it with nobody else.",
    ],
  },
  {
    heading: "How we protect it",
    body: [
      [
        "Taxpayer identification numbers are encrypted before they are stored, with a key that is kept apart from the database.",
        "Each firm's information is walled off from every other firm's. A firm user can reach only their own firm's clients and vendors.",
        "A vendor's private link is long and random, and we store only a fingerprint of it. It opens that vendor's form and nothing else.",
        "Every download of an export is recorded, including whether it carried full taxpayer identification numbers.",
        "All pages are served over an encrypted connection.",
      ],
      "No system is perfectly secure. If we learn that information held for a firm has been reached by someone who should not have it, we will tell that firm without undue delay, with what we know, so that it can meet its own duties.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      [
        "A firm's information, including the W-9s collected for it, is kept for as long as the firm keeps its account, so that a copy of any signed form can be produced when it is needed.",
        "When a firm removes a vendor, that vendor's details and W-9 are deleted from the service.",
        "When a firm asks us to close its account, we delete its information within 30 days. Copies in backups are overwritten as the backups expire.",
        "Payment records are kept for as long as tax and accounting law requires.",
        "Early-access emails are kept until you ask us to remove yours.",
      ],
    ],
  },
  {
    heading: "Your choices",
    body: [
      `Firm users can change their firm's details in settings, and can ask us to close the account and delete its information. Anyone on the early-access list can ask to be taken off it. Vendors should see "If you are a vendor" above.`,
      `Some state laws give people the right to see, correct or delete personal information held about them. Write to ${legal.contactEmail} and we will answer within 30 days, whichever state you live in. We will not treat you differently for asking.`,
    ],
  },
  {
    heading: "Where it is kept",
    body: [
      `${name} is run from the United States for businesses in the United States, and the information is stored there. It is not meant for people under 18.`,
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "If we change this policy we will post the new version here with a new date. If a change affects how firm or vendor information is used, we will email firms before it takes effect.",
    ],
  },
  {
    heading: "Contact",
    body: [`${legal.company}, ${legal.postalAddress}. Email ${legal.contactEmail}.`],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <p>
          {name} is run by {legal.company}. This page says what information the service handles,
          why, who can see it, and how long it is kept. The rules for using the service are in the{" "}
          <Link href="/terms" className="font-medium text-foreground underline underline-offset-2">
            terms
          </Link>
          .
        </p>
      }
      sections={sections}
    />
  );
}
