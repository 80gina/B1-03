# 냉장고 파먹기 레벨업 챌린지 — Discord 메시지 예시

> 이 문서의 값은 모두 가상 예시입니다. 실제 Webhook URL, 실명, 이메일, 휴대전화번호, 인증 사진 URL은 포함하지 않습니다.

## 1. 공통 공개·보안 계약

Discord에서 참가자를 식별하는 공개 필드는 다음 두 개뿐입니다.

- `챌린지닉네임` → 예시: `냉파마법사`
- `참가자ID` → 예시: `FC-TEST-0042`

레벨·칭호·진행도·미션·보상은 게임 상태 정보로 표시할 수 있습니다. 다음 값은 Discord payload에 넣지 않습니다.

- `이름`
- `이메일주소`
- `휴대전화번호`
- `카카오수신동의`
- 인증 사진 URL 또는 Drive 파일 ID
- 실제 Discord Webhook URL

모든 payload에 다음 값을 유지합니다. `parse` 빈 배열은 자동 멘션 파싱을 막는 설정입니다. [[1]](#ref1)

```json
"allowed_mentions": {
  "parse": []
}
```

Embed는 제목 256자, 설명 4096자, 필드 25개, 한 메시지의 Embed 전체 합계 6000자 제한 안에서 구성합니다. [[2]](#ref2)

## 2. 환영 인사 — `DISCORD_WELCOME_LV1`

### 채널 표시 예시

```text
🍲 [SYSTEM] 첫 퀘스트가 도착했습니다

챌린지에 입장했습니다.
냉장고 재료 3가지로 첫 경험치를 획득하세요.

🎮 플레이어  냉파마법사
🪪 참가자ID  FC-TEST-0042
📊 상태       Lv.1 초보 요리사 · 진행도 0/5
📜 퀘스트     냉장고 속 재료 3가지로 요리 1개 완성
📷 인증 방법  사진 + 재료 목록 + 완성한 요리 이름
🔗 Lv.1 인증 Form

QUEST START · 게임 상태창 70% + 레시피북 30%
```

### JSON 예시

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "🍲 [SYSTEM] 첫 퀘스트가 도착했습니다",
      "description": "챌린지에 입장했습니다. 냉장고 재료 3가지로 첫 경험치를 획득하세요.",
      "color": 12082232,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.1 초보 요리사\n진행도 0/5",
          "inline": false
        },
        {
          "name": "📜 퀘스트",
          "value": "냉장고 속 재료 3가지로 요리 1개 완성",
          "inline": false
        },
        {
          "name": "🔗 Lv.1 인증 Form",
          "value": "[열기](https://example.invalid/mission-form)",
          "inline": false
        }
      ],
      "footer": {
        "text": "QUEST START · 게임 상태창 70% + 레시피북 30%"
      }
    }
  ]
}
```

## 3. 레벨업 — `DISCORD_LEVELUP_L2`

### 채널 표시 예시

```text
✨ [LEVEL UP] Lv.2 살림 9단 해금

Lv.1 통과!
자취요리를 나만의 방식으로 업그레이드하세요.

🎮 플레이어  냉파마법사
🪪 참가자ID  FC-TEST-0042
📊 상태       Lv.2 살림 9단 · 진행도 1/5
📜 새 퀘스트 자취요리를 나만의 방식으로 업그레이드
🎁 보상       스킬 해금: 한 상 차리기
🔗 Lv.2 인증 Form

SKILL UNLOCKED · 게임 상태창 70% + 레시피북 30%
```

### JSON 예시

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "✨ [LEVEL UP] Lv.2 살림 9단 해금",
      "description": "Lv.1 통과! 자취요리를 나만의 방식으로 업그레이드하세요.",
      "color": 13210430,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.2 살림 9단\n진행도 1/5",
          "inline": false
        },
        {
          "name": "📜 새 퀘스트",
          "value": "자취요리를 나만의 방식으로 업그레이드",
          "inline": false
        },
        {
          "name": "🔗 Lv.2 인증 Form",
          "value": "[열기](https://example.invalid/mission-form)",
          "inline": false
        }
      ],
      "footer": {
        "text": "SKILL UNLOCKED · 게임 상태창 70% + 레시피북 30%"
      }
    }
  ]
}
```

같은 형식을 `DISCORD_LEVELUP_L3`, `DISCORD_LEVELUP_L4`, `DISCORD_LEVELUP_L5`에 적용하되, 현재 레벨·칭호·진행도·새 퀘스트만 바꿉니다.

## 4. 오류·재제출 — `DISCORD_RESUBMIT_REQUIRED`

### 채널 표시 예시

```text
🛠️ [RETRY] 인증 보완이 필요합니다

진행 기록은 유지됩니다.
판정 사유: 인증 사진 또는 레벨별 필수 설명을 확인할 수 없습니다.

🎮 플레이어  냉파마법사
🪪 참가자ID  FC-TEST-0042
📊 상태       Lv.3 집밥 마스터 · 진행도 2/5
🔗 다시 인증하기

RESUBMIT · 게임 상태창 70% + 레시피북 30%
```

### JSON 예시

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "🛠️ [RETRY] 인증 보완이 필요합니다",
      "description": "진행 기록은 유지됩니다.\n**판정 사유:** 인증 사진 또는 레벨별 필수 설명을 확인할 수 없습니다.",
      "color": 12082232,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.3 집밥 마스터\n진행도 2/5",
          "inline": false
        },
        {
          "name": "🔗 다시 인증하기",
          "value": "[열기](https://example.invalid/mission-form)",
          "inline": false
        }
      ],
      "footer": {
        "text": "RESUBMIT · 게임 상태창 70% + 레시피북 30%"
      }
    }
  ]
}
```

오류 안내에는 제출한 이메일이나 사진 URL을 재현하지 않습니다. 참가자 미확인 상황에서는 닉네임 대신 `미등록 플레이어`, 참가자ID 대신 제출된 비민감 ID 또는 `UNKNOWN`을 사용할 수 있습니다.

## 5. 레벨 순서 오류 — `DISCORD_LEVEL_ORDER_NOTICE`

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "🔒 [LOCKED] 현재 퀘스트부터 진행해 주세요",
      "description": "제출 레벨 Lv.4와 현재 레벨 Lv.3이 다릅니다.",
      "color": 13210430,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.3 집밥 마스터\n진행도 2/5",
          "inline": false
        }
      ],
      "footer": {
        "text": "ORDER ERROR · 게임 상태창 70% + 레시피북 30%"
      }
    }
  ]
}
```

## 6. 중복 제출 — `DISCORD_DUPLICATE_NOTICE`

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "♻️ [DUPLICATE] 이미 완료된 퀘스트입니다",
      "description": "완료 기록은 안전하게 보관되어 있습니다. 현재 Lv.3부터 이어가 주세요.",
      "color": 6262651,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.3 집밥 마스터\n진행도 2/5",
          "inline": false
        }
      ],
      "footer": {
        "text": "NO DUPLICATE XP · 게임 상태창 70% + 레시피북 30%"
      }
    }
  ]
}
```

## 7. 5일 리마인드 — `DISCORD_REMINDER_D5`

### 채널 표시 예시

```text
⏰ [QUEST REMINDER] 퀘스트가 기다리고 있어요

미션 안내 후 5일이 지났습니다.
오늘 한 숟갈부터 다시 시작해 보세요.

🎮 플레이어  냉파마법사
🪪 참가자ID  FC-TEST-0042
📊 상태       Lv.4 창작 셰프 · 진행도 3/5
📜 현재 퀘스트 기존 레시피를 응용한 나만의 창작 요리
🔗 퀘스트 이어하기

D5 REMINDER · 게임 상태창 70% + 레시피북 30%
```

### JSON 예시

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "⏰ [QUEST REMINDER] 퀘스트가 기다리고 있어요",
      "description": "미션 안내 후 5일이 지났습니다. 오늘 한 숟갈부터 다시 시작해 보세요.",
      "color": 13210430,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.4 창작 셰프\n진행도 3/5",
          "inline": false
        },
        {
          "name": "📜 현재 퀘스트",
          "value": "기존 레시피를 응용한 나만의 창작 요리",
          "inline": false
        },
        {
          "name": "🔗 퀘스트 이어하기",
          "value": "[열기](https://example.invalid/mission-form)",
          "inline": false
        }
      ],
      "footer": {
        "text": "D5 REMINDER · 게임 상태창 70% + 레시피북 30%"
      }
    }
  ]
}
```

## 8. 인증서 완료 — `DISCORD_CERT_COMPLETE`

Make 모드에서 SCN-02는 Lv.5 완료와 `인증서발급상태=미발급`만 기록합니다. 인증서 PDF 생성·Discord 공유는 Apps Script `issuePendingCertificates()`가 처리합니다.

Discord 파일 업로드는 multipart/form-data의 `payload_json`과 `files[0]`을 사용합니다. [[3]](#ref3)

### 채널 표시 예시

```text
🏆 [QUEST COMPLETE] 전설의 요리사 탄생

Lv.1~Lv.5 모든 퀘스트 완료!
최종 보상인 인증서 PDF를 첨부합니다.

🎮 플레이어  냉파마법사
🪪 참가자ID  FC-TEST-0042
📊 상태       Lv.5 전설의 요리사 · 진행도 5/5
🏷️ 인증서 ID CERT-FC-TEST-0042-V1
📎 첨부       CERT-FC-TEST-0042-V1_냉파마법사.pdf

COMPLETE 5 / 5 · 전설의 요리사
```

### `payload_json` 예시

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "🏆 [QUEST COMPLETE] 전설의 요리사 탄생",
      "description": "Lv.1~Lv.5 모든 퀘스트 완료! 인증서 ID: `CERT-FC-TEST-0042-V1`",
      "color": 6262651,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.5 전설의 요리사\n진행도 5/5",
          "inline": false
        },
        {
          "name": "🏷️ 인증서 ID",
          "value": "CERT-FC-TEST-0042-V1",
          "inline": false
        }
      ],
      "footer": {
        "text": "COMPLETE 5 / 5 · 전설의 요리사"
      }
    }
  ],
  "attachments": [
    {
      "id": 0,
      "filename": "CERT-FC-TEST-0042-V1_냉파마법사.pdf",
      "description": "냉장고 파먹기 레벨업 챌린지 완료 인증서"
    }
  ]
}
```

### multipart 필드 예시

```text
payload_json = 위 JSON 문자열
files[0]    = 인증서 PDF 바이너리
```

## 9. 인증서 Drive fallback

Apps Script는 PDF가 20 MiB를 초과하거나 직접 첨부가 실패하면 Drive 링크 Embed로 전환합니다. 이 20 MiB 기준은 조사된 일반 메시지 첨부 상한보다 안전 여유를 둔 구현값입니다. [[3]](#ref3)

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "🏆 [QUEST COMPLETE] 전설의 요리사 인증서",
      "description": "모든 퀘스트 완료 · 진행도 5/5\nPDF 직접 첨부가 불가능하여 Drive 보기 링크로 제공합니다.",
      "color": 13210430,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.5 전설의 요리사\n진행도 5/5",
          "inline": false
        },
        {
          "name": "📄 인증서 보기",
          "value": "[Google Drive에서 열기](https://example.invalid/certificate)",
          "inline": false
        }
      ],
      "footer": {
        "text": "COMPLETE 5 / 5 · DRIVE LINK FALLBACK"
      }
    }
  ]
}
```

이 예시 링크는 실제 파일이나 계정을 가리키지 않습니다. 운영에서는 Drive 공유 범위를 최소화하고, 실제 참가자에게 필요한 범위만 부여합니다.

## 10. 인증서 생성·공유 실패

```json
{
  "username": "냉장고 퀘스트 상태창",
  "allowed_mentions": {
    "parse": []
  },
  "embeds": [
    {
      "title": "⚠️ [QUEST COMPLETE] 인증서 처리 확인 필요",
      "description": "Lv.5 완료 기록은 저장되었습니다. 인증서 생성 또는 공유는 운영자가 다시 점검합니다.",
      "color": 12082232,
      "fields": [
        {
          "name": "🎮 플레이어",
          "value": "냉파마법사",
          "inline": true
        },
        {
          "name": "🪪 참가자ID",
          "value": "FC-TEST-0042",
          "inline": true
        },
        {
          "name": "📊 상태",
          "value": "Lv.5 전설의 요리사\n진행도 5/5",
          "inline": false
        }
      ],
      "footer": {
        "text": "CERTIFICATE RETRY REQUIRED"
      }
    }
  ]
}
```

공개 메시지에는 내부 오류 스택, Drive 파일 ID, Webhook URL, 이메일을 넣지 않습니다. 세부 오류는 Apps Script Executions와 접근이 제한된 `운영로그`에서 확인합니다.

## 11. 전송 전 점검

- [ ] `allowed_mentions.parse=[]`
- [ ] 참가자 식별값은 `챌린지닉네임`, `참가자ID`만
- [ ] 실명 없음
- [ ] 이메일 없음
- [ ] 전화번호 없음
- [ ] 카카오 동의값 없음
- [ ] 사진 URL·Drive 파일 ID 없음
- [ ] 실제 Webhook URL 없음
- [ ] 제목·설명·필드가 Embed 제한 이내
- [ ] CTA 링크는 `https://`만 사용
- [ ] Make History와 외부 캡처에서 개인정보·Webhook URL 마스킹

## 참고자료

<p id="ref1" class="ref_item">[1] <a target="_blank" rel="noreferrer" href="https://docs.discord.com/developers/resources/message#allowed-mentions-object">Discord Developer Documentation — Allowed Mentions Object</a></p>
<p id="ref2" class="ref_item">[2] <a target="_blank" rel="noreferrer" href="https://docs.discord.com/developers/resources/message#embed-object">Discord Developer Documentation — Embed Object</a></p>
<p id="ref3" class="ref_item">[3] <a target="_blank" rel="noreferrer" href="https://docs.discord.com/developers/resources/message#uploading-files">Discord Developer Documentation — Uploading Files</a></p>
