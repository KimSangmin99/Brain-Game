# Vercel + Supabase 연결·배포 안내

2026-11-05. 사용자가 선택한 구성은 Vercel의 Next.js와 Supabase PostgreSQL이다. 현재 저장소에는 연결 코드와 초기 마이그레이션이 있으며, 실제 프로젝트 연결·원격 DB 적용·Vercel 배포는 미완료다. 게스트 플레이는 외부 DB 없이 동작하고 기록은 브라우저에 저장된다.

## 1. 연결 대상과 인증

대상 저장소는 `KimSangmin99/Brain-Game`이다. 먼저 기존 Supabase 프로젝트 URL/ref와 Vercel 프로젝트 이름·팀을 확인한다. 비밀번호·토큰·DB URI는 채팅·Git·빌드 로그에 남기지 않는다.

클라우드 작업 환경에서 관리 API로 연결 상태를 점검하려면 보안 설정에 `SUPABASE_ACCESS_TOKEN`과 `VERCEL_TOKEN`을 등록한다. 각각 `api.supabase.com`, `api.vercel.com`에 사용하도록 제한한다. 환경 설정 초안에 이름을 추가한 것과 실행 환경에 인증이 적용된 것은 다르다. 사용자가 환경 설정을 검토·게시한 뒤 새 실행 환경에서 인증 준비 상태를 확인한다. 이 환경 게시는 앱의 Vercel 배포와 별개다.

관리 API 토큰은 프로젝트 설정 작업용이다. 웹 앱 런타임에 넣지 않는다. HTTPS 프록시가 주입하는 토큰 자리표시자는 PostgreSQL 비밀번호로 사용할 수 없다. DB URI는 Vercel 환경변수 또는 마이그레이션 실행기의 안전한 비밀값 저장소에 실제 자격 증명으로 설정한다.

## 2. 서버 환경변수

| 이름 | 설정 위치 | 용도 |
| --- | --- | --- |
| DATABASE_URL | Vercel 서버 런타임 | Supabase Connect 화면의 트랜잭션 풀러 URI, 일반적으로 6543 포트 |
| DIRECT_DATABASE_URL | 신뢰할 수 있는 마이그레이션 실행 환경 | 직접 연결 또는 세션 풀러 URI, 일반적으로 5432 포트 |
| DATABASE_CA_CERT | 필요한 실행 환경 | 공급자가 제공한 신뢰할 PEM CA. 시스템 신뢰 저장소로 검증되면 생략 |
| CRON_SECRET | 추후 예약 작업 구현 시 | 예약 작업 인증. 현재 엔드포인트나 예약은 없음 |

Preview와 Production의 DB를 분리한다. Preview에 운영 DB 자격 증명을 복사하지 않는다. 프로젝트의 실제 Connect 화면 값을 사용하고 특수문자가 있는 비밀번호는 URI 형식에 맞게 인코딩한다. 직접 연결의 IPv6 지원이 실행 환경과 맞지 않으면 지원되는 세션 풀러를 선택한다.

DB 변수에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. `.env.example`에는 이름만 있으며 실제 `.env*`는 Git에서 제외된다. `DATABASE_URL`은 DB 모듈을 처음 사용할 때만 필요하므로 현재 게스트 화면과 빌드는 자격 증명 없이도 실행된다.

서버 연결은 prepared statement를 끄고 인스턴스당 연결을 1개로 제한한다. 전체 함수 인스턴스의 합산 연결 수와 프로젝트 제한은 실제 부하로 점검한다. 외부 DB TLS 인증서 검증을 끄지 않는다.

## 3. 원격 적용 전 확인

1. 프로젝트 ID·소유 팀·리전·PostgreSQL 버전·기존 앱 사용 여부를 읽기 전용으로 확인한다.
2. 백업·복구 수단과 `app_private` 스키마 및 Drizzle 이력 테이블의 기존 사용 여부를 확인한다. 이름 충돌이 있으면 초기 SQL을 그대로 적용하지 않고 기존 구조와 대조한다.
3. Preview용 별도 DB에서 아래 마이그레이션을 먼저 실행한다. 초기 파일은 새 스키마·테이블을 만들며 기존 테이블 삭제 명령을 포함하지 않는다.
4. 실제 풀러 연결, TLS 검증, 테이블·인덱스·제약과 Data API 접근 차단을 검증한다. `npm run test:db`의 PGlite 검증만으로 원격 검증 완료라고 표시하지 않는다.

```sh
npm ci
npm run test:db
npm run db:migrate
```

`db:migrate`는 `DIRECT_DATABASE_URL`을 요구하고 6543 포트를 거부한다. 적용 이력으로 같은 마이그레이션을 재실행하지 않는다. `db:generate`는 스키마 변경을 SQL 파일로 생성할 뿐 원격 DB에 적용하지 않는다. 이미 적용한 파일은 수정하지 않고 새 마이그레이션을 만든다. 운영 변경은 백업·검토 후 별도로 적용하며 `npm run build`에서 실행하지 않는다.

## 4. 데이터 접근과 인증

`app_private`를 Supabase Data API의 노출 스키마에 추가하지 않는다. 초기 테이블 9개는 RLS를 활성화하고 PUBLIC·anon·authenticated 접근을 회수한다. 이 앱은 브라우저에서 Supabase Data API를 직접 호출하지 않으며 anon 키나 service-role 키가 현재 필요하지 않다.

회원 인증은 자체 ID·비밀번호·서버 세션으로 구현할 계획이다. Supabase Auth용 가짜 이메일을 만들지 않는다. 서버가 사용자의 세션과 데이터 소유권을 검증해야 하며, DB 소유자 권한은 RLS를 우회할 수 있음을 전제로 접근을 제한한다. 계정·회원 기록 API가 구현되기 전에는 서버 동기화 완료를 표시하지 않는다.

## 5. Vercel 프로젝트 설정

- 기존 프로젝트와 Git 저장소 연결 상태, Root Directory, 배포 브랜치·자동 배포 설정을 먼저 확인한다.
- Node.js 24, Next.js 프레임워크, `npm ci`, `npm run build`를 사용한다. 저장소 루트의 `vercel.json`에 빌드 설정이 있다.
- DB를 사용하는 Route Handler는 Node.js 런타임에서 실행한다. 함수 리전은 Supabase DB와 가깝게 선택하고 실제 지원 설정을 확인한다.
- 현재 상주 워커나 Cron은 없다. 메일·만료 처리는 추후 인증된 짧은 예약 작업과 DB lease·중복 방지로 구현한다. 요금제별 실행 시간·예약 주기는 도입 시 확인한다.
- Preview 배포에서 모바일·PC 게임, 저장·재접속, 서버 로그의 비밀값 제외 여부를 확인한다. 공개 Production 배포는 별도의 배포 단계로 취급한다.

## 6. 완료 기록

연결 완료 보고에는 확인한 프로젝트 이름/ref, 적용한 마이그레이션 이름, 실제 DB 검증 결과, 배포한 경우 URL·대상 환경을 남긴다. 토큰·URI·비밀번호는 남기지 않는다. GitHub 커밋·푸시, 클라우드 환경 게시, Supabase 마이그레이션, Vercel 배포는 각각 수행 여부를 구분한다.
