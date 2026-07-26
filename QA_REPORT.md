# 냉장고 파먹기 레벨업 챌린지 패키지 — 최종 QA 보고서

- QA 일자: 2026-07-26
- 대상: `fridge_challenge_package/` 전체
- 방법: 전 파일 직접 검토 + Python 구조 검사 + Node.js V8 문법 검사
- 최종 판정: **정적 QA 통과(배포 ZIP 구성 가능)**
- 최종 집계: **PASS 50 / WARNING 2 / FAIL 0**

> 이 판정은 패키지의 정적 완결성에 대한 결과입니다. 실제 Google·Make 계정의 OAuth 승인, Blueprint 가져오기 호환성, Gmail 실발송, Form 제출, 인증서 생성은 계정 연결 후 `Run once`로 확인해야 합니다.

## 1. 핵심 결과

### PASS

1. `Code.gs`에 다음 실제 공개 함수가 모두 존재합니다.
   - `setupFridgeChallenge`
   - `installStandaloneTriggers`
   - `removeStandaloneTriggers`
   - `runFiveDayReminders`
   - `issuePendingCertificates`
   - `selfCheckFridgeChallenge`
2. `installStandaloneTriggers()`는 `handleSpreadsheetFormSubmit`과 `runFiveDayReminders` 트리거를 설치하고, `removeStandaloneTriggers()`는 이 두 관리 트리거만 제거합니다.
3. `appsscript.json`은 `runtimeVersion: V8`, `timeZone: Asia/Seoul`이며 JSON 문법이 유효합니다.
4. JSON 4종(`appsscript.json`, Blueprint 3종)과 참고 매니페스트 `MAPPING_MANIFEST.json`의 문법이 모두 유효합니다.
5. Blueprint별 모듈 ID는 고유합니다.
   - SCN-01: 7개, 중복 없음
   - SCN-02: 19개, 중복 없음
   - SCN-03: 3개, 중복 없음
6. Blueprint 3종 모두 `scheduling.enabled=false`, `sequential=true`, `slots=1`입니다.
7. SCN-02에 Lv.1~Lv.5 통과 경로와 각 레벨 상태 갱신 모듈이 모두 있습니다.
8. 모든 계정별 값은 의도적으로 placeholder로 남아 있고, `MAPPING_MANIFEST.json`이 다음 항목을 설명합니다.
   - Sheets 연결 `__IMTCONN__=0`
   - Gmail 연결 `account=0`
   - Spreadsheet/Sheet ID placeholder
   - 미션 Form URL placeholder
   - Make 동적 행 번호 `__ROW_NUMBER__`
9. Apps Script와 매핑 매니페스트의 시트 스키마가 일치합니다.
   - `레벨업트래커`: 39열
   - `미션설정`: 10열
   - `메시지템플릿`: 13열
   - `운영로그`: 22열
10. Apps Script가 생성하는 참가 Form 8문항, 미션 Form 14문항의 제목·순서가 응답 시트 매니페스트와 일치합니다.
11. 가이드와 빠른 시작 체크리스트가 실제 함수명, 설치 순서, 사진 문항 교체 제한, Make/Apps Script 동시 실행 금지, 인증서 보완 트리거를 일관되게 안내합니다.
12. 인증서 발급은 `처리중/발급완료`, `CERT|참가자ID|V1`, 기존 PDF 파일명 검사로 중복 생성을 방지합니다.

### WARNING

1. **실계정 실행은 미검증**입니다. Google OAuth, Forms 파일 업로드 정책, Gmail 할당량, Make 모듈 버전/RPC 구조는 실제 계정에서 확인해야 합니다.
2. Make Blueprint는 의도적으로 **조립형 골격**입니다. 실제 연결, 열 재선택, Search Rows 빈 결과 계속 실행, URL 사전 작성 링크, `Run once` 검증 전에는 Scheduling을 켜면 안 됩니다. 또한 Lv.1 재료 3개/Lv.3 상차림 3개를 Blueprint가 정밀 계산하지 않으므로 가이드의 고급 필터 또는 운영자 확인 절차가 필요합니다.

### FAIL

- 최종 정적 QA 기준 **0건**입니다.

## 2. Apps Script V8 구문 검사

Node.js v22.18.0으로 다음 세 방식으로 판단했습니다.

1. `node --check apps_script/Code.gs`
   - 결과: `ERR_UNKNOWN_FILE_EXTENSION (.gs)`
   - 판정: **검사기의 확장자 인식 오류이며 JavaScript 구문 오류가 아님**
2. 임시 `.js` 사본 생성 후 `node --check /tmp/fridge_challenge_Code_QA.js`
   - 결과: PASS
3. stdin 방식 `node --check - < apps_script/Code.gs`
   - 결과: PASS

따라서 `Code.gs`는 Node V8 파서 기준 유효한 JavaScript 구문입니다. Apps Script 전용 전역 객체(`SpreadsheetApp`, `FormApp`, `ScriptApp` 등)의 런타임 동작은 실제 Apps Script 환경에서 별도 검증해야 합니다.

## 3. 발견하여 수정한 실제 결함

### 3.1 SCN-02 완료 레벨 재제출의 Router 경로 중첩

- 파일: `make_blueprints/02_mission_levelup.blueprint.json`
- 문제: 완료된 이전 레벨을 재제출하면 `현재레벨 불일치`와 `이미 완료` 조건이 동시에 참이 되어, Make Router에서 순서 오류 메일과 중복 메일이 함께 발송될 수 있었습니다.
- 수정: 순서 오류의 Lv.1~Lv.5 각 조건군에 해당 `LvN상태 != 완료` 조건을 추가했습니다.
- 결과: 완료 레벨 재제출은 중복 경로만 통과하고 순서 오류 경로는 차단됩니다.

### 3.2 파일 업로드 교체 후 Apps Script 사진 검증 불일치

- 파일: `apps_script/Code.gs`
- 문제: 가이드는 `인증 사진` URL 문항을 같은 제목의 파일 업로드 문항으로 바꿀 수 있다고 했지만, 독립 실행기의 `validateMission_()`는 `http(s)` URL만 허용했습니다. 파일 업로드 응답이 Drive 파일 ID 형태로 전달되는 환경에서는 정상 사진도 미통과할 수 있었습니다.
- 수정: `hasPhotoEvidence_()`를 추가하여 `http(s)` URL, Google Drive/Docs 링크, 20자 이상의 Drive 파일 ID 형태를 허용하도록 했습니다.
- 결과: 기본 URL 문항과 수동 파일 업로드 문항을 모두 처리할 수 있습니다.

### 3.3 placeholder 매니페스트의 `__ROW_NUMBER__` 누락

- 파일: `make_blueprints/MAPPING_MANIFEST.json`
- 문제: Blueprint에서 반복 사용되는 Make 동적 출력 `__ROW_NUMBER__`의 의미와 재매핑 방법이 전역 placeholder 목록에 없었습니다.
- 수정: 이 값은 문자열로 교체하는 ID가 아니라 각 모듈의 Row number 동적 출력이라는 설명을 추가했습니다.

### 3.4 문서에 공개 리마인드 함수 수동 실행 안내 누락

- 파일: `설치_및_운영_가이드.md`, `빠른시작_체크리스트.md`
- 문제: 트리거 핸들러 이름은 있었으나 실제 공개 함수 `runFiveDayReminders()`를 수동 점검할 수 있다는 설명이 빠른 시작 문서에 없었습니다.
- 수정: 독립 실행 설치 후 공개 함수의 수동 실행 항목을 추가했습니다.

### 3.5 Router 중복 경로 검증 설명 보강

- 파일: `설치_및_운영_가이드.md`
- 수정: 완료 레벨 재제출은 중복 경로만 통과하고 순서 오류 경로는 통과하지 않는지 `Run once`에서 확인하도록 명시했습니다.

## 4. Blueprint 상세 검증

### SCN-01 참가 신청

- 고유 ID: PASS
- 스케줄 OFF: PASS
- 신규/중복 Router: PASS
- Sheets/Gmail 연결 placeholder: PASS
- Spreadsheet·Sheet placeholder: PASS
- Add Row 39열 구조: PASS
- 주의: Search Rows 0건 계속 실행 옵션은 가져오기 후 Make UI에서 켜야 합니다.

### SCN-02 미션 검증·레벨업

- 고유 ID: PASS
- 스케줄 OFF: PASS
- 11개 Router 경로: PASS
  - 참가자 미확인
  - 이메일 불일치
  - 사진 누락
  - 순서 오류
  - 완료 레벨 중복
  - Lv.1~Lv.5 통과
  - 필수 설명 누락
- Lv.1~Lv.5 상태/완료일/제출ID 갱신: PASS
- 완료 레벨 중복 경로 상호 배타성: PASS
- 순차 처리·동시 실행 1: PASS
- 주의: Blueprint의 텍스트 개수 판정은 존재 여부 중심의 안전 골격입니다.

### SCN-03 5일 리마인드

- 고유 ID: PASS
- 매일 09:00 `Asia/Seoul`: PASS
- 스케줄 OFF: PASS
- `전체완료여부 != 완료`, 예정일 도래, 미발송, 현재 레벨 상태 `진행중`: PASS
- 발송 후 리마인드 상태 갱신: PASS
- 같은 레벨 재발송 차단: `현재레벨리마인드발송여부=N/Y`로 구현

## 5. 가이드 검증

- Apps Script 설치 순서: `Code.gs` → `appsscript.json` → `setupFridgeChallenge` → 권한 승인 → `selfCheckFridgeChallenge`: PASS
- Make 가져오기 순서: SCN-01 → SCN-02 → SCN-03: PASS
- 독립 실행 전 Make 3종 OFF: PASS
- Make 복귀 전 `removeStandaloneTriggers`: PASS
- Make와 `installStandaloneTriggers()` 동시 사용 금지: PASS
- 사진 URL 문항 삭제 후 같은 제목의 파일 업로드 문항 하나만 유지: PASS
- 파일 업로드 사진은 사전 작성하지 않음: PASS
- Form 질문 변경 시 열 재매핑 안내: PASS
- 인증서 보완은 `issuePendingCertificates` 시간 트리거만 사용: PASS
- 테스트 완료 전 Scheduling OFF: PASS

## 6. 최종 배포용 ZIP 포함 파일 목록

ZIP은 이번 QA에서 만들지 않았습니다. 아래 **9개 파일**을 동일한 상대 경로로 포함합니다.

```text
fridge_challenge_package/
├─ apps_script/
│  ├─ Code.gs
│  └─ appsscript.json
├─ make_blueprints/
│  ├─ 01_signup_welcome.blueprint.json
│  ├─ 02_mission_levelup.blueprint.json
│  ├─ 03_reminder.blueprint.json
│  └─ MAPPING_MANIFEST.json
├─ 설치_및_운영_가이드.md
├─ 빠른시작_체크리스트.md
└─ QA_REPORT.md
```

제외:

- `/tmp`의 Node 검사용 임시 `.js` 사본
- 내부 QA 자동화 스크립트 `qa_fridge_package.py`
- 실제 계정 연결 ID, OAuth 토큰, 비밀번호, API 키
- 실행 로그·테스트 응답·개인정보

## 7. 배포 전 마지막 실계정 확인

1. `setupFridgeChallenge()` 실행 및 OAuth 승인
2. `selfCheckFridgeChallenge().ok=true`
3. 사진 문항을 교체했다면 실제 파일 1개 제출
4. Blueprint 3종 가져오기 후 모든 연결·Sheet·열·필터·동적 토큰 재선택
5. SCN-01/02 Search Rows의 빈 결과 계속 실행 활성화
6. SCN-01 신규/중복, SCN-02 오류·Lv.1~5, SCN-03 1회 발송/재실행 차단 테스트
7. Make 모드에서는 독립 Form 제출 트리거 미설치 확인
8. 독립 모드에서는 Make 3종 OFF 확인
9. 인증서 PDF 1회 발급 및 재실행 중복 없음 확인
10. 모든 테스트가 통과한 뒤에만 Scheduling ON
