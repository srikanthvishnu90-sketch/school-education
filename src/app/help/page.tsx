import type { Metadata } from "next";
import type { ReactElement } from "react";
import LegalPage, { Section } from "@/app/_legal/LegalPage";

export const metadata: Metadata = {
  title: "Help Center",
  description: "How plumb works for students and teachers, plus privacy and safety answers.",
  openGraph: {
    title: "Help Center",
    description: "How plumb works for students and teachers, plus privacy and safety answers.",
  },
};

export default function HelpPage(): ReactElement {
  return (
    <LegalPage title="Help Center">
      <p>
        Short answers to the questions students, teachers, and families ask most. For
        anything not covered here, reach us on the{" "}
        <a className="text-ink-tint underline-offset-4 hover:underline" href="/contact">Contact</a> page.
      </p>

      <Section heading="For students">
        <p>
          <strong>What is a reflection?</strong> After a lesson, plumb asks you a few
          questions about how it went and how it felt, one at a time. You finish by
          choosing one small next step. It takes a few minutes.
        </p>
        <p>
          <strong>Does this change my grade?</strong> No. Reflecting never changes your
          score. Your teacher sees a short summary, not your chat.
        </p>
        <p>
          <strong>Is what I write private?</strong> Yes — with one exception: if you
          write something that sounds like you might be in danger of hurting yourself, a
          caring adult at your school is told so you can get help. In an emergency, call
          or text 988 (U.S.).
        </p>
        <p>
          <strong>Can I delete my data?</strong> Yes. On your timeline, choose
          &ldquo;Delete my reflection data&rdquo; to remove everything tied to your
          account.
        </p>
      </Section>

      <Section heading="For teachers">
        <p>
          <strong>How do I start?</strong> Add a lesson — a few lines about what
          happened, and optionally photos of the board. plumb drafts a short reflection
          your students answer, and their responses come back as one class brief.
        </p>
        <p>
          <strong>What do I see?</strong> A class-level summary, each student&rsquo;s
          task-focused reflection summary, attention groups, and a suggested next step —
          never a student&rsquo;s raw chat, and never a ranking.
        </p>
        <p>
          <strong>Can I remove a lesson?</strong> Yes — open the lesson and choose
          &ldquo;Delete this lesson.&rdquo; Students&rsquo; own reflections stay on their
          timelines.
        </p>
      </Section>

      <Section heading="Privacy &amp; safety">
        <p>
          Read the full{" "}
          <a className="text-ink-tint underline-offset-4 hover:underline" href="/privacy">Privacy Policy</a>{" "}
          for how data is handled. In short: private by default, never sold, encrypted
          at rest, isolated per district, with one narrow safety exception for
          self-harm risk.
        </p>
      </Section>
    </LegalPage>
  );
}
