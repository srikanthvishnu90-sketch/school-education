import type { Metadata } from "next";
import type { ReactElement } from "react";
import LegalPage, { Section } from "@/app/_legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach plumb — support, privacy requests, and school inquiries.",
};

export default function ContactPage(): ReactElement {
  return (
    <LegalPage title="Contact">
      <p>
        We&rsquo;re a small team building plumb for schools. Here&rsquo;s how to reach
        the right place.
      </p>

      <Section heading="Support">
        <p>
          Trouble signing in or using plumb? Email{" "}
          <a className="text-ink-tint underline-offset-4 hover:underline" href="mailto:support@plumb.school">
            support@plumb.school
          </a>
          . If you&rsquo;re a student, the fastest help is usually your teacher or a
          school adult.
        </p>
      </Section>

      <Section heading="Privacy &amp; data requests">
        <p>
          For access, correction, or deletion of student data, email{" "}
          <a className="text-ink-tint underline-offset-4 hover:underline" href="mailto:privacy@plumb.school">
            privacy@plumb.school
          </a>
          . Because schools are the data controller under FERPA, families should also
          contact their school; we&rsquo;ll work with the district to fulfill the
          request.
        </p>
      </Section>

      <Section heading="Schools &amp; districts">
        <p>
          Evaluating plumb for a school or district, or need a Data Processing
          Agreement? Email{" "}
          <a className="text-ink-tint underline-offset-4 hover:underline" href="mailto:schools@plumb.school">
            schools@plumb.school
          </a>
          .
        </p>
      </Section>

      <Section heading="A safety note">
        <p>
          plumb is not a crisis service. If you or someone you know may be in immediate
          danger, contact local emergency services now. In the U.S., you can call or
          text <strong>988</strong> for the Suicide &amp; Crisis Lifeline.
        </p>
      </Section>
    </LegalPage>
  );
}
