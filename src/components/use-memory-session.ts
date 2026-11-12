"use client";
import { useEffect, useState } from "react";
import type { MemoryAttempt, MemoryEngine } from "@/lib/memory-types";
import { nextStage } from "@/lib/memory-common";
import { saveAttempt } from "@/lib/storage";

import { useAccount } from "./account-provider";

export function useMemorySession<
  T extends MemoryAttempt,
  A extends { type: string },
>(engine: MemoryEngine<T, A>, stage: number, mode: "stage" | "practice") {
  const { user, load, upload } = useAccount();
  const scope = user?.id ?? "guest";
  const [attempt, setAttempt] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [busyTab, setBusyTab] = useState(false);
  const [saved, setSaved] = useState(-1);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    let live = true;
    let release = () => {};
    const controller = new AbortController();
    let acquired = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const initialize = async () => {
      try {
        const history = (await load()).filter(engine.isAttempt);
        if (!live) return;
        if (stage > nextStage(history)) {
          setLocked(true);
          return;
        }
        const active = history.find(
          (a) => a.stage === stage && a.mode === mode && a.phase !== "result",
        );
        setAttempt(active ? engine.recover(active) : engine.make(stage, mode));
      } catch {
        if (live)
          setError(
            "문제와 기록을 불러오지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.",
          );
      }
    };
    if (navigator.locks) {
      timeout = setTimeout(() => {
        if (!acquired) controller.abort();
      }, 1000);
      navigator.locks
        .request(
          `brain-game-${engine.game}-player`,
          { signal: controller.signal },
          async () => {
            if (!live) return;
            acquired = true;
            clearTimeout(timeout);
            const hold = new Promise<void>((resolve) => {
              release = resolve;
            });
            await initialize();
            if (live) await hold;
          },
        )
        .catch((reason: unknown) => {
          if (live) {
            if (reason instanceof DOMException && reason.name === "AbortError")
              setBusyTab(true);
            else
              setError("플레이 상태를 확인하지 못했습니다. 새로고침해 주세요.");
          }
        });
    } else void initialize();
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
      release();
    };
  }, [engine, stage, mode, load]);
  useEffect(() => {
    if (!attempt) return;
    let live = true;
    saveAttempt(attempt, scope)
      .then(() => {
        if (live) {
          setSaved(attempt.revision);
          setSaveError(false);
          if (user && attempt.phase === "result")
            void upload([attempt]).catch(() => {});
        }
      })
      .catch(() => {
        if (live) setSaveError(true);
      });
    return () => {
      live = false;
    };
  }, [attempt, scope, user, upload]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setAttempt((a) => (a ? engine.recover(a) : a));
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [engine]);
  const dispatch = (action: A) =>
    setAttempt((a) => (a ? engine.reduce(a, action) : a));
  const retrySave = () => {
    if (attempt)
      void saveAttempt(attempt, scope)
        .then(() => {
          setSaved(attempt.revision);
          setSaveError(false);
        })
        .catch(() => setSaveError(true));
  };
  const restart = () => {
    setSaved(-1);
    setAttempt((previous) =>
      previous && engine.remake
        ? engine.remake(previous)
        : engine.make(stage, mode),
    );
  };
  return {
    attempt,
    error,
    locked,
    busyTab,
    saved,
    saveError,
    dispatch,
    retrySave,
    restart,
  };
}
