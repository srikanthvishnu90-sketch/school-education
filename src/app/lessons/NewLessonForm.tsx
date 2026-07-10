"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import {
  createLessonReflection,
  type NewLessonInput,
} from "@/app/_world/teacherReflectionActions";
import type { LessonType } from "@/domain/intelligence/lesson";

/**
 * The teacher's lesson entry. A few lines about what happened in class is enough;
 * the AI reads it and drafts the reflection. No pre-assessment, no scoring here —
 * just the seed the whole loop grows from.
 */

const LESSON_TYPES: { value: LessonType; label: string }[] = [
  { value: "direct_instruction", label: "Direct instruction" },
  { value: "discussion", label: "Discussion" },
  { value: "group_work", label: "Group work" },
  { value: "independent_practice", label: "Independent practice" },
  { value: "lab", label: "Lab" },
  { value: "presentation", label: "Presentation" },
  { value: "project", label: "Project" },
  { value: "review", label: "Review" },
  { value: "assessment_prep", label: "Assessment prep" },
  { value: "other", label: "Other" },
];

export default function NewLessonForm(): ReactElement {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [lessonType, setLessonType] = useState<LessonType>("direct_instruction");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(): void {
    setError(null);
    const input: NewLessonInput = { title, lessonType, content };
    startTransition(async () => {
      try {
        const reflectionId = await createLessonReflection(input);
        router.push(`/lessons/${reflectionId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="rounded-card border border-ink-wash bg-white p-6">
      <label className="block text-[13px] font-medium text-ink-black" htmlFor="title">
        Lesson title
      </label>
      <input
        id="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Factoring quadratic equations"
        className="mt-2 w-full rounded-control border border-ink-wash bg-white px-3 py-2 text-[15px] text-ink-black outline-none focus:border-ink-tint"
      />

      <label className="mt-5 block text-[13px] font-medium text-ink-black" htmlFor="type">
        What kind of class was it?
      </label>
      <select
        id="type"
        value={lessonType}
        onChange={(e) => setLessonType(e.target.value as LessonType)}
        className="mt-2 w-full rounded-control border border-ink-wash bg-white px-3 py-2 text-[15px] text-ink-black outline-none focus:border-ink-tint"
      >
        {LESSON_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <label className="mt-5 block text-[13px] font-medium text-ink-black" htmlFor="content">
        What happened in class?
      </label>
      <p className="mt-1 text-[13px] text-secondary">
        A few lines is plenty — what you taught, what students did, where it got hard.
      </p>
      <textarea
        id="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder="I modeled three examples, then students factored six on their own. The sign on the middle term tripped a lot of them up."
        className="mt-2 w-full resize-none rounded-control border border-ink-wash bg-white px-3 py-2 text-[15px] leading-relaxed text-ink-black outline-none focus:border-ink-tint"
      />

      {error !== null ? (
        <p className="mt-3 text-[13px] text-ink-black">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={pending || title.trim().length === 0 || content.trim().length === 0}
        onClick={submit}
        className="mt-5 rounded-control bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-40"
      >
        {pending ? "Reading the lesson…" : "Create reflection"}
      </button>
    </div>
  );
}
