export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export const notifySessionChange = () => {
  try {
    localStorage.setItem("brain-session-change", crypto.randomUUID());
  } catch {
    /* Cookie/server session remains the source of truth. */
  }
};
export async function api<T>(
  path: string,
  body?: unknown,
  accountId?: string,
  method?: "POST" | "DELETE",
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accountId ? { "x-brain-account": accountId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) {
    if (
      accountId &&
      ["LOGIN_REQUIRED", "ACCOUNT_CHANGED"].includes(result.error?.code) &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(
        new CustomEvent("brain-session-expired", { detail: accountId }),
      );
    throw new ApiError(
      result.error?.message ?? "서버에 연결하지 못했습니다.",
      response.status,
      result.error?.code,
    );
  }
  return result.data;
}
