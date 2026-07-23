import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChatFlow from "@/app/chat/[reflectionId]/ChatFlow";
import type { ChatResult } from "@/app/_world/reflectionTypes";
import {
  selectReflectionAction,
  sendReflectionMessage,
} from "@/app/_world/reflectionActions";
import type { StudentInsightSummary } from "@/domain/intelligence";

vi.mock("@/app/_world/reflectionActions", () => ({
  selectReflectionAction: vi.fn(),
  sendReflectionMessage: vi.fn(),
}));

const initial: ChatResult = {
  kind: "question",
  sessionId: "session-1",
  stage: "overall",
  category: "technical",
  text: "Which moment is closest to what happened?",
  format: "rating",
  required: true,
};

const openQuestion: ChatResult = {
  kind: "question",
  sessionId: "session-1",
  stage: "technical",
  category: "technical",
  text: "What was the last step you could explain?",
  format: "short_response",
  required: false,
};

const NEXT_ACTION = "Try one similar example without notes.";
const summary: StudentInsightSummary = {
  id: "summary-1",
  studentId: "student-avery",
  reflectionId: "lesson-1",
  technicalSummary: "The student reported checking an example.",
  emotionalSummary: "The student reported feeling calm.",
  behavioralSummary: "The student reported checking their work.",
  relationshipSummary: "No strong relationship stood out.",
  recommendedActions: [NEXT_ACTION],
  studentFacingSummary: "You described how you approached today's task.",
  evidence: ["I checked the example."],
  confidenceLevel: "moderate",
  createdAt: new Date("2026-07-11T12:00:00.000Z"),
};

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatFlow", () => {
  it("renders an accessible, viewport-height dark conversation surface", () => {
    render(<ChatFlow initial={initial} />);

    expect(screen.getByRole("main", { name: "Reflection" })).toHaveClass(
      "h-[100svh]",
      "bg-chat-background",
      "text-chat-text",
    );
    expect(
      screen.getByRole("log", { name: "Reflection conversation" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Somewhat" })).toHaveClass(
      "min-h-11",
    );
    expect(screen.getByRole("button", { name: "I'm not sure" })).toBeVisible();
    expect(screen.getByRole("link", { name: "My courses" })).toHaveAttribute(
      "href",
      "/courses",
    );
    expect(
      screen.getByText(/your grade never changes/i),
    ).toBeInTheDocument();
  });

  it("sends a quick response and appends the next turn", async () => {
    vi.mocked(sendReflectionMessage).mockResolvedValue(openQuestion);

    render(<ChatFlow initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Somewhat" }));

    expect(sendReflectionMessage).toHaveBeenCalledWith("session-1", "Somewhat");
    await waitFor(() => {
      expect(
        screen.getByText("What was the last step you could explain?"),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText("Somewhat")).toHaveLength(1);
    expect(screen.getByLabelText("Message")).toHaveAttribute(
      "aria-describedby",
      "reflection-composer-hint",
    );
  });

  it("restores persisted history without duplicating the open question", () => {
    render(
      <ChatFlow
        initial={{
          ...openQuestion,
          history: [
            {
              id: "message-1",
              sender: "ai",
              text: "What was the last step you could explain?",
              category: "technical",
              createdAt: "2026-07-11T12:00:00.000Z",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getAllByText("What was the last step you could explain?"),
    ).toHaveLength(1);
  });

  it("offers a neutral skip path only for optional prompts", () => {
    const { rerender } = render(
      <ChatFlow key="optional" initial={openQuestion} />,
    );
    expect(
      screen.getByRole("button", { name: "Skip this optional question" }),
    ).toBeVisible();

    rerender(<ChatFlow key="required" initial={initial} />);
    expect(
      screen.queryByRole("button", { name: "Skip this optional question" }),
    ).not.toBeInTheDocument();
  });

  it("supports multi-select and submits the chosen observations together", async () => {
    vi.mocked(sendReflectionMessage).mockResolvedValue(openQuestion);
    render(
      <ChatFlow
        initial={{
          kind: "question",
          sessionId: "session-1",
          stage: "behavioral",
          category: "behavioral",
          text: "What did you do next?",
          format: "multi_select",
          required: false,
          options: ["Asked for help", "Used notes"],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Asked for help" }));
    fireEvent.click(screen.getByRole("button", { name: "Used notes" }));
    expect(
      screen.getByRole("button", { name: "Asked for help" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(sendReflectionMessage).toHaveBeenCalledWith(
      "session-1",
      "Asked for help, Used notes",
    );
    await screen.findByLabelText("Message");
  });

  it("restores a typed answer and explains when saving fails", async () => {
    vi.mocked(sendReflectionMessage).mockRejectedValue(new Error("offline"));
    render(<ChatFlow initial={openQuestion} />);

    const composer = screen.getByLabelText("Message");
    fireEvent.change(composer, {
      target: { value: "I checked the worked example first." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nothing was lost",
    );
    expect(composer).toHaveValue("I checked the worked example first.");
  });

  it("shows concrete support routes after a safety escalation", () => {
    render(
      <ChatFlow
        initial={{ kind: "safety", sessionId: "session-1", history: [] }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A counselor at your school has been notified",
    );
    expect(screen.getByRole("link", { name: "Call 988" })).toHaveAttribute(
      "href",
      "tel:988",
    );
    expect(screen.getByRole("link", { name: "Text 988" })).toHaveAttribute(
      "href",
      "sms:988",
    );
  });

  it("restores a previously saved next step on a completed reflection", () => {
    render(
      <ChatFlow
        initial={{
          kind: "summary",
          sessionId: "session-1",
          summary,
          selectedAction: NEXT_ACTION,
          history: [],
        }}
      />,
    );

    expect(screen.getByText("Your next step")).toBeInTheDocument();
    expect(screen.getByText(NEXT_ACTION)).toBeInTheDocument();
    expect(
      screen.queryByText("Choose one small next step:"),
    ).not.toBeInTheDocument();
  });

  it("rolls back an optimistic next step when saving fails", async () => {
    vi.mocked(selectReflectionAction).mockRejectedValue(new Error("offline"));
    render(
      <ChatFlow
        initial={{
          kind: "summary",
          sessionId: "session-1",
          summary,
          history: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: NEXT_ACTION }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn’t save that next step",
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: NEXT_ACTION })).toBeEnabled();
    });
  });
});
