import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <span className="eyebrow">404 / LOST SIGNAL</span>
      <h1>이 실험실을 찾을 수 없어요.</h1>
      <p>주소를 확인하거나 게임 목록에서 다시 시작해 주세요.</p>
      <Link href="/games" className="button primary">
        실험실 목록으로
      </Link>
    </div>
  );
}
