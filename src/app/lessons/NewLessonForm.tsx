"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { createLessonReflection } from "@/app/_world/teacherReflectionActions";
import type { NewLessonInput } from "@/app/_world/teacherReflectionActions";
import type { LessonType } from "@/domain/intelligence/lesson";

/** Keep in sync with lessonMedia.MAX_PHOTOS (server enforces the real cap). */
const MAX_PHOTOS = 6;

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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function NewLessonForm(): ReactElement {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [lessonType, setLessonType] = useState<LessonType>("direct_instruction");
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function addPhotos(files: FileList | null): Promise<void> {
    if (files === null) return;
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    const urls = await Promise.all(images.map(readAsDataUrl));
    setPhotos((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS));
  }

  function removePhoto(index: number): void {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function submit(): void {
    setError(null);
    const input: NewLessonInput = { title, lessonType, content, photos };
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

      <label className="mt-5 block text-[13px] font-medium text-ink-black">
        Photos of the day (optional)
      </label>
      <p className="mt-1 text-[13px] text-secondary">
        Board work, an anchor chart, student work — up to {MAX_PHOTOS}.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Lesson photo ${i + 1}`}
              className="h-20 w-20 rounded-control border border-ink-wash object-cover"
            />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-ink-wash bg-white text-[12px] leading-none text-ink-black shadow-sm hover:border-ink-tint"
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-control border border-dashed border-ink-wash text-[13px] text-secondary transition-colors hover:border-ink-tint hover:text-ink-tint">
            + Add
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

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
