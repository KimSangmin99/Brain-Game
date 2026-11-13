"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "./account-provider";
import { api, notifySessionChange } from "@/lib/account-api";
import { eraseAccountData } from "@/lib/storage";
import { writeAccountNotice } from "@/lib/account-session";
type Receipt = { userId: string; receipt: string };
const pendingKey = "brain-pending-account-deletion";
export function AccountSecurity() {
  const { user } = useAccount();
  const [panel, setPanel] = useState<"password" | "logout" | "delete" | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [canDelete, setCanDelete] = useState<boolean | null>(null),
    [pending, setPending] = useState<Receipt | null>(null),
    [deleted, setDeleted] = useState(false);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(pendingKey) ?? "null");
      if (
        raw &&
        typeof raw.userId === "string" &&
        typeof raw.receipt === "string"
      )
        setPending(raw);
    } catch {
      /* No deletion is assumed from unreadable browser data. */
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    api<{ canDelete: boolean }>("/me/security", undefined, user.id)
      .then((r) => {
        if (live) setCanDelete(r.canDelete);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [user?.id]);
  async function finishDeletion(receipt: Receipt) {
    setDeleted(true);
    setPanel(null);
    setPending(receipt);
    setError("");
    try {
      await eraseAccountData(receipt.userId);
      localStorage.removeItem(pendingKey);
      writeAccountNotice(
        "계정과 서버의 개인 기록을 삭제했습니다. 이 기기의 계정 기록과 연결된 게스트 원본도 정리했습니다.",
      );
      notifySessionChange();
      window.location.assign("/account");
    } catch {
      setError(
        "서버의 계정 삭제는 완료됐습니다. 이 기기의 기록을 정리하지 못했어요. 브라우저 저장 공간을 확인하고 정리를 다시 시도해 주세요.",
      );
      setBusy(false);
    }
  }
  async function checkDeletion() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ deleted: boolean }>(
        "/auth/deletion-status",
        pending,
      );
      if (result.deleted) {
        await finishDeletion(pending);
        return;
      }
      setError(
        "완료된 탈퇴 요청을 확인하지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "요청 상태를 확인하지 못했습니다.",
      );
    }
    setBusy(false);
  }
  if (deleted)
    return (
      <section className="account-panel">
        <h1>서버의 계정 삭제를 완료했습니다.</h1>
        <p>
          이 기기의 계정 기록을 정리하고 있어요. 다른 기기의 브라우저에 남은
          임시 기록은 해당 기기에서 삭제해 주세요.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={busy}
          onClick={() => {
            if (pending) {
              setBusy(true);
              void finishDeletion(pending);
            }
          }}
        >
          이 기기 기록 정리 다시 시도
        </button>
      </section>
    );
  return (
    <section className="account-panel account-security">
      <span className="eyebrow">ACCOUNT SECURITY</span>
      <h1>계정 보안과 관리</h1>
      {pending && (
        <div className="notice">
          <p>
            이 기기에 이전 탈퇴 요청의 확인 정보가 남아 있습니다. 통신이
            끊겼다면 완료 여부를 확인할 수 있어요.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={checkDeletion}
          >
            이전 탈퇴 요청 상태 확인
          </button>
        </div>
      )}
      {!user ? (
        <>
          <p>로그인한 계정의 비밀번호와 접속 상태를 관리할 수 있어요.</p>
          <Link className="button primary" href="/login">
            로그인
          </Link>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            로그인 ID: <strong>{user.loginId}</strong>
          </p>
          <p>
            중요한 변경에는 현재 비밀번호를 다시 확인합니다. 비밀번호를 잊은
            경우의 이메일 복구는 준비 중이에요.
          </p>
          <div
            className="security-options"
            role="group"
            aria-label="계정 관리 작업"
          >
            <button
              className={
                panel === "password" ? "button primary" : "button secondary"
              }
              aria-pressed={panel === "password"}
              disabled={busy}
              onClick={() => {
                setPanel("password");
                setError("");
              }}
            >
              비밀번호 변경
            </button>
            <button
              className={
                panel === "logout" ? "button primary" : "button secondary"
              }
              aria-pressed={panel === "logout"}
              disabled={busy}
              onClick={() => {
                setPanel("logout");
                setError("");
              }}
            >
              모든 기기 로그아웃
            </button>
            <button
              className={
                panel === "delete" ? "button danger" : "button secondary"
              }
              aria-pressed={panel === "delete"}
              disabled={busy || !canDelete}
              onClick={() => {
                setPanel("delete");
                setError("");
              }}
            >
              회원 탈퇴
            </button>
          </div>
          {canDelete === false && (
            <p className="notice">
              회원 탈퇴 기능을 준비 중입니다. 비밀번호 변경과 모든 기기
              로그아웃은 사용할 수 있어요.
            </p>
          )}
          {panel && (
            <form
              className="account-form security-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const form = e.currentTarget,
                  fields = new FormData(form),
                  userId = user.id;
                setBusy(true);
                setError("");
                let receipt: Receipt | null = null;
                try {
                  const currentPassword = fields.get("currentPassword");
                  if (panel === "delete") {
                    receipt =
                      pending?.userId === userId
                        ? pending
                        : { userId, receipt: crypto.randomUUID() };
                    localStorage.setItem(pendingKey, JSON.stringify(receipt));
                    setPending(receipt);
                    await api(
                      "/me",
                      {
                        currentPassword,
                        confirmationId: fields.get("confirmationId"),
                        acknowledged: fields.get("acknowledged") === "on",
                        receipt: receipt.receipt,
                      },
                      userId,
                      "DELETE",
                    );
                    form.reset();
                    await finishDeletion(receipt);
                    return;
                  }
                  await api(
                    panel === "password"
                      ? "/auth/password"
                      : "/auth/logout-all",
                    {
                      currentPassword,
                      ...(panel === "password"
                        ? {
                            newPassword: fields.get("newPassword"),
                            confirmPassword: fields.get("confirmPassword"),
                          }
                        : {}),
                    },
                    userId,
                  );
                  form.reset();
                  writeAccountNotice(
                    panel === "password"
                      ? "비밀번호를 변경하고 모든 기기의 로그인을 종료했습니다. 새 비밀번호로 로그인해 주세요."
                      : "모든 기기의 로그인을 종료했습니다. 기록은 계정에 보관됩니다.",
                  );
                  notifySessionChange();
                  window.location.assign("/login");
                } catch (e) {
                  // A lost DELETE response must not make the user submit another destructive action.
                  if (receipt) {
                    try {
                      const result = await api<{ deleted: boolean }>(
                        "/auth/deletion-status",
                        receipt,
                      );
                      if (result.deleted) {
                        form.reset();
                        await finishDeletion(receipt);
                        return;
                      }
                    } catch {
                      /* Keep the receipt and let the user check again. */
                    }
                  }
                  setError(
                    e instanceof Error
                      ? e.message
                      : "요청을 완료하지 못했습니다.",
                  );
                  setBusy(false);
                }
              }}
            >
              <h2>
                {panel === "password"
                  ? "새 비밀번호로 바꾸기"
                  : panel === "logout"
                    ? "모든 접속 종료하기"
                    : "탈퇴 전 확인해 주세요"}
              </h2>
              {panel === "delete" ? (
                <div className="deletion-warning">
                  <p>
                    계정, 완료 기록, 진행도, 로그인 정보와 연결된 기록을
                    서버에서 즉시 삭제해요.{" "}
                    <strong>
                      삭제 후 복구할 수 없고 이 ID로 다시 가입할 수 없습니다.
                    </strong>
                  </p>
                  <p>
                    이 기기의 계정 임시 기록과 연결된 게스트 원본도 정리합니다.
                    연결하지 않은 게스트 기록과 다른 계정 기록은 남겨요. 다른
                    기기의 브라우저 기록은 해당 기기에서 지워 주세요.
                  </p>
                  <p>
                    탈퇴한 ID의 재사용 방지와 삭제 처리 확인을 위한 최소 정보는
                    남습니다. 자세한 보관 범위는 계정 이용 안내에서 확인하세요.
                    백업 자료의 삭제 반영은 별도 운영 절차를 따릅니다.
                  </p>
                </div>
              ) : (
                <p>
                  {panel === "password"
                    ? "변경하면 이 기기를 포함한 모든 로그인이 종료됩니다. 완료 기록과 이 기기에 저장 중인 기록은 보존합니다."
                    : "이 기기를 포함한 모든 로그인 세션을 종료합니다. 완료 기록과 이 기기에 저장 중인 기록은 삭제하지 않습니다."}
                </p>
              )}
              <label htmlFor="currentPassword">현재 비밀번호</label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
                disabled={busy}
              />
              {panel === "password" && (
                <>
                  <label htmlFor="newPassword">새 비밀번호</label>
                  <input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={128}
                    required
                    disabled={busy}
                    aria-describedby="new-password-help"
                  />
                  <small id="new-password-help">
                    15~128자. 공백·한글·붙여넣기를 사용할 수 있어요.
                  </small>
                  <label htmlFor="confirmPassword">새 비밀번호 확인</label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={128}
                    required
                    disabled={busy}
                  />
                </>
              )}
              {panel === "delete" && (
                <>
                  <label htmlFor="confirmationId">탈퇴할 로그인 ID 확인</label>
                  <input
                    id="confirmationId"
                    name="confirmationId"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={20}
                    required
                    disabled={busy}
                  />
                  <label className="consent">
                    <input
                      type="checkbox"
                      name="acknowledged"
                      required
                      disabled={busy}
                    />
                    <span>
                      삭제 범위와 복구 불가, ID 재사용 불가 안내를 확인했습니다.
                    </span>
                  </label>
                </>
              )}
              <div className="security-form-actions">
                <button
                  className={
                    panel === "delete" ? "button danger" : "button primary"
                  }
                  disabled={busy}
                >
                  {busy
                    ? "처리 중…"
                    : panel === "password"
                      ? "비밀번호 변경하고 로그아웃"
                      : panel === "logout"
                        ? "전체 로그아웃 확정"
                        : "계정과 기록 영구 삭제"}
                </button>
                <button
                  type="button"
                  className="button quiet"
                  disabled={busy}
                  onClick={() => {
                    setPanel(null);
                    setError("");
                  }}
                >
                  취소
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <p>
            <Link href="/account">내 계정으로 돌아가기</Link> ·{" "}
            <Link href="/account/guide">계정 이용·개인정보 안내</Link>
          </p>
        </>
      )}
    </section>
  );
}
