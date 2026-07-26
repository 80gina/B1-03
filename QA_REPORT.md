# 냉장고 파먹기 레벨업 챌린지 Discord 패키지 — 독립 QA 보고서

- 감사일: 2026-07-26
- 감사 범위: `fridge_challenge_discord_package/` 전체(기존 메일 패키지 제외)
- 감사 방식: 소스 전수 검토, Apps Script V8 정적 구문 검사(`node --check`), JSON 전수 파싱, Blueprint 재귀 모듈/ID/payload 검사, 금지 문자열·비밀 URL 정규식 검사, 문서 간 계약 비교
- 실계정 작업: 수행하지 않음. Google OAuth, Make Import/Run once, Discord 실전송은 `UNVERIFIED`로 분리함.

## 1. 최종 판정

### 요약 수치

| 등급 | 건수 | 의미 |
|---|---:|---|
| PASS | 26 | 정적 검사 또는 코드 증거로 충족 |
| WARNING | 3 | 운영·공유 정책상 주의 필요 |
| FAIL | 2 | Make 운영 활성화를 막는 미충족 사항 |
| UNVERIFIED | 7 | 실계정/외부 서비스 실행 없이는 검증 불가 |

### 결론

**Apps Script 독립 실행 경로는 정적 기준으로 배포 후보 수준입니다. Make 경로는 현재 그대로 운영 활성화하면 안 됩니다.**

핵심 FAIL 두 건은 다음과 같습니다.

1. **Make Blueprint의 엄격한 멱등키 기준 미충족**: 세 Blueprint에는 `운영로그` 멱등키의 원자적 선점·조회·완료 기록 모듈이 없습니다. 상태열, 상호 배타 필터, `sequential=true`, `slots=1`은 동시 실행을 줄이지만, Discord 전송 성공 후 상태 갱신 전 실패나 Watch Rows 재전달에 따른 중복 게시를 막지 못합니다. 원 요구의 멱등키 기준을 **충족하지 않습니다**.
2. **Make Blueprint의 429/5xx 제한 재시도 미구현**: JSON에는 HTTP 모듈의 실제 Error Handler 경로가 없습니다. 문서상 운영자 설정 지시만 있으며, 가져오기 직후 동작하는 재시도 구현이 아닙니다.

두 FAIL은 계정·Make UI가 필요한 구조 변경이라 오프라인 JSON만으로 안전하게 완성할 수 없습니다. 대신 이번 감사에서 Blueprint 메타데이터, `MAPPING_MANIFEST.json`, 설치 가이드, 빠른 시작 체크리스트에 이를 **운영 활성화 차단사항**으로 명시했습니다. 세 시나리오는 계속 `scheduling.enabled=false`입니다.

## 2. 체크별 결과와 증거

### A. Apps Script 및 매니페스트

| ID | 결과 | 검사 항목 | 구체 증거 |
|---|---|---|---|
| A-01 | PASS | V8 JavaScript 구문 | `Code.gs`를 `.js`로 복사해 `node --check` 실행, 오류 0건. Apps Script 비지원 `fetch`, `FormData`, `setTimeout`, `setInterval` 사용 없음. |
| A-02 | PASS | V8 런타임 선언 | `apps_script/appsscript.json`: `runtimeVersion="V8"`, `timeZone="Asia/Seoul"`, `exceptionLogging="STACKDRIVER"`. |
| A-03 | PASS | 필요한 OAuth 범위 | 매니페스트에 Sheets, Forms, Drive, Presentations, `script.external_request`, `script.scriptapp` 범위 존재. 메일 권한 없음. |
| A-04 | PASS | 외부 요청 오류 처리 | `postDiscordWebhook_()`가 `muteHttpExceptions:true`, 2xx 판정, 429/5xx/네트워크 예외 처리, 최대 3회 시도 사용. |
| A-05 | PASS | 429 대기값 | `discordRetryAfterMs_()`가 JSON `retry_after`를 우선 읽고, 없을 때 `Retry-After`/`retry-after` 헤더를 읽도록 이번 감사에서 보강. 최대 20,000ms로 제한. |
| A-06 | PASS | 5xx 제한 재시도 | `DISCORD_MAX_ATTEMPTS=3`; 5xx와 네트워크 예외는 1초, 2초 지수형 대기 후 한도 내 재시도. |
| A-07 | PASS | multipart PDF | `postDiscordWebhook_()`의 blob 경로가 `payload_json`과 `files[0]`을 사용. 모든 payload에 `allowed_mentions.parse=[]`를 재강제. |
| A-08 | PASS | Drive fallback | 20MiB 초과 또는 첨부 실패 시 `sendCertificateDiscord_()`가 Drive 링크 Embed로 fallback. |
| A-09 | WARNING | Drive fallback 공개 범위 | 코드가 fallback 시 `ANYONE_WITH_LINK/VIEW`를 시도합니다. 공개 Discord 채널에서 열 수 있게 하는 설계이나, 조직 정책과 최소 공개 원칙을 운영자가 승인해야 합니다. |
| A-10 | PASS | 파일 업로드 증거 인정 | `hasPhotoEvidence_()`가 `http://`, `https://`, Drive/Docs URL, 20자 이상 Drive 파일 ID를 인정. 문서와 일치. |

### B. Blueprint 구조와 경로

| ID | 결과 | 검사 항목 | 구체 증거 |
|---|---|---|---|
| B-01 | PASS | JSON 문법 | Blueprint 3종과 `MAPPING_MANIFEST.json` 모두 Python `json.loads` 성공. |
| B-02 | PASS | 모듈 ID 고유성 | SCN-01: 8/8 고유, SCN-02: 27/27 고유, SCN-03: 3/3 고유. 중복 ID 0건. |
| B-03 | PASS | 기본 Scheduling OFF | 세 Blueprint 모두 `scheduling.enabled=false`. |
| B-04 | PASS | 순차/동시성 설정 | 세 Blueprint 모두 `metadata.scenario.sequential=true`, `slots=1`. |
| B-05 | PASS | Lv.1~Lv.5 통과 | SCN-02에 각 레벨 통과 필터와 상태 갱신 경로 존재. Lv.1~4는 다음 레벨 `진행중`, Lv.5는 `완료`, `전체완료여부=완료`, `인증서발급상태=미발급`. |
| B-06 | PASS | 오류 분기 | 참가자 미확인, 이메일 불일치, 사진 누락, 순서 오류, 완료 레벨 중복, 레벨별 필수 설명 누락 경로 존재. |
| B-07 | PASS | 리마인드 조건 | SCN-03이 전체완료 아님, 예정일 도래, 리마인드 `N`, 현재 레벨 상태 `진행중`을 Lv.1~5별 확인. 성공 후 `Y`/발송일시/Discord 상태 갱신. |
| B-08 | FAIL | Make 엄격 멱등키 | `운영로그` Search/Create/원자 선점 모듈 0개. 상태열·필터 기반이므로 전송 후 갱신 전 장애/재전달 중복을 막지 못함. **원 요구 불충족.** |
| B-09 | FAIL | Make 429/5xx 재시도 | HTTP 모듈은 `handleErrors=true`이나 재시도 Error Handler 경로가 Blueprint JSON에 없음. UI에서 별도 구현 전까지 요구 불충족. |
| B-10 | WARNING | 신규 참가자 ID 생성 | SCN-01은 Form 응답 `__ROW_NUMBER__`를 일련번호로 사용합니다. 일반적으로 고유하지만 응답 행 삭제·재구성·재가져오기 시 운영 정책 검증 필요. |

### C. 스키마·상태·placeholder 일치

| ID | 결과 | 검사 항목 | 구체 증거 |
|---|---|---|---|
| C-01 | PASS | 39열 계약 | `TRACKER_HEADERS`는 39개이며, manifest의 `레벨업트래커` 배열도 39개. Blueprint는 0-based 0~38 인덱스 사용. |
| C-02 | PASS | 핵심 인덱스 | 25 전체완료, 26 최근안내, 27 리마인드예정, 28/29 리마인드 발송, 31 인증서상태, 32~35 인증서 정보, 36 Discord 상태, 37 카카오 상태, 38 메모가 Script/Blueprint/manifest/문서에서 일치. |
| C-03 | PASS | 시트명 | `CONFIG`, `참가신청_응답`, `미션인증_응답`, `레벨업트래커`, `미션설정`, `메시지템플릿`, `운영로그` 일치. |
| C-04 | PASS | 상태값 | `진행중`, `잠김`, `완료`, `미발급`, `처리중`, `발급완료`, `발급실패`, `성공`, `실패`, `대기`, `건너뜀`, `Y/N` 사용 계약이 일치. |
| C-05 | PASS | placeholder 계약 | Spreadsheet/Sheet ID, `__ROW_NUMBER__`, Form URL, Discord URL placeholder가 manifest와 문서에 대응. 실값 주입이 필요한 조립형 Blueprint임을 명시. |
| C-06 | WARNING | placeholder 포함 상태 | 실제 Webhook/Google 자산 값이 없으므로 안전하지만 Import 직후 실행 불가. 모든 placeholder를 UI에서 재매핑해야 함. |

### D. Discord 보안·개인정보

| ID | 결과 | 검사 항목 | 구체 증거 |
|---|---|---|---|
| D-01 | PASS | 실제 Discord Webhook URL 0건 | `/api[/vN]/webhooks/{id}/{token}` 정규식 전수 검사 결과 0건. `__DISCORD_WEBHOOK_URL__`만 존재. |
| D-02 | PASS | 메일 잔존 0건 | 패키지 전체에서 `Gmail`, `MailApp`, `send_mail` 문자열 0건. 매니페스트에 메일 OAuth 범위 없음. |
| D-03 | PASS | Blueprint allowed_mentions | HTTP payload 13개 전부 JSON 파싱 성공, 전부 `allowed_mentions.parse=[]`. SCN-01 2개, SCN-02 10개, SCN-03 1개. |
| D-04 | PASS | Apps Script allowed_mentions | `buildDiscordPayload_()`와 `postDiscordWebhook_()`가 모두 빈 parse 배열을 설정/재강제. |
| D-05 | PASS | 공개 payload PII 0건 | Blueprint Discord payload에는 닉네임(트래커 index 3)과 참가자ID(index 0 또는 Form 참가자ID)만 참가자 식별값으로 사용. 이름, 이메일, 전화, 사진 URL/Drive ID 매핑 없음. Apps Script 공개 필드도 동일. |
| D-06 | PASS | 원치 않는 멘션 텍스트 방어 | `sanitizeDiscordText_()`가 `@` 뒤에 zero-width space를 넣고 allowed_mentions도 차단. |

### E. 중복 방지와 실행 모드

| ID | 결과 | 검사 항목 | 구체 증거 |
|---|---|---|---|
| E-01 | PASS | Apps Script 참가 중복 | 정규화 이메일로 기존 행 검색, 신규 행 대신 중복 안내. Script Lock 사용. |
| E-02 | PASS | Apps Script 통과 중복 | 레벨 상태와 성공 멱등키 `PASS|{참가자ID}|L{레벨}`를 확인. Script Lock 사용. |
| E-03 | PASS | Apps Script 리마인드 중복 | 발송여부 `Y`와 `REMIND|{참가자ID}|L{레벨}|D5` 성공 키를 동시에 확인. |
| E-04 | PASS | Apps Script 인증서 중복 | `CERT|{참가자ID}|V1`, 발급상태, 동일 파일명 재사용, Script Lock으로 방지. |
| E-05 | PASS | 성공 멱등 로그 조건 | 이번 감사에서 성공키 조회를 `판정결과=통과` **및** `발송상태=성공`으로 강화하여 전송 실패 이벤트의 재시도를 막지 않도록 수정. |
| E-06 | PASS | Make/독립 실행 동시 활성화 인터록 | 이번 감사에서 `MAKE_SCENARIOS_CONFIRMED_OFF` CONFIG 게이트 추가. `Y`가 아니면 `installStandaloneTriggers()`가 오류로 중단. Make 모드 복귀 시 `N`으로 초기화. |

## 3. 수정 내역

1. `apps_script/Code.gs`
   - 429 처리에서 JSON `retry_after`뿐 아니라 HTTP `Retry-After`/`retry-after` 헤더 fallback 추가.
   - 성공 멱등키 인정 조건을 `판정결과=통과 && 발송상태=성공`으로 강화.
   - `MAKE_SCENARIOS_CONFIRMED_OFF` 게이트를 추가하여 Make OFF 확인 없이 독립 실행 트리거 설치를 차단.
   - Make 모드 복귀 시 확인 게이트를 `N`으로 초기화.
2. `make_blueprints/02_mission_levelup.blueprint.json`
   - 실제 구현과 모순되던 “Blueprint가 PDF를 즉시 다운로드/첨부한다” 메타데이터를 제거.
   - PDF multipart/Drive fallback의 실제 담당자가 Apps Script `issuePendingCertificates()`임을 명시.
   - 엄격 멱등성과 Make 재시도 미충족을 명시하고 `idempotencyGuarantee=NOT_MET_UNTIL_OPERATION_LOG_CLAIM_MODULES_ADDED` 추가.
3. `make_blueprints/MAPPING_MANIFEST.json`
   - `makeReliabilityGate`를 추가해 Make 멱등성 FAIL, 원인, 활성화 전 필수 구현을 명시.
   - 레거시 메일 채널 표현을 일반화하여 금지 문자열 0건 달성.
4. `설치_및_운영_가이드.md`
   - Make 멱등성 부족을 “운영 활성화 차단 FAIL”로 격상.
   - 운영로그 원자 선점·완료 기록, 429/5xx 최대 3회 Error Handler를 필수화.
   - 독립 실행 설치 전에 `MAKE_SCENARIOS_CONFIRMED_OFF=Y` 설정 절차 추가.
5. `빠른시작_체크리스트.md`
   - Make 멱등키 선점/완료, 제한 재시도, History 증거, 독립 실행 인터록 항목 추가.

## 4. UNVERIFIED — 운영 전 필수 실전 테스트

| ID | 상태 | 필수 실전 테스트 |
|---|---|---|
| U-01 | UNVERIFIED | 실제 Google 계정에서 `appsscript.json` OAuth 승인 후 `setupFridgeChallenge()`와 `selfCheckFridgeChallenge().ok=true` 확인. |
| U-02 | UNVERIFIED | Blueprint 3종을 Make에 실제 Import하여 모든 Google 연결, Spreadsheet/Sheet, 동적 열, Row number, 0건 continue 옵션, placeholder를 재매핑. |
| U-03 | UNVERIFIED | Discord Webhook 실전송: 시스템 테스트, 웰컴, 중복, 참가자 미확인, 이메일 불일치, 사진 누락, 순서 오류, 중복 제출, 필수 설명 누락, Lv.1~Lv.5, 리마인드 확인. |
| U-04 | UNVERIFIED | Make에 운영로그 원자 멱등키 선점/차단/완료 모듈을 추가한 뒤 같은 Watch Rows 이벤트 재전달 및 “Discord 성공 후 상태 갱신 전 실패”를 모의하여 중복 게시 0건을 History로 증명. |
| U-05 | UNVERIFIED | Make HTTP Error Handler에 429 `retry_after`/`Retry-After`와 5xx 지수형 최대 3회 재시도를 구성하고 모의 응답으로 대기·중단·최종 실패 기록 확인. |
| U-06 | UNVERIFIED | `issuePendingCertificates()`로 실제 Slides→PDF 생성, multipart 직접 첨부, 재실행 시 파일/메시지 중복 없음, 20MiB 초과/첨부 실패 Drive fallback, 최종 실패 상태 확인. |
| U-07 | UNVERIFIED | 파일 업로드 Form으로 교체한 경우 `e.namedValues['인증 사진']`이 URL 또는 Drive ID로 전달되어 독립 실행과 Make 필터에서 모두 통과하는지 실제 응답으로 확인. |

## 5. 운영 승인 게이트

다음 항목을 모두 증명하기 전에는 Make SCN-01~03 Scheduling을 켜지 마십시오.

- [ ] U-01~U-07 완료
- [ ] Make `운영로그` 원자 멱등키 선점/조회/완료 구현
- [ ] Make 429/5xx 최대 3회 Error Handler 구현
- [ ] 같은 이벤트 재전달/중간 장애에서 Discord 중복 게시 0건
- [ ] 실제 Discord 메시지에서 실명·이메일·전화·사진 URL·Drive ID·Webhook URL 0건
- [ ] 모든 실제 payload에서 `allowed_mentions.parse=[]`
- [ ] Make 모드: `STANDALONE_ENABLED=N`, Apps Script Form 제출 트리거 없음
- [ ] 독립 실행 모드: SCN-01~03 OFF, `MAKE_SCENARIOS_CONFIRMED_OFF=Y` 후 트리거 설치
- [ ] 인증서 PDF 직접 첨부와 Drive fallback을 각각 1회 이상 실증

## 6. 감사 한계

본 보고서는 전달된 파일의 정적 감사 결과입니다. Make의 Import 변환, 계정별 모듈 버전, UI Error Handler, Google OAuth 정책, Discord 채널 권한·첨부 한도·실제 rate limit 응답은 외부 서비스에서 실행해야만 검증됩니다. 따라서 `UNVERIFIED` 항목을 통과하지 않은 상태를 운영 완료로 간주하면 안 됩니다.
