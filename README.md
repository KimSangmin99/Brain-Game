# Brain Lab

게임과 학습 도구를 결합한 한국어 두뇌 연구소입니다. 제품 방향과 상세 명세는 [기획 문서](docs/planning/README.md)를 참고하세요.

## 현재 구현

- 반응형 연구소 홈, 8종 게임 목록·분야 필터, 게임별 안내.
- 패턴 복원: 6개 난이도 구간·30단계 파라미터, 조작 연습, 5문항 도전, 정확한 집합 판정, 힌트와 해설, 4/5 통과, 다음 단계 개방.
- 시퀀스 기억: 30단계 파라미터, 도형의 제시 순서 기억, 순서 입력·되돌리기, 키보드 조작, 힌트·정답 비교·다음 단계 개방.
- IndexedDB 게스트 저장: 결과·진행·도움 여부, 새로고침 복구, 중단 문항 교체, 중복 기록 방지.
- 자유 연습과 스테이지 기록 구분, 로컬 기록 목록, 키보드 선택·모바일 조작.
- Vercel 설정과 Supabase PostgreSQL 연결 모듈, 비공개 스키마의 기반 테이블 9개·마이그레이션. 게임별 진행도와 기존 패턴 기록을 보존한다.

현재는 두 기억력 게임을 플레이할 수 있는 개발 중 버전입니다. 각 30단계는 난이도 파라미터와 문제 생성으로 구성했으며, 단계별 교육 콘텐츠·대체 문제 전수 검수를 마친 상태가 아닙니다. 나머지 6종, 회원·복구 이메일, 클라우드 기록 동기화, 공식 경쟁은 구현 전입니다. 클라이언트의 게스트 점수는 공식 검증 기록이 아닙니다. 실제 Vercel·Supabase 연결과 배포도 아직 완료되지 않았습니다.

## 실행

Node.js 24 LTS와 npm이 필요합니다. 런타임 API 키나 외부 DB 없이 현재 구현을 실행할 수 있습니다.

```sh
npm ci
npm run dev
```

개발 서버는 3000번 포트를 사용합니다. 클라우드 작업 환경에서 포트 열기가 제한되어 있으면 해당 환경의 실행 권한 설정을 사용하세요.

```sh
npm run typecheck
npm test
npm run build
npm start
```

## Vercel + Supabase

[연결·배포 안내](docs/deployment.md)에 프로젝트 확인, 서버 환경변수, 마이그레이션과 배포 전 검증 절차를 정리했습니다. ID·비밀번호 인증은 자체 서버 인증으로 구현할 계획이며 Supabase는 PostgreSQL로 사용합니다.

```sh
npm run test:db
npm run db:generate
# 대상 프로젝트 확인과 안전한 DIRECT_DATABASE_URL 설정 후에만 실행
npm run db:migrate
```

마이그레이션은 Vercel 빌드에 포함되지 않습니다. DB 테스트는 로컬 PGlite에서 수행하므로 실제 Supabase 연결·TLS·권한 검증은 별도로 필요합니다.

## 브라우저 검증

```sh
npm run test:e2e
```

Playwright는 `/usr/bin/chromium`을 기본으로 사용합니다. 다른 경로에는 `CHROMIUM_PATH`를 지정합니다. 시스템 Chromium이 없으면 `npx playwright install chromium`으로 설치하고 설치된 실행 파일 경로를 지정하세요. 테스트가 개발 서버를 직접 시작하며, 기존 서버가 있으면 재사용합니다. 브라우저 테스트는 공식 시간 검증이나 실제 모바일 기기 검증을 대신하지 않습니다.

테스트 항목: 5문항 완료·기록 복원·잠금, 입력 제한·중복 제출, 힌트 판정, 중단 복구·새 패턴 교체, 저장 실패, 모바일 조작과 화면 넘침.

## 구조

- `src/lib/pattern.ts`: 게임 상태 전이·판정·파라미터·저장 자료 검증.
- `src/lib/sequence.ts`: 시퀀스 생성·시간별 제시·순서 판정.
- `src/lib/memory-*.ts`, `src/components/use-memory-session.ts`: 공통 결과·게임 어댑터·저장·중단·탭 잠금.
- `src/lib/storage.ts`: IndexedDB 저장과 중복·오래된 쓰기 방지.
- `src/components/pattern-player.tsx`: 제시 시간·입력·피드백·저장 상태.
- `src/components/lab.tsx`: 연구소 홈·목록·진행·기록.
- `src/app`: 페이지·레이아웃·반응형 스타일.
- `src/db`, `drizzle`, `scripts/db-migrate.ts`: 서버 전용 DB 연결·스키마·마이그레이션·제약 검증.
- `e2e`: 실제 브라우저 이용 흐름.

게스트 기록은 이 브라우저에만 보존됩니다. 브라우저 데이터 삭제 시 유실됩니다. 로그인·기기 간 동기화가 구현되기 전에는 서버에 저장됐다고 표시하지 않습니다.
