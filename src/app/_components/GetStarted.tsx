"use client";

import Image from "next/image";
import { useState, type ReactElement } from "react";

/**
 * The "Get Started" surface, in the Palantir demo-request register: a dark split
 * panel — a faded full-bleed frame on the left, a bordered form on the right with
 * a breadcrumb, a large question headline, and underline-only fields under small
 * uppercase labels.
 *
 * Adapted to plumb's constraints: required markers use the warm accent, never red
 * (red/green are reserved and, here, avoided entirely as UI semantics). The copy
 * is task-focused — it asks who to reach, it makes no claim about the visitor.
 */

interface Field {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  full?: boolean;
}

const FIELDS: readonly Field[] = [
  { name: "firstName", label: "First name", type: "text", autoComplete: "given-name" },
  { name: "lastName", label: "Last name", type: "text", autoComplete: "family-name" },
  {
    name: "email",
    label: "Email address",
    type: "email",
    autoComplete: "email",
    full: true,
  },
  { name: "role", label: "Role", type: "text", autoComplete: "organization-title" },
  {
    name: "institution",
    label: "Institution",
    type: "text",
    autoComplete: "organization",
  },
] as const;

export default function GetStarted(): ReactElement {
  const [sent, setSent] = useState(false);

  return (
    <section
      id="access"
      className="relative scroll-mt-16 border-t border-white/10 bg-[#050506]"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2">
        {/* Left promo panel — faded frame with a large ghosted line. */}
        <div className="relative hidden min-h-[560px] overflow-hidden border-r border-white/10 lg:block">
          <Image
            src="/landing/04-mind.png"
            alt=""
            fill
            sizes="50vw"
            className="object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#050506]/70 via-[#050506]/55 to-[#050506]/85" />
          <div className="relative flex h-full flex-col justify-end p-12">
            <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-white/45">
              Early access
            </p>
            <p className="mt-4 max-w-sm text-2xl font-medium leading-tight tracking-tight text-white/85">
              An instrument the student owns — evidence in, the next action out.
            </p>
          </div>
        </div>

        {/* Right form panel. */}
        <div className="px-6 py-16 sm:px-12 lg:py-20">
          <div className="mx-auto max-w-lg">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
              <span>Contact / Early access + pilot inquiry</span>
              <a
                href="#principles"
                className="inline-flex items-center gap-1 transition hover:text-white/80"
              >
                Our principles
                <span aria-hidden>↗</span>
              </a>
            </div>

            <h2 className="mt-10 text-balance text-3xl font-medium leading-[1.12] tracking-tight sm:text-4xl">
              Interested in bringing accurate self-knowledge to your learners?
            </h2>

            {sent ? (
              <div className="mt-12 rounded-xl border border-white/12 bg-white/[0.03] p-8">
                <div className="h-px w-12 bg-[#E0A06A]" />
                <p className="mt-5 text-lg font-medium tracking-tight">
                  Thank you — we have where to reach you.
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                  We&rsquo;ll follow up about an early-access pilot. No account is
                  created and nothing is shared until you say so.
                </p>
              </div>
            ) : (
              <form
                className="mt-12 grid grid-cols-1 gap-x-8 gap-y-9 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
              >
                {FIELDS.map((f) => (
                  <div
                    key={f.name}
                    className={f.full ? "sm:col-span-2" : undefined}
                  >
                    <label
                      htmlFor={f.name}
                      className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/55"
                    >
                      {f.label}
                      <span className="text-[#E0A06A]" aria-hidden>
                        *
                      </span>
                    </label>
                    <input
                      id={f.name}
                      name={f.name}
                      type={f.type}
                      required
                      autoComplete={f.autoComplete}
                      className="mt-3 w-full border-b border-white/20 bg-transparent pb-2 text-[15px] text-white outline-none transition focus:border-[#E0A06A]"
                    />
                  </div>
                ))}

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="mt-2 w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-[#050506] transition hover:bg-white/85 sm:w-auto sm:px-10"
                  >
                    Request access
                  </button>
                  <p className="mt-6 text-[13px] leading-relaxed text-white/40">
                    We use what you send only to reach you about a pilot. The
                    instrument stays with the student.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
