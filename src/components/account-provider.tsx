"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { PublicUser } from "@/server/contracts";
import type { MemoryAttempt } from "@/lib/memory-types";
import { readAllAttempts, saveAttempt, sourceProfile } from "@/lib/storage";
import { api } from "@/lib/account-api";
interface AccountState {
  user: PublicUser | null;
  ready: boolean;
  status: string;
  syncError: boolean;
  load: () => Promise<MemoryAttempt[]>;
  upload: (records: MemoryAttempt[], guest?: boolean) => Promise<void>;
}
const AccountContext = createContext<AccountState | null>(null);
export const useAccount = () => {
  const value = useContext(AccountContext);
  if (!value) throw new Error("AccountProvider missing");
  return value;
};
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null),
    [ready, setReady] = useState(false);
  const [status, setStatus] = useState(""),
    [syncError, setSyncError] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ user: PublicUser | null }>("/me")
      .then((r) => {
        if (live) setUser(r.user);
      })
      .catch(() => {
        if (live) {
          setStatus(
            "계정 연결을 확인하지 못했습니다. 계정 화면에서 다시 시도해 주세요.",
          );
          setSyncError(true);
        }
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (document.hidden) return;
      void api<{ user: PublicUser | null }>("/me")
        .then((r) => {
          if (live) {
            setUser((current) =>
              current?.id === r.user?.id &&
              current?.loginId === r.user?.loginId &&
              current?.nickname === r.user?.nickname
                ? current
                : r.user,
            );
            if (!r.user && user) {
              setStatus("로그인이 종료됐습니다. 다시 로그인해 주세요.");
              setSyncError(false);
            }
          }
        })
        .catch(() => {
          /* A network failure must not silently move account records into guest storage. */
        });
    };
    const storage = (e: StorageEvent) => {
      if (
        e.key === "brain-session-change" ||
        e.key === `brain-deleted-${user?.id}`
      )
        refresh();
    };
    const expired = (e: Event) => {
      if ((e as CustomEvent).detail === user?.id) refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("brain-session-expired", expired);
    return () => {
      live = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("brain-session-expired", expired);
    };
  }, [user]);
  const upload = useCallback(
    async (records: MemoryAttempt[], guest = false) => {
      if (!user) return;
      const completed = records.filter((a) => a.phase === "result");
      if (!completed.length) return;
      try {
        setStatus("계정에 기록을 저장하는 중입니다…");
        setSyncError(false);
        const profile = sourceProfile(guest ? "guest" : user.id);
        for (let i = 0; i < completed.length; i += 100) {
          const batch = completed.slice(i, i + 100);
          const receipt = await api<{ ids: string[] }>(
            "/progress/import",
            { guestProfileId: profile, records: batch },
            user.id,
          );
          for (const a of batch) {
            if (!receipt.ids.includes(a.id))
              throw new Error("서버 저장 확인을 받지 못했습니다.");
            await saveAttempt(a, user.id);
            localStorage.setItem(`brain-synced-${user.id}-${a.id}`, "1");
            if (guest)
              localStorage.setItem(
                `brain-linked-${a.id}`,
                JSON.stringify({ userId: user.id, at: Date.now() }),
              );
          }
        }
        setStatus("계정에 완료 기록이 저장됐습니다.");
      } catch (e) {
        setSyncError(true);
        setStatus(
          e instanceof Error ? e.message : "계정에 저장하지 못했습니다.",
        );
        throw e;
      }
    },
    [user],
  );
  const load = useCallback(async () => {
    if (!user) return readAllAttempts();
    // Keep the two sources isolated. Guest results are never silently imported.
    let local = await readAllAttempts(user.id);
    try {
      const pending = local.filter(
        (a) =>
          a.phase === "result" &&
          !localStorage.getItem(`brain-synced-${user.id}-${a.id}`),
      );
      if (pending.length) await upload(pending);
      let cursor: string | null = null;
      do {
        const page: { records: MemoryAttempt[]; nextCursor: string | null } =
          await api<{ records: MemoryAttempt[]; nextCursor: string | null }>(
            `/records${cursor ? `?cursor=${cursor}` : ""}`,
            undefined,
            user.id,
          );
        for (const a of page.records) {
          await saveAttempt(a, user.id);
          localStorage.setItem(`brain-synced-${user.id}-${a.id}`, "1");
        }
        cursor = page.nextCursor;
      } while (cursor);
      local = await readAllAttempts(user.id);
      setSyncError(false);
      setStatus("계정의 완료 기록을 불러왔습니다.");
    } catch (e) {
      setSyncError(true);
      setStatus(
        e instanceof Error ? e.message : "계정 기록을 불러오지 못했습니다.",
      );
    }
    return local;
  }, [user, upload]);
  return (
    <AccountContext.Provider
      value={{ user, ready, status, syncError, load, upload }}
    >
      {ready ? (
        <div key={user?.id ?? "guest"}>{children}</div>
      ) : (
        <p className="loading" role="status">
          연구소를 준비하는 중입니다…
        </p>
      )}
    </AccountContext.Provider>
  );
}
