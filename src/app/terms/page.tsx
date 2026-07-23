import type { Metadata } from "next";
import type { ReactElement } from "react";
import LegalPage, { Section } from "@/app/_legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using plumb, a classroom reflection tool for K-12 schools.",
  openGraph: {
    title: "Terms of Service",
    description: "The terms for using plumb, a classroom reflection tool for K-12 schools.",
  },
};

export default function TermsPage(): ReactElement {
  return (
    <LegalPage title="Terms of Service" updated="Last updated July 2026">
      <p>
        These terms govern use of plumb, a classroom reflection tool operated by Plumb
        Reflection (&ldquo;plumb&rdquo;, &ldquo;we&rdquo;). By signing in you agree to
        them. plumb is provided to schools and districts; individual students and staff
        use it under their school&rsquo;s agreement.
      </p>

      <Section heading="Who may use plumb">
        <p>
          plumb is for use by students and staff of a subscribing school or district.
          Students under 13 need a parent or guardian&rsquo;s permission, which the
          product collects before a reflection begins. You agree to keep your sign-in
          credentials confidential and to use plumb only for its educational purpose.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <ul className="ml-5 list-disc space-y-1">
          <li>Use plumb for honest reflection and teaching — not to harass, impersonate, or harm.</li>
          <li>Don&rsquo;t attempt to access another student&rsquo;s or district&rsquo;s data.</li>
          <li>Don&rsquo;t attempt to break, overload, or reverse-engineer the service.</li>
        </ul>
      </Section>

      <Section heading="What plumb is — and isn't">
        <p>
          plumb helps a student build accurate self-knowledge and gives teachers
          task-focused evidence. It is a reflection and learning-support tool. It is
          <strong> not</strong> a diagnostic, clinical, or crisis-counseling service. If
          a reflection signals risk, plumb routes an alert to a school adult, but it is
          not a substitute for professional help or emergency services. In an
          emergency, contact local emergency services; in the U.S. you can call or text
          988.
        </p>
      </Section>

      <Section heading="How plumb uses AI">
        <p>
          plumb uses AI as labor, not judgment. It helps <strong>draft</strong>{" "}
          reflection questions and <strong>classify</strong> free-text responses into
          structured categories. A teacher reviews and approves the questions before any
          student sees them. AI drafts and classifies; people own every decision — it
          never decides grades, interventions, or safety outcomes.
        </p>
        <p>
          AI can be wrong and can produce imperfect drafts. Its outputs are a starting
          point for a person&rsquo;s judgment, not authoritative determinations. Schools
          and teachers remain responsible for instructional decisions.
        </p>
        <p>
          plumb is an academic reflection instrument. It is <strong>not</strong> a
          medical, psychological, diagnostic, or crisis-counseling service, and it is not
          a substitute for a counselor, professional help, or emergency services, as
          described under &ldquo;What plumb is — and isn&rsquo;t&rdquo; above. A
          deterministic safety screen may flag concerning language and route an alert to
          a designated school adult; this is a safety measure, not clinical advice.
        </p>
      </Section>

      <Section heading="Data and privacy">
        <p>
          Our handling of student data is described in the{" "}
          <a className="text-ink-tint underline-offset-4 hover:underline" href="/privacy">Privacy Policy</a>,
          which is part of these terms. Schools are the data controller; plumb is a
          processor acting on the school&rsquo;s instructions.
        </p>
      </Section>

      <Section heading="Availability and changes">
        <p>
          We work to keep plumb available and accurate, but it is provided
          &ldquo;as is&rdquo; without warranties. We may update the service and these
          terms; material changes will be dated here. Your school&rsquo;s written
          agreement with us governs where it differs from these terms.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms? Reach Plumb Reflection through our{" "}
          <a className="text-ink-tint underline-offset-4 hover:underline" href="/contact">Contact</a> page.
        </p>
      </Section>
    </LegalPage>
  );
}
