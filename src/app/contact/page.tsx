import type { Metadata } from "next";
import type { ReactElement } from "react";
import LegalPage, { Section } from "@/app/_legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach plumb — support, privacy requests, and school inquiries.",
  openGraph: {
    title: "Contact",
    description: "How to reach plumb — support, privacy requests, and school inquiries.",
  },
};

/**
 * A single real contact address, configured per deployment via CONTACT_EMAIL. We
 * deliberately do NOT hard-code a mailbox: an unverified address that bounces is
 * the same broken promise as a dead link. Until CONTACT_EMAIL is set, the page
 * routes people honestly (through their school) instead of to a mailbox that
 * doesn't exist.
 */
const CONTACT_EMAIL = process.env.CONTACT_EMAIL;

function MailLink({ children }: { children: string }): ReactElement {
  return (
    <a
      className="text-ink-tint underline-offset-4 hover:underline"
      href={`mailto:${CONTACT_EMAIL}`}
    >
      {children}
    </a>
  );
}

export default function ContactPage(): ReactElement {
  return (
    <LegalPage title="Contact">
      <p>
        plumb is built for schools. Here&rsquo;s how to reach us.
      </p>

      {CONTACT_EMAIL !== undefined && CONTACT_EMAIL.length > 0 ? (
        <>
          <Section heading="Email us">
            <p>
              For support, privacy and data requests, or a school/district inquiry
              (including a Data Processing Agreement), email{" "}
              <MailLink>{CONTACT_EMAIL}</MailLink>. If you&rsquo;re a student, the
              fastest help is usually your teacher or a school adult.
            </p>
            <p>
              Because schools are the data controller under FERPA, families should
              also contact their school for access, correction, or deletion of
              student data — we&rsquo;ll work with the district to fulfill it.
            </p>
          </Section>
        </>
      ) : (
        <Section heading="Reaching us">
          <p>
            We&rsquo;re finalizing our public contact channels. In the meantime:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>Students &amp; staff</strong> — reach us through your school;
              your teacher or school admin can escalate to us.
            </li>
            <li>
              <strong>Families</strong> — for access, correction, or deletion of
              student data, contact your school (the data controller under FERPA);
              they coordinate the request with us.
            </li>
            <li>
              <strong>Schools &amp; districts</strong> evaluating plumb, including a
              Data Processing Agreement — we&rsquo;d welcome the conversation; a pilot
              starts with a single classroom.
            </li>
          </ul>
        </Section>
      )}

      <Section heading="A safety note">
        <p>
          plumb is not a crisis service. If you or someone you know may be in
          immediate danger, contact local emergency services now. In the U.S., you
          can call or text <strong>988</strong> for the Suicide &amp; Crisis Lifeline.
        </p>
      </Section>
    </LegalPage>
  );
}
