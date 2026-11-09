# 기술·데이터·인터페이스 설계

상태: v0.3 구현 기준안. 사용자가 Vercel + Supabase 구성을 선택했다. 구현 현황은 [개발 진행 기록](../development-status.md), 실제 연결 절차는 [배포 안내](../deployment.md)를 따른다. 아래 전체 설계가 모두 구현된 것은 아니다.

## 1. 구성

- 웹·서버: TypeScript, Next.js 16 계열 App Router, React 19 계열, Node.js 24 LTS. 정확한 호환 패치 버전은 구현 착수 시 확인하고 잠금 파일에 고정.
- UI: DOM·SVG 기반 게임 보드, CSS 기반 반응형. 접근 가능한 버튼·키보드 조작을 기본으로 한다. 무거운 게임 엔진은 초기 구성에 필요하지 않다.
- 데이터: Supabase 관리형 PostgreSQL, Drizzle ORM 및 마이그레이션. 실제 프로젝트의 PostgreSQL 버전은 연결 시 확인한다. 앱 데이터는 전용 `app_private` 스키마에 두고 단일 DB의 트랜잭션·제약으로 중복 응시와 저장을 통제.
- 게스트: IndexedDB. 사용자 기본 설정만 localStorage. 비밀번호·인증 세션은 브라우저 저장소에 보관하지 않음.
- 인증: ID·비밀번호를 받는 자체 인증으로 설계한다. Supabase Auth를 도입하거나 가짜 이메일을 만들지 않는다. 서버의 Argon2id 비밀번호 해시와 DB 기반 불투명 세션을 사용한다. 성숙한 검증 라이브러리 사용, 암호 알고리즘 직접 구현 금지.
- 메일: provider 인터페이스+DB outbox. 로컬은 메일 수집기로 검증, 운영 메일 사업자는 배포 단계 선택. 인증된 예약 작업이 제한된 묶음을 처리하고 DB lease·발송 ID로 중복 실행과 재시도를 통제한다.
- 테스트: Vitest로 판정·점수·병합, PGlite로 SQL 마이그레이션·제약 검증, 실제 Supabase에서 연결·권한·TLS·풀러 통합 검증, Playwright로 이용 흐름·기기 검증. 로컬 DB 테스트는 실제 Supabase 연결 검증을 대체하지 않는다.
- 배포: Vercel의 Next.js 및 Node.js 서버 함수와 Supabase PostgreSQL. 상주 워커 대신 인증된 Cron/큐 작업을 사용한다. 주간 대회 개폐·보관 만료·삭제·메일 재시도는 실행 시간 상한 안에서 처리하고 진행 상태를 DB에 보존한다. 예약 주기·제한은 선택한 요금제에서 확인한다. 현재 예약 작업 엔드포인트는 구현 전이다.
- DB 연결: Vercel 런타임은 Supabase 트랜잭션 풀러와 `prepare: false`, 인스턴스당 최대 연결 1개를 기본으로 한다. 마이그레이션은 직접 연결 또는 세션 풀러를 사용한다. TLS 인증서를 검증하고 필요 시 공급자의 CA를 설정한다.
- 운영 구분: Preview와 Production의 DB 자격 증명을 분리한다. 마이그레이션은 검토 후 별도 명령으로 적용하며 Vercel 빌드 중 실행하지 않는다. 함수와 DB의 리전은 실제 프로젝트 확인 후 가까운 위치로 선택한다.

유료 계약이 없는 로컬 환경에서 핵심 구현이 가능하다. 운영 호스팅·도메인·메일 인증을 개발 완료로 오인하지 않는다.

## 2. 책임 분리

게임별 모듈은 파라미터 검증, 문제 생성 또는 조회, 답 판정, 점수 계산, 힌트·해설 참조를 제공한다. 같은 입력·규칙 버전에서 같은 결과를 반환하는 순수 판정 로직을 공유한다.

서버만 공식 참가권·문항 순서·시한·최종 점수를 확정한다. 클라이언트는 화면·입력·게스트 학습을 담당한다. 공식 정답 데이터는 서버 전용 모듈에 두고 빌드 산출물 누출을 검사한다. 클라이언트 타이밍 로그는 보조 증거로 취급한다.

입력 API는 본인 계정·세션·문항 관계를 매번 확인한다. 자원 ID를 알았다는 이유로 조회·수정이 허용되지 않는다.

## 3. 데이터 모델

ID는 UUID, 시간은 UTC timestamp, 점수·시도 수는 정수. 아래 관계와 유일성은 DB 제약으로 구현한다.

현재 첫 마이그레이션은 users, auth_sessions, action_tokens, attempts, progress, merge_receipts, challenge_events, official_entries, email_outbox의 9개 기반 테이블을 제공한다. 확인된 이메일과 확인 시각은 우선 users에 저장한다. 아래 모델의 콘텐츠 관리·문항 이벤트·요청키·감사·삭제 처리 등은 후속 마이그레이션으로 확장한다. 테이블 존재만으로 회원·동기화·경쟁 기능의 구현 완료를 의미하지 않는다.

| 테이블 | 핵심 데이터·제약 |
| --- | --- |
| users | id, normalized_login_id unique, password_hash, nickname, public_tag unique, status, profile_version, created_at |
| recovery_emails | user_id unique, pending_email, verified_email unique(nullable), verified_at. 미인증 주소로 기존 연결 덮어쓰기 금지 |
| auth_sessions | token_hash unique, user_id FK, idle_expires_at, absolute_expires_at, revoked_at |
| action_tokens | token_hash unique, user_id, purpose, target_email, expires_at, consumed_at. 인증·재설정 목적 분리 |
| games / stages | game_id; stage_id, game_id FK, ordinal, rules_version, content_bundle_id, params, learning_goal, pass_rule. unique(game_id,ordinal,version) |
| content_items | id, version, game_id, difficulty_key, public_payload, private_solution, hints, explanation, validation_status, retired_at. published 버전 불변 |
| attempts | id, owner_user_id nullable, guest_source nullable, game_id, mode, stage_version, rules_version, event_id nullable, input_class, state, started_at, deadline_at, submitted_at, score, assistance, interruption, repeated_exposure, imported |
| attempt_items | attempt_id FK, ordinal, content_id/version, state, served_at, deadline_at, answer, result, submitted_at. unique(attempt_id,ordinal) |
| game_events | attempt_id, seq, event_type, payload, received_at. unique(attempt_id,seq), 제한된 스키마·용량 |
| progress | user_id, game_id, completed_stage_set, independent_goal_counts, version. unique(user_id,game_id), 원본으로 재구성 가능 |
| challenge_events | id, game_id, rules_version, bundle_id, opens_at, closes_at, status, cancellation_reason |
| official_entries | user_id, event_id, attempt_id unique, input_class. unique(user_id,event_id): 입력 분류 바꿔 재응시 불가 |
| merge_receipts | user_id, guest_profile_id, source_attempt_id, merge_batch_id. source의 중복·교차 계정 연결 방지 |
| idempotency_keys | actor_scope, endpoint, key, request_hash, response_ref, expires_at. unique(scope,endpoint,key) |
| email_outbox | id, purpose, recipient_ref, encrypted_payload, state, retry_at, attempts. 토큰 포함 페이로드는 만료·발송 후 제거 |
| audit_events / deletion_jobs | 권한 조치·대회 취소 근거·삭제 상태. 비밀번호·토큰 원문 제외 |

관계: user→attempts→attempt_items→content_items; challenge_event→official_entries→attempt; stage→content_bundle→content_items. 콘텐츠 묶음과 항목 순서 연결 테이블을 둔다. 운영자 역할은 사용자 역할과 분리하고 별도 권한을 확인한다.

## 4. API 계약

기본 경로 /api/v1. HTTPS 운영, JSON UTF-8. 성공은 data와 requestId, 실패는 error.code·message·fieldErrors와 requestId. 사용자 입력 외 내부 예외 내용은 노출하지 않는다.

인증·공개 목록·공개 순위·문의 경로를 제외한 API는 로그인 세션이 필요하다. 게스트 플레이는 내려받은 공개 학습 콘텐츠와 로컬 판정으로 동작한다. 공식 문제는 공개 학습 콘텐츠에 포함하지 않는다. 회원의 비공개 기록 조회·플레이 변경 API는 본인 소유권을 확인한다.

| 메서드·경로 | 입력 | 성공·핵심 규칙 |
| --- | --- | --- |
| POST /auth/register | loginId,password,termsVersion | 201 사용자·세션. ID중복409, 입력422. 이메일 불필요 |
| POST /auth/login | loginId,password | 200 세션; 불일치401, 제한429 |
| POST /auth/logout | 없음 | 204 현재 세션 폐기 |
| GET /me | 세션 | 200 비공개 내 프로필. 비인증401 |
| PATCH /me | nickname,profileVersion | 200 새 버전. 충돌409 |
| POST /auth/email/request | email,currentPassword | 202 일반 안내, 인증 링크 발송 예약 |
| POST /auth/email/confirm | token | 200 연결 완료. 만료·사용됨410 |
| POST /auth/recovery/request | loginId,email | 항상202 일반 안내. 계정 존재 정보 제외 |
| POST /auth/recovery/reset | token,newPassword | 200 재설정·전체 세션 폐기, 재사용410 |
| POST /auth/id-reminder | email | 항상202 안내, 확인된 주소로만 ID 발송 |
| DELETE /me/recovery-email | currentPassword | 204 해제 |
| DELETE /me | currentPassword | 202 삭제 예약·세션 폐기·공개 비식별화 |
| GET /games, /games/{id}/stages | optional session | 200 목록·공개 규칙·진행. private_solution 제외 |
| POST /attempts | gameId,mode,stageId or practiceParams,idempotencyKey | 201 일반 학습 세션; 공식 mode 직접 생성 거부 |
| GET /attempts/{id} | 소유권 | 200 접수·문항 상태·저장 상태. 다른 사람404 |
| POST /attempts/{id}/items/{n}/answer | answer,idempotencyKey | 200 판정 또는 공식 접수 상태. 순서409·형식422·시한410 |
| POST /attempts/{id}/items/{n}/hint | level | 200 힌트와 도움 상태. official403 |
| POST /attempts/{id}/events | seq,type,payload | 202 허용 이벤트만 접수·중복 제거 |
| POST /attempts/{id}/finish | reason,idempotencyKey | 200 서버 계산 결과. 조기 종료 미응답0 |
| POST /progress/import | guestProfileId,batchId,records | 200 건별 접수·중복·거부 결과와 영수증. 다른 계정 연결409 |
| GET /records | gameId,comparisonKey,cursor | 200 본인 기록, 페이지당50 |
| GET /challenges | cursor | 200 대회·기간·내 상태 |
| POST /challenges/{id}/start | inputClass,idempotencyKey | 201 참가권+첫 문항. 기존 응시409, 닫힌 대회410 |
| GET /challenges/{id}/leaderboard | inputClass,cursor | 200 공개 필드만, 공동 순위 |
| POST /support | category,message,optionalContact | 202 접수번호; 제한·내용 검증 |

게임별 answer 형태: pattern/search=좌표 집합, sequence=항목 배열, rule=선택지 ID, code=추측 배열, arrangement=대상→슬롯 매핑, route=좌표 배열, switch=응답 ID. code는 같은 문항에 추측 차수 n을 추가하며 unique(attempt,item,guess_index)와 요청키로 이중 차감을 막는다. arrangement/route 일반 모드는 수정 제출 차수도 저장하되 공식은 첫 확정 1회만 허용.

code 문항은 해독 성공·허용 시도 소진·건너뛰기 때 완료된다. 일반 arrangement/route는 유효 해답 또는 풀이 열람·건너뛰기 때 완료되며, 오답 확정 후 수정 중에는 다음 문항 접근을 열지 않는다. 공식 arrangement/route는 첫 확정 즉시 정오에 관계없이 완료한다.

문항 제공은 GET /attempts/{id}/items/{n}. 첫 제공 시 상태와 시한을 원자적으로 고정한다. 기억 자극은 최초 제공에서만 포함하고 재조회에는 다시 포함하지 않는다. 첫 제공 응답 유실은 문항 중단 정책에 따라 처리하며 새 자극으로 공식 재응시를 주지 않는다. 완료 문항만 다음 번호 접근 허용.

hint level=solution 요청은 revealed를 남긴다. 다음 새 문제 선택은 POST /attempts/{id}/replacement로 하며 일반 모드 전용, 새 노출 이력과 도움 상태를 보존한다. 대체 문항 공급 실패는 503으로 저장 상태와 함께 반환한다.

## 5. 트랜잭션·재시도·시간

- 시작: 대회 상태·시각 확인 → official_entries 유일성 잠금 → attempt·첫 문항 생성 → 요청키 응답 저장 → commit.
- 답: 소유권·상태·서버시각·버전 확인 → 제출 차수 잠금 → 요청 형식 검증 → 판정 → 접수 결과 저장 → commit. 형식 오류는 시도·참가권 추가 차감 없음.
- 동일 요청키·동일 본문 재전송은 저장 응답 반환. 동일 키·다른 본문은409. 요청키24시간 보관, 응시·문항 유일성은 영구 제약으로 유지.
- 타이머는 서버 절대시각이 기준. 클라이언트는 단조 시계로 표시 시간을 추적하되 시계를 조작해 서버 시한을 연장할 수 없음.
- 짧은 응답 문항의 네트워크 지연 영향은 실제 기기·망 조건에서 검증한다. 검증되지 않은 시간 보정값을 몰래 적용하지 않는다. 결과는 정답률 중심이며 반응 ms를 순위에 직접 사용하지 않는다.
- outbox와 DB 변경을 같은 트랜잭션에서 저장. 메일은 같은 작업을 중복 전송하지 않도록 발송 ID 기록. 실패는 지수형 재시도로 최대5회, 토큰 만료 이후 발송하지 않음.

## 6. 안전한 기본 구성

- 세션 쿠키는 HttpOnly·Secure·SameSite=Lax, 세션 회전·폐기 지원. 변경 API의 Origin/CSRF 검증. 외부 도메인 API 접근 기본 차단.
- Argon2id는 초기 memory64MiB·iterations3·parallelism1로 측정 후 조정. 해시별 파라미터 보존. 온라인 제한과 서버 자원 소진을 함께 검증.
- 복구 토큰은 안전한 무작위값, DB에는 해시만 저장. 링크의 GET만으로 상태를 변경하지 않고 사용자 확인 후 POST 소비.
- 콘텐츠 JSON과 이벤트 길이·배열·좌표·열거값 범위 검증. 기본 본문256KB, 기록 import1MB·1000건 상한.
- 운영 로그는 requestId·상태·지연·게임 ID를 중심으로 작성. 인증 요청 본문, 원시 이메일·토큰·비밀번호 로그 제외.
- 학습 모드 오프라인 지원은 다운로드된 문제 묶음에 한정. 회원의 오프라인 결과는 재연결 시 imported/unverified로 구분, 공식 참가 불가.
- 운영 비밀값은 환경 설정으로 주입하며 `NEXT_PUBLIC_` 접두사를 사용하지 않는다. 현재 DB 런타임은 DATABASE_URL, 마이그레이션 실행기는 DIRECT_DATABASE_URL, 선택 CA는 DATABASE_CA_CERT를 사용한다. 추후 예약 작업은 CRON_SECRET, 인증·메일 기능은 해당 구현에 맞춘 별도 설정을 추가한다. 관리 API용 SUPABASE_ACCESS_TOKEN·VERCEL_TOKEN은 연결 설정 작업용으로 웹 런타임에 필요하지 않다.
- app_private는 Supabase Data API 노출 스키마에 추가하지 않는다. 모든 현재 테이블에 RLS를 켜고 anon·authenticated·PUBLIC 접근을 회수한다. 자체 세션을 사용하는 서버는 매 요청 소유권을 검증해야 한다. 서버 DB 역할의 권한을 검증하며 RLS만으로 서버 권한 검증을 대체하지 않는다.
- 운영자 인증은 별도 보호와 강한 인증을 요구한다. 회원용 ID·비밀번호 정책과 운영자 접근 수준을 동일하게 가정하지 않는다.

## 7. 배포 전 확인

실제 호스팅 지원 버전·DB 백업 복원·마이그레이션 롤백 계획·메일 발신 도메인 인증·복구 메일 수신·운영 연락처를 확인한다. 사이트 공개와 환경 게시는 별도 사용자 지시에 따른다.
