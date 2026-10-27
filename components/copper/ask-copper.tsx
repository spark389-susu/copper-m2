"use client";

import { ArrowUpIcon, MessageCircleIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Answer } from "@/components/copper/ask-copper-answer";
import { SetupRequired } from "@/components/setup-required";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

type Turn = { question: string; progress: Progress };

// Tools on and tools off are separate chats, each with its own history.
type Chats = { on: Turn[]; off: Turn[] };

/** What the model is sent: the questions and Copper's finished replies. */
function historyOf(turns: Turn[]): ChatMessage[] {
  return turns
    .filter((turn) => turn.progress.status === "done")
    .flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      { role: "assistant" as const, content: turn.progress.reply },
    ]);
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Chats>({ on: [], off: [] });
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const body = useRef<HTMLDivElement>(null);

  // Open from the header link, or when the site loads at /#ask. The link is
  // listened to by click as well as hashchange: once the address already ends
  // in #ask, clicking it again fires no hashchange.
  useEffect(() => {
    const openIfAsk = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    window.addEventListener("hashchange", openIfAsk);
    document.addEventListener("click", onClick);
    const initial = window.setTimeout(openIfAsk, 0);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("hashchange", openIfAsk);
      document.removeEventListener("click", onClick);
    };
  }, []);

  function changeOpen(next: boolean) {
    setOpen(next);
    // Clear #ask so the header link works again next time.
    if (!next && window.location.hash === "#ask")
      window.history.replaceState(null, "", window.location.pathname);
  }

  const turns = useTools ? chats.on : chats.off;
  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [turns, open]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const mode = useTools ? "on" : "off";
    const history = historyOf(chats[mode]);
    const index = chats[mode].length;
    const show = (progress: Progress) =>
      setChats((current) => ({
        ...current,
        [mode]: current[mode].map((turn, i) =>
          i === index ? { ...turn, progress } : turn,
        ),
      }));

    setDraft("");
    setBusy(true);
    setChats((current) => ({
      ...current,
      [mode]: [
        ...current[mode],
        {
          question: text,
          progress: { steps: [], reply: "", status: "working" },
        },
      ],
    }));
    try {
      const { progress } = await askCopper({
        messages: [...history, { role: "user", content: text }],
        useTools,
      });
      for await (const update of readLive(progress)) {
        show(update);
        if (update.status !== "working") setBusy(false);
      }
    } catch {
      show({
        steps: [],
        reply: "Sorry, I couldn't answer that just now. Please try again.",
        status: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <>
      <button
        type="button"
        data-testid="ask-copper-launcher"
        onClick={() => changeOpen(true)}
        className="bg-primary text-primary-foreground focus-visible:ring-ring fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg outline-none focus-visible:ring-2"
      >
        <MessageCircleIcon className="size-5" />
        Ask Copper
      </button>
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent
          data-testid="ask-copper"
          showCloseButton={false}
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        >
          <div className="bg-foreground text-background">
            <div className="flex items-center gap-3 p-4">
              <span className="bg-primary flex size-10 shrink-0 items-center justify-center rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper mascot"
                  width={32}
                  height={32}
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="font-heading text-lg text-inherit">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-background/70 text-xs">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose
                aria-label="Close"
                className="text-background/80 hover:text-background rounded-full p-1"
              >
                <XIcon className="size-5" />
              </SheetClose>
            </div>
            <div className="bg-background/10 flex items-center justify-between px-4 py-2">
              <div>
                <p className="text-sm font-semibold">Use tools</p>
                <p className="text-background/70 text-xs">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </p>
              </div>
              <Switch
                aria-label="Use tools"
                checked={useTools}
                onCheckedChange={setUseTools}
              />
            </div>
          </div>

          {aiConfigured ? (
            <>
              <div
                ref={body}
                className="bg-secondary flex-1 space-y-5 overflow-y-auto p-4"
              >
                {turns.map((turn, i) => (
                  <div key={i} className="space-y-3">
                    <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                      {turn.question}
                    </p>
                    <Answer progress={turn.progress} useTools={useTools} />
                  </div>
                ))}
                {!busy && (
                  <div className="flex flex-col items-start gap-2">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => void send(starter)}
                        className="bg-background border-border hover:border-primary rounded-xl border px-3 py-2 text-left text-sm"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <form
                onSubmit={onSubmit}
                className="bg-background border-border flex items-center gap-2 border-t p-3"
              >
                <input
                  aria-label="Your question"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask about prices or stock…"
                  className="border-input focus-visible:ring-ring min-w-0 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-2"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={busy || !draft.trim()}
                  className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                >
                  <ArrowUpIcon className="size-5" />
                </button>
              </form>
            </>
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto p-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
