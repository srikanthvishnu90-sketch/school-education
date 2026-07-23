import type { Metadata } from "next";
import type { ReactElement } from "react";
import LegalPage, { Section } from "@/app/_legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How plumb handles student data: private by default, task-focused, never sold, with one narrow safety exception.",
  openGraph: {
    title: "Privacy Policy",
    description:
      "How plumb handles student data: private by default, task-focused, never sold, with one narrow safety exception.",
  },
};

export default function PrivacyPage(): ReactElement {
  return (
    <LegalPage title="Privacy Policy" updated="Last updated July 2026">
      <p>
        Plumb Reflection (&ldquo;plumb&rdquo;, &ldquo;we&rdquo;) operates plumb, a
        classroom reflection tool for K-12 students. This policy explains, in plain
        language, what we collect, where it goes, and the controls students, families,
        and schools have. It reflects how the product actually works — not generic
        boilerplate.
      </p>

      <Section heading="Our core commitment">
        <p>
          A student&rsquo;s reflection is private by default. Teachers see a short,
          task-focused summary of a class&rsquo;s reflections — never a student&rsquo;s
          raw chat. We do not sell student data, we do not use it for advertising, and
          we do not build advertising or behavioral profiles. Ever.
        </p>
      </Section>

      <Section heading="What we collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Account information</strong> — a school email address and role
            (student, teacher, counselor, or administrator), used only to sign you in.
          </li>
          <li>
            <strong>Reflections</strong> — what a student writes or selects when they
            reflect on a lesson, and the one next step they choose.
          </li>
          <li>
            <strong>Lesson context</strong> — what a teacher enters about a lesson,
            and any photos they attach.
          </li>
          <li>
            <strong>Graded results</strong> — a score a teacher records, shown to the
            student beside how sure they felt, to build accurate self-knowledge.
          </li>
        </ul>
      </Section>

      <Section heading="How AI is used, and how we protect you">
        <p>
          plumb uses an AI model (Anthropic&rsquo;s Claude) only as labor — to draft
          reflection questions and help a student think through a lesson. It never
          decides anything about a student, computes a grade, or makes a safety
          decision; those are deterministic and human-owned.
        </p>
        <p>
          Before any text is sent to the model, known names and identifiers are
          stripped out. The model provider processes this content as a subprocessor
          under a zero-data-retention assumption and does not train on it. When no AI
          key is configured, plumb runs entirely on its own deterministic engine.
        </p>
      </Section>

      <Section heading="Who can see what">
        <ul className="ml-5 list-disc space-y-1">
          <li>A student always sees their own reflections and results.</li>
          <li>
            A teacher sees a class-level summary and each student&rsquo;s task-focused
            reflection summary — never the raw reflection or study-chat transcript.
          </li>
          <li>
            An administrator sees usage counts and a record-of-access log — never
            student reflection content.
          </li>
          <li>Data is isolated per school district; one district never sees another.</li>
        </ul>
      </Section>

      <Section heading="The one safety exception">
        <p>
          If something a student writes signals a risk of self-harm, plumb routes an
          alert to the school&rsquo;s designated counselor so a caring adult can check
          in. This is the single exception to student-only privacy. It is deterministic
          (no AI decides it), it cannot be turned off by a consent setting, and the
          student is told plainly that a school adult will be notified. This reflects a
          school&rsquo;s duty of care.
        </p>
      </Section>

      <Section heading="Your rights and controls">
        <p>
          A student can delete all of their reflection data at any time from their
          timeline — every reflection, summary, and graded result is permanently
          removed, and consent is withdrawn. For students under 13, plumb asks for a
          parent or guardian&rsquo;s permission before a reflection begins, consistent
          with COPPA. Schools act as the data controller under FERPA; families should
          direct access, correction, and deletion requests through their school, or to
          us at the contact below.
        </p>
      </Section>

      <Section heading="Data retention and security">
        <p>
          Reflection data is encrypted at rest and in transit. Schools can configure a
          retention window after which reflection data is purged. We keep data only as
          long as needed to provide the service or as a school requires.
        </p>
      </Section>

      <Section heading="Data breach notification">
        <p>
          If Plumb Reflection discovers a security incident that affects student
          personal information, we will notify the affected school — the data
          controller under FERPA — without undue delay, so the school can meet its own
          notification obligations to families. We will share what we know about the
          incident, what was affected, and the steps we are taking, and we will
          cooperate with the school on investigation and remediation.
        </p>
      </Section>

      <Section heading="Service providers (subprocessors)">
        <p>
          To run the service, plumb relies on a small set of vetted subprocessors. Each
          is bound by contract to protect the data and to use it only to provide their
          service to us — never for their own purposes. Student data is never used to
          train third-party AI models.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Vercel</strong> — hosting and infrastructure that serves the
            application.
          </li>
          <li>
            <strong>Resend</strong> — transactional email used to deliver safety alerts
            to a school&rsquo;s designated counselor.
          </li>
          <li>
            <strong>Anthropic</strong> — the AI model provider that drafts reflection
            questions and classifies free text. Known names and identifiers are
            stripped before any content is sent, and the provider does not train on it.
          </li>
        </ul>
        <p>
          The current list is available on request and may change as the product
          evolves; we will note material changes here.
        </p>
      </Section>

      <Section heading="Changes and contact">
        <p>
          If this policy changes materially, we&rsquo;ll note it here with a new date.
          Questions for Plumb Reflection? See our <a className="text-ink-tint underline-offset-4 hover:underline" href="/contact">Contact</a> page.
        </p>
      </Section>
    </LegalPage>
  );
}
