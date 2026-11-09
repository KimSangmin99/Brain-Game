import { GameLibrary } from "@/components/lab";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">EIGHT WAYS TO DISCOVER</span>
        <h1>생각을 깨우는 여덟 가지 도전</h1>
        <p>좋아하는 분야부터, 나만의 속도로 시작해 보세요.</p>
      </div>
      <GameLibrary />
    </>
  );
}
