import type { Metadata } from "next";
import type { ReactElement } from "react";
import LegalPage, { Section } from "@/app/_legal/LegalPage";

export const metadata: Metadata = {
  title: "Trust",
  description:
    "How plumb handles student data end to end: where it flows, who processes it, what each role can see, and our compliance posture.",
  openGraph: {
    title: "Trust",
    description:
      "How plumb handles student data end to end: where it flows, who processes it, what each role can see, and our compliance posture.",
  },
};

export default function TrustPage(): ReactElement {
  return (
    <LegalPage title="Trust" updated="Last updated July 2026">
      <p>
        Plumb Reflection (&ldquo;plumb&rdquo;, &ldquo;we&rdquo;) operates plumb, a
        classroom reflection tool for K-12 students. This page describes how the
        product actually treats student data — where it flows, who touches it, how
        long it stays, and what each person can see. It is a plain account of the
        shipped system, not a set of promises we can&rsquo;t keep. For the formal
        terms, see the{" "}
        <a
          className="text-ink-tint underline-offset-4 hover:underline"
          href="/privacy"
        >
          Privacy Policy
        </a>{" "}
        and{" "}
        <a
          className="text-ink-tint underline-offset-4 hover:underline"
          href="/terms"
        >
          Terms of Service
        </a>
        .
      </p>

      <Section heading="How your data flows">
        <p>
          A reflection follows one path, and it narrows at every step. A student
          writes text. Before that text leaves plumb for the AI model, known names
          and identifiers are stripped out. The model does two jobs — drafting
          reflection questions and classifying free text into structured categories —
          and returns structured output, not a verdict about the student.
        </p>
        <p>
          From that structured output, teachers see a short, task-focused summary of
          a class&rsquo;s reflections. They never see a student&rsquo;s raw
          transcript. The instrument moves from a student&rsquo;s own words, to
          de-identified text, to structure, to an aggregate a teacher can act on.
        </p>
      </Section>

      <Section heading="Who processes data (subprocessors)">
        <p>
          To run the service, plumb relies on a small set of vetted subprocessors.
          Each is bound by contract to protect the data and to use it only to provide
          their service to us.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Vercel</strong> — hosting and infrastructure that serves the
            application.
          </li>
          <li>
            <strong>Resend</strong> — transactional email used to deliver safety
            alerts to a school&rsquo;s designated adult.
          </li>
          <li>
            <strong>Anthropic</strong> — the AI model provider that drafts reflection
            questions and classifies free text. Known names and identifiers are
            stripped before any content is sent, and the provider does not train on
            student data.
          </li>
        </ul>
        <p>
          The current list is available on request. If we make a material change to
          our subprocessors, we will note it here.
        </p>
      </Section>

      <Section heading="Data retention">
        <p>
          Retention is configurable per school. There is no indefinite retention:
          reflection data is purged after the window a school sets, and we keep data
          only as long as needed to provide the service. A student can see their own
          reflection data on their timeline and delete it at any time — every
          reflection, summary, and graded result is permanently removed.
        </p>
      </Section>

      <Section heading="Roles and visibility">
        <p>
          Each role sees only what its job requires. Visibility narrows as it moves
          away from the student.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Student</strong> — sees their own reflections and results, in
            full.
          </li>
          <li>
            <strong>Teacher</strong> — sees task-focused summaries and class-level
            aggregates. No ranking of students, and never a raw reflection or
            study-chat transcript.
          </li>
          <li>
            <strong>Counselor</strong> — sees only the safety queue: the reflections
            a deterministic screen has flagged for a check-in.
          </li>
          <li>
            <strong>Administrator</strong> — sees usage counts and aggregate trends.
            Never student reflection content.
          </li>
        </ul>
      </Section>

      <Section heading="Safety">
        <p>
          A deterministic safety screen may flag concerning language in a
          student&rsquo;s writing and alert a designated adult at the school so a
          caring person can check in. No AI makes this call. Students are told plainly
          that a school adult will be notified — it is disclosed, not hidden.
        </p>
        <p>
          plumb is not a counseling or emergency service, and it is not a substitute
          for professional help. If you or someone you know is in crisis, contact
          local emergency services; in the U.S. you can call or text 988.
        </p>
      </Section>

      <Section heading="Compliance posture">
        <p>
          The commitments below describe how plumb is built and how we intend to
          operate. We frame them as posture, not as completed audits or
          certifications.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>FERPA</strong> — the school is the data controller; plumb acts as
            a processor on the school&rsquo;s instructions.
          </li>
          <li>
            <strong>COPPA</strong> — for students under 13, plumb asks for a parent or
            guardian&rsquo;s permission before a reflection begins, and honors
            retention limits.
          </li>
          <li>
            <strong>PPRA</strong> — reflection questions are task-focused. They are
            about the work, and are not designed to probe protected personal
            categories.
          </li>
          <li>
            <strong>Accessibility</strong> — we build toward WCAG 2.1 AA as our
            target.
          </li>
        </ul>
        <p>
          A signable data processing agreement, based on the SDPC template, is
          available on request.
        </p>
      </Section>

      <Section heading="Questions">
        <p>
          Questions for Plumb Reflection about any of the above? See our{" "}
          <a
            className="text-ink-tint underline-offset-4 hover:underline"
            href="/contact"
          >
            Contact
          </a>{" "}
          page.
        </p>
      </Section>
    </LegalPage>
  );
}
