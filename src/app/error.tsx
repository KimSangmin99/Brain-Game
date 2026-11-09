"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <h1>잠시 화면을 불러오지 못했어요.</h1>
      <p>다시 시도해 주세요. 저장한 기록은 지우지 않습니다.</p>
      <button className="button primary" onClick={reset}>
        다시 시도
      </button>
    </div>
  );
}
