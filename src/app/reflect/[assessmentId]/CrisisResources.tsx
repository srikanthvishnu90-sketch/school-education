"use client";

import Link from "next/link";
import type { ReactElement } from "react";

/**
 * The crisis resource moment (P16). A calm, full-screen, task-neutral surface
 * shown when a crisis signal is detected in free text. It is a ROUTER to humans,
 * not a counselor: it offers real help lines and a plain, caring notice that a
 * school adult will be told. It asks no questions, gives no advice, runs no
 * chatbot, and can always be exited.
 */
export default function CrisisResources({
  onExit,
}: {
  onExit: () => void;
}): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper px-6">
      <div className="w-full max-w-lg">
        <p className="text-[15px] leading-relaxed text-ink-black" style={{ fontFamily: "var(--font-voice)" }}>
          It sounds like things are really heavy right now. You don&rsquo;t have to
          carry that alone, and reaching out is a strong thing to do.
        </p>

        <div className="mt-6 space-y-3">
          <a
            href="tel:988"
            className="block rounded-card border border-ink-wash bg-white px-5 py-4 transition-colors hover:border-ink-tint/50"
          >
            <span className="block text-[15px] font-medium text-ink-black">
              Call or text 988
            </span>
            <span className="mt-1 block text-[13px] text-secondary">
              988 Suicide &amp; Crisis Lifeline — free, confidential, any time.
            </span>
          </a>
          <a
            href="sms:741741&body=HOME"
            className="block rounded-card border border-ink-wash bg-white px-5 py-4 transition-colors hover:border-ink-tint/50"
          >
            <span className="block text-[15px] font-medium text-ink-black">
              Text HOME to 741741
            </span>
            <span className="mt-1 block text-[13px] text-secondary">
              Crisis Text Line — text with a trained counselor.
            </span>
          </a>
        </div>

        <p className="mt-6 text-[14px] leading-relaxed text-secondary">
          So you don&rsquo;t have to reach out by yourself, a caring adult at your
          school will be let know. They are there to help.
        </p>

        <div className="mt-8 flex items-center gap-5">
          <button
            type="button"
            onClick={onExit}
            className="rounded-control border border-ink-wash bg-white px-5 py-2.5 text-sm font-medium text-ink-black transition-colors hover:border-ink-tint/50"
          >
            Close
          </button>
          <Link
            href="/"
            className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
          >
            Leave for now
          </Link>
        </div>
      </div>
    </div>
  );
}
