/**
 * 냉장고 파먹기 레벨업 챌린지 — Discord Incoming Webhook 전용 설치기/독립 실행기
 *
 * 기본 모드: Make 연동용 Google Forms·Sheets·인증서 자산 생성(MAKE_ASSET_ONLY)
 * 선택 모드: installStandaloneTriggers() 실행 시 레벨 판정, Discord 상태창 알림,
 *            5일 리마인드, Lv.5 인증서 PDF 발급·공유를 Apps Script가 직접 처리
 *
 * 보안 원칙:
 * - Discord Webhook URL은 Script Properties의 DISCORD_WEBHOOK_URL에만 저장합니다.
 * - CONFIG/시트/로그/반환값/console에 Webhook URL을 기록하지 않습니다.
 * - 공개 Discord 메시지와 인증서에는 챌린지닉네임·참가자ID만 표시합니다.
 * - 실명·이메일·휴대전화번호는 Discord로 전송하지 않습니다.
 * - 모든 요청에 allowed_mentions: {parse: []}를 강제합니다.
 *
 * 설치:
 * 1) 스프레드시트에 바인딩된 Apps Script에서 Code.gs와 appsscript.json을 적용합니다.
 * 2) setupFridgeChallenge() 실행 후 시트 메뉴에서 Webhook URL을 안전 입력합니다.
 * 3) testDiscordWebhook()로 채널 연결을 확인합니다.
 * 4) Make 사용 시 독립 실행 트리거를 설치하지 않습니다.
 * 5) Make 없이 실행할 때 installStandaloneTriggers()를 한 번 실행합니다.
 *
 * Forms 서비스는 파일 업로드 문항 생성을 지원하지 않으므로 설치기는 같은 제목의
 * 필수 URL 문항을 생성합니다. 운영자가 '인증 사진' 문항을 파일 업로드로 교체해도
 * 문항 제목 기준으로 처리합니다.
 */

const APP = Object.freeze({
  VERSION: '2.0.0-discord',
  TIMEZONE: 'Asia/Seoul',
  DB_NAME: '냉장고 파먹기_운영DB',
  JOIN_FORM_TITLE: '냉장고 파먹기 레벨업 챌린지 — 참가 신청',
  MISSION_FORM_TITLE: '냉장고 파먹기 레벨업 챌린지 — 미션 인증',
  SHEETS: Object.freeze({
    CONFIG: 'CONFIG',
    JOIN_RESPONSES: '참가신청_응답',
    MISSION_RESPONSES: '미션인증_응답',
    TRACKER: '레벨업트래커',
    MISSIONS: '미션설정',
    TEMPLATES: '메시지템플릿',
    LOG: '운영로그'
  }),
  PROP: Object.freeze({
    SPREADSHEET_ID: 'FRIDGE_CHALLENGE_SPREADSHEET_ID',
    JOIN_FORM_ID: 'FRIDGE_CHALLENGE_JOIN_FORM_ID',
    MISSION_FORM_ID: 'FRIDGE_CHALLENGE_MISSION_FORM_ID',
    JOIN_RESPONSE_SHEET_ID: 'FRIDGE_CHALLENGE_JOIN_RESPONSE_SHEET_ID',
    MISSION_RESPONSE_SHEET_ID: 'FRIDGE_CHALLENGE_MISSION_RESPONSE_SHEET_ID',
    CERT_TEMPLATE_ID: 'FRIDGE_CHALLENGE_CERT_TEMPLATE_ID',
    CERT_FOLDER_ID: 'FRIDGE_CHALLENGE_CERT_FOLDER_ID',
    DISCORD_WEBHOOK_URL: 'DISCORD_WEBHOOK_URL'
  }),
  MODE_MAKE: 'MAKE_ASSET_ONLY',
  MODE_STANDALONE: 'APPS_SCRIPT_STANDALONE',
  REMINDER_DAYS: 5,
  REMINDER_HOUR: 9,
  SAMPLE_MARKER: 'SAMPLE_ONLY',
  DISCORD_MAX_ATTEMPTS: 3,
  DISCORD_MAX_RETRY_MS: 20000,
  DISCORD_SAFE_ATTACHMENT_BYTES: 20 * 1024 * 1024,
  COLORS: Object.freeze({
    CREAM: '#F7F0DF',
    BROWN: '#3B2A22',
    TERRACOTTA: '#B85C38',
    OCHRE: '#C9933E',
    MINT: '#5F8F7B',
    PALE: '#FFF9ED'
  })
});

const TRACKER_HEADERS = Object.freeze([
  '참가자ID', '신청일시', '이름', '챌린지닉네임', '이메일주소', '휴대전화번호',
  '알림수신채널', '카카오수신동의', '현재레벨', '현재칭호',
  'Lv1상태', 'Lv1완료일시', 'Lv1제출ID', 'Lv2상태', 'Lv2완료일시', 'Lv2제출ID',
  'Lv3상태', 'Lv3완료일시', 'Lv3제출ID', 'Lv4상태', 'Lv4완료일시', 'Lv4제출ID',
  'Lv5상태', 'Lv5완료일시', 'Lv5제출ID', '전체완료여부', '최근미션안내일시',
  '다음리마인드예정일시', '현재레벨리마인드발송여부', '현재레벨리마인드발송일시',
  '마지막처리이벤트ID', '인증서발급상태', '인증서ID', '인증서파일URL',
  '인증서발급일시', '인증서멱등키', 'Discord최근발송상태', '카카오최근발송상태', '운영메모'
]);

const MISSION_HEADERS = Object.freeze([
  '레벨', '칭호', '미션 내용', '인증 방법', '필수 사진', '필수 텍스트 필드',
  '자동 통과 기준', '다음 레벨', '보상 문구', '활성여부'
]);

const TEMPLATE_HEADERS = Object.freeze([
  '템플릿ID', '채널', '이벤트코드', 'Embed제목', 'Embed설명', '색상',
  '상태라벨', 'CTA문구', 'CTA_URL', '활성여부', '템플릿버전', '최종수정일시'
]);

const LOG_HEADERS = Object.freeze([
  '로그일시', '이벤트ID', '멱등키', '시나리오명', 'Make실행ID', '참가자ID', '제출ID',
  '이벤트유형', '제출레벨', '처리전현재레벨', '처리후현재레벨', '판정결과', '판정사유',
  '발송채널', '공개표시', '템플릿ID', '발송상태', '재시도횟수', '오류코드', '오류메시지',
  '인증서ID', '처리완료일시'
]);

const IDX = Object.freeze(TRACKER_HEADERS.reduce((acc, name, i) => {
  acc[name] = i;
  return acc;
}, {}));

/** 설치된 운영 스프레드시트에 메뉴를 표시합니다(컨테이너 바운드 프로젝트인 경우). */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🍲 냉파 레벨업')
      .addItem('전체 자산 설치/복구', 'setupFridgeChallenge')
      .addSeparator()
      .addItem('Discord Webhook 안전 입력', 'setDiscordWebhookUrl')
      .addItem('Discord Webhook 연결 테스트', 'testDiscordWebhook')
      .addItem('Discord Webhook 삭제', 'clearDiscordWebhookUrl')
      .addSeparator()
      .addItem('독립 실행 트리거 설치', 'installStandaloneTriggers')
      .addItem('독립 실행 트리거 해제', 'removeStandaloneTriggers')
      .addSeparator()
      .addItem('5일 리마인드 지금 실행', 'runFiveDayReminders')
      .addItem('완료자 인증서 점검/발급', 'issuePendingCertificates')
      .addItem('구축 자체 점검', 'selfCheckFridgeChallenge')
      .addToUi();
  } catch (err) {
    console.log('메뉴를 표시할 활성 스프레드시트가 없습니다.');
  }
}


/**
 * 모든 Google 자산을 한 번에 생성합니다. 재실행 시 Script Properties에 기록된 자산을 재사용합니다.
 * @return {Object} 생성된 핵심 URL
 */
function setupFridgeChallenge() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const ss = getOrCreateSpreadsheet_(props);
    const coreSheets = ensureCoreSheets_(ss);

    writeMissions_(coreSheets[APP.SHEETS.MISSIONS]);
    writeTemplates_(coreSheets[APP.SHEETS.TEMPLATES]);
    writeLogHeaders_(coreSheets[APP.SHEETS.LOG]);
    writeTracker_(coreSheets[APP.SHEETS.TRACKER]);

    const joinForm = getOrCreateJoinForm_(props);
    const missionForm = getOrCreateMissionForm_(props);
    const joinResponse = ensureFormDestination_(joinForm, ss, APP.SHEETS.JOIN_RESPONSES, APP.PROP.JOIN_RESPONSE_SHEET_ID);
    const missionResponse = ensureFormDestination_(missionForm, ss, APP.SHEETS.MISSION_RESPONSES, APP.PROP.MISSION_RESPONSE_SHEET_ID);

    styleResponseSheet_(joinResponse);
    styleResponseSheet_(missionResponse);

    const certFolder = getOrCreateCertificateFolder_(props);
    const certTemplate = getOrCreateCertificateTemplate_(props, certFolder);

    writeConfig_(ss, {
      joinForm: joinForm,
      missionForm: missionForm,
      joinResponse: joinResponse,
      missionResponse: missionResponse,
      certFolder: certFolder,
      certTemplate: certTemplate
    });

    deleteUnusedBlankSheets_(ss);
    SpreadsheetApp.flush();

    const result = {
      spreadsheetUrl: ss.getUrl(),
      joinFormUrl: joinForm.getPublishedUrl(),
      missionFormUrl: missionForm.getPublishedUrl(),
      certificateFolderUrl: certFolder.getUrl(),
      mode: getConfigValue_('PROJECT_MODE') || APP.MODE_MAKE
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Make 없이 Apps Script가 직접 처리하도록 설치형 트리거를 설치합니다. */
function installStandaloneTriggers() {
  const ss = getDatabase_();
  if (getConfigValue_('MAKE_SCENARIOS_CONFIRMED_OFF') !== 'Y') {
    throw new Error('동시 실행 방지: Make SCN-01~03 Scheduling을 모두 OFF로 확인한 뒤 CONFIG의 MAKE_SCENARIOS_CONFIRMED_OFF를 Y로 설정하세요.');
  }
  removeManagedTriggers_();
  ScriptApp.newTrigger('handleSpreadsheetFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
  ScriptApp.newTrigger('runFiveDayReminders')
    .timeBased()
    .atHour(getNumberConfig_('REMINDER_HOUR', APP.REMINDER_HOUR))
    .everyDays(1)
    .inTimezone(getConfigValue_('TIMEZONE') || APP.TIMEZONE)
    .create();
  setConfigValues_({
    PROJECT_MODE: APP.MODE_STANDALONE,
    STANDALONE_ENABLED: 'Y',
    TRIGGERS_UPDATED_AT: formatDateTime_(new Date())
  });
  SpreadsheetApp.flush();
  return '독립 실행 트리거 2개(응답 제출, 매일 리마인드)를 설치했습니다.';
}

/** 이 프로젝트가 만든 설치형 트리거를 제거하고 Make 자산 모드로 되돌립니다. */
function removeStandaloneTriggers() {
  const count = removeManagedTriggers_();
  setConfigValues_({
    PROJECT_MODE: APP.MODE_MAKE,
    STANDALONE_ENABLED: 'N',
    MAKE_SCENARIOS_CONFIRMED_OFF: 'N',
    TRIGGERS_UPDATED_AT: formatDateTime_(new Date())
  });
  SpreadsheetApp.flush();
  return count + '개의 관리 트리거를 제거했습니다.';
}

/** 연결된 두 Form의 스프레드시트 제출 이벤트를 시트명으로 라우팅합니다. */
function handleSpreadsheetFormSubmit(e) {
  if (getConfigValue_('STANDALONE_ENABLED') !== 'Y') return;
  if (!e || !e.range || !e.namedValues) {
    throw new Error('이 함수는 설치형 스프레드시트 Form 제출 트리거로 실행해야 합니다.');
  }
  const sheetName = e.range.getSheet().getName();
  if (sheetName === APP.SHEETS.JOIN_RESPONSES) {
    processJoinSubmission_(e);
  } else if (sheetName === APP.SHEETS.MISSION_RESPONSES) {
    processMissionSubmission_(e);
  } else {
    console.log('관리 대상이 아닌 제출 시트: ' + sheetName);
  }
}

/** 5일 이상 미제출한 진행중 참가자에게 같은 레벨에서 한 번만 리마인드합니다. */
function runFiveDayReminders() {
  if (getConfigValue_('STANDALONE_ENABLED') !== 'Y') {
    console.log('STANDALONE_ENABLED가 Y가 아니므로 리마인드를 건너뜁니다.');
    return {sent: 0, skipped: 0, disabled: true};
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getDatabase_();
    const tracker = ss.getSheetByName(APP.SHEETS.TRACKER);
    const data = getDataRows_(tracker, TRACKER_HEADERS.length);
    if (!data.length) return {sent: 0, skipped: 0};
    const logKeys = getSuccessfulIdempotencyKeys_(ss);
    const missions = getMissionMap_(ss);
    const templates = getTemplateMap_(ss);
    const now = new Date();
    const logs = [];
    let sent = 0;
    let skipped = 0;
    data.forEach((row) => {
      const participantId = String(row[IDX['참가자ID']] || '');
      const memo = String(row[IDX['운영메모']] || '');
      if (!participantId || memo.indexOf(APP.SAMPLE_MARKER) >= 0 || participantId.indexOf('FC-TEST-') === 0) { skipped++; return; }
      const level = Number(row[IDX['현재레벨']]);
      const due = asDate_(row[IDX['다음리마인드예정일시']]);
      const state = String(row[IDX['Lv' + level + '상태']] || '');
      const key = 'REMIND|' + participantId + '|L' + level + '|D5';
      if (row[IDX['전체완료여부']] === '완료' || level < 1 || level > 5 || state !== '진행중' ||
          !due || due.getTime() > now.getTime() || row[IDX['현재레벨리마인드발송여부']] === 'Y' || logKeys.has(key)) {
        skipped++; return;
      }
      const mission = missions[level];
      const vars = participantVars_(row, level, mission);
      vars['미션인증_사전작성URL'] = createMissionPrefillUrl_(participantId, '', level);
      const eventId = eventId_(participantId, 'REMIND');
      const sentResult = sendDiscordTemplate_('DISCORD_REMINDER_D5', vars, templates);
      if (sentResult.status === '성공') {
        row[IDX['현재레벨리마인드발송여부']] = 'Y';
        row[IDX['현재레벨리마인드발송일시']] = now;
        row[IDX['Discord최근발송상태']] = '성공';
        row[IDX['마지막처리이벤트ID']] = eventId;
        sent++;
      } else {
        row[IDX['Discord최근발송상태']] = '실패';
      }
      logs.push(makeLogRow_({eventId: eventId, idempotencyKey: key, scenario: 'SCN-03_5일미제출_리마인드',
        participantId: participantId, eventType: 'REMIND', submitLevel: level, beforeLevel: level, afterLevel: level,
        result: sentResult.status === '성공' ? '통과' : '미통과', reason: sentResult.status === '성공' ? '5일 미제출 조건 충족' : 'Discord 발송 실패',
        templateId: 'DISCORD_REMINDER_D5', sendStatus: sentResult.status, retryCount: sentResult.retryCount,
        errorCode: sentResult.errorCode, errorMessage: sentResult.error}));
    });
    tracker.getRange(2, 1, data.length, TRACKER_HEADERS.length).setValues(data);
    appendLogs_(ss, logs);
    SpreadsheetApp.flush();
    return {sent: sent, skipped: skipped};
  } finally { lock.releaseLock(); }
}


/** 완료 상태지만 인증서가 아직 없는 참가자를 점검하여 발급합니다. */
function issuePendingCertificates() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getDatabase_();
    const tracker = ss.getSheetByName(APP.SHEETS.TRACKER);
    const data = getDataRows_(tracker, TRACKER_HEADERS.length);
    let issued = 0;
    let skipped = 0;
    data.forEach((row, i) => {
      const memo = String(row[IDX['운영메모']] || '');
      if (memo.indexOf(APP.SAMPLE_MARKER) >= 0 || String(row[IDX['참가자ID']]).indexOf('FC-TEST-') === 0) {
        skipped++;
        return;
      }
      if (row[IDX['전체완료여부']] === '완료' && row[IDX['인증서발급상태']] !== '발급완료' &&
          row[IDX['인증서발급상태']] !== '처리중') {
        const result = issueCertificateForRow_(ss, tracker, row, i + 2);
        if (result.issued) issued++; else skipped++;
      } else {
        skipped++;
      }
    });
    SpreadsheetApp.flush();
    return {issued: issued, skipped: skipped};
  } finally {
    lock.releaseLock();
  }
}

/** 생성 자산과 스키마를 읽기 전용으로 점검하고 결과를 로그/반환값으로 제공합니다. */
function selfCheckFridgeChallenge() {
  const checks = [];
  const props = PropertiesService.getScriptProperties();
  let ss;
  try { ss = getDatabase_(); checks.push(['Spreadsheet 열기', true, ss.getId()]); }
  catch (err) { checks.push(['Spreadsheet 열기', false, err.message]); return {ok: false, checks: checks}; }
  Object.keys(APP.SHEETS).forEach((key) => {
    const name = APP.SHEETS[key];
    checks.push(['시트: ' + name, Boolean(ss.getSheetByName(name)), name]);
  });
  checks.push(['참가 Form', isAccessibleForm_(props.getProperty(APP.PROP.JOIN_FORM_ID)), '접근 가능 여부']);
  checks.push(['미션 Form', isAccessibleForm_(props.getProperty(APP.PROP.MISSION_FORM_ID)), '접근 가능 여부']);
  checks.push(['인증서 템플릿', isAccessibleFile_(props.getProperty(APP.PROP.CERT_TEMPLATE_ID)), '접근 가능 여부']);
  checks.push(['인증서 폴더', isAccessibleFolder_(props.getProperty(APP.PROP.CERT_FOLDER_ID)), '접근 가능 여부']);
  checks.push(['Discord Webhook 설정', Boolean(props.getProperty(APP.PROP.DISCORD_WEBHOOK_URL)), 'URL은 표시하지 않음']);
  const tracker = ss.getSheetByName(APP.SHEETS.TRACKER);
  const missions = ss.getSheetByName(APP.SHEETS.MISSIONS);
  const templates = ss.getSheetByName(APP.SHEETS.TEMPLATES);
  const logs = ss.getSheetByName(APP.SHEETS.LOG);
  checks.push(['트래커 헤더 39개', tracker && tracker.getLastColumn() === TRACKER_HEADERS.length, tracker ? tracker.getLastColumn() : 0]);
  checks.push(['미션 5개', missions && missions.getLastRow() >= 6, missions ? missions.getLastRow() - 1 : 0]);
  checks.push(['Discord 템플릿 10개 이상', templates && templates.getLastRow() >= 11, templates ? templates.getLastRow() - 1 : 0]);
  checks.push(['운영로그 헤더 22개', logs && logs.getLastColumn() === LOG_HEADERS.length, logs ? logs.getLastColumn() : 0]);
  const failures = checks.filter((c) => !c[1]);
  console.log(JSON.stringify({ok: failures.length === 0, checks: checks}, null, 2));
  return {ok: failures.length === 0, checks: checks};
}


// -----------------------------------------------------------------------------
// 설치: 스프레드시트와 시트
// -----------------------------------------------------------------------------

function getOrCreateSpreadsheet_(props) {
  const saved = props.getProperty(APP.PROP.SPREADSHEET_ID);
  if (saved) {
    try { return SpreadsheetApp.openById(saved); } catch (err) { console.warn(err.message); }
  }
  const ss = SpreadsheetApp.create(APP.DB_NAME);
  props.setProperty(APP.PROP.SPREADSHEET_ID, ss.getId());
  ss.setSpreadsheetTimeZone(APP.TIMEZONE);
  const first = ss.getSheets()[0];
  first.setName(APP.SHEETS.CONFIG);
  return ss;
}

function ensureCoreSheets_(ss) {
  const result = {};
  [APP.SHEETS.CONFIG, APP.SHEETS.TRACKER, APP.SHEETS.MISSIONS, APP.SHEETS.TEMPLATES, APP.SHEETS.LOG].forEach((name) => {
    result[name] = ss.getSheetByName(name) || ss.insertSheet(name);
  });
  return result;
}

function writeTracker_(sheet) {
  if (sheet.getLastRow() === 0 || !headersMatch_(sheet, TRACKER_HEADERS)) {
    sheet.clear();
    sheet.getRange(1, 1, 1, TRACKER_HEADERS.length).setValues([TRACKER_HEADERS]);
    const samples = sampleTrackerRows_();
    sheet.getRange(2, 1, samples.length, TRACKER_HEADERS.length).setValues(samples);
  }
  formatTable_(sheet, TRACKER_HEADERS.length, APP.COLORS.BROWN);
  sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  [12, 15, 18, 21, 24, 27, 28, 30, 35].forEach((column) => sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('yyyy-mm-dd hh:mm:ss'));
}

function writeMissions_(sheet) {
  const rows = [
    [1, '초보 요리사', '냉장고 속 재료 3가지로 요리 1개 완성', '사진+재료목록 Form 제출', 'Y', '사용한 재료 목록, 완성한 요리 이름', '사진 URL 존재 AND 재료 3개 이상 AND 요리 이름 존재', 2, '스킬 해금: 자취요리 업그레이드', 'Y'],
    [2, '살림 9단', '자취요리(라면/볶음밥 등)를 나만의 방식으로 업그레이드', '사진+한줄설명 Form 제출', 'Y', '업그레이드한 자취요리, 나만의 업그레이드 한줄설명', '사진 URL 존재 AND 두 텍스트 필드가 공백이 아님', 3, '스킬 해금: 한 상 차리기', 'Y'],
    [3, '집밥 마스터', '메인요리 + 반찬 2개 이상으로 한 상 차리기', '사진(전체 상차림) Form 제출', 'Y', '상차림 구성', '사진 URL 존재 AND 상차림 구성요소 3개 이상', 4, '스킬 해금: 창작 레시피', 'Y'],
    [4, '창작 셰프', '기존 레시피를 응용한 나만의 창작 요리', '사진+레시피 설명 Form 제출', 'Y', '창작 요리 이름, 응용한 기존 레시피와 나만의 레시피 설명', '사진 URL 존재 AND 요리 이름과 설명 존재', 5, '스킬 해금: 인생 한 끼', 'Y'],
    [5, '전설의 요리사', '“인생 한 끼” — 가장 자신 있는 요리로 마무리', '사진+소감 Form 제출', 'Y', '인생 한 끼 요리 이름, 챌린지 완료 소감', '사진 URL 존재 AND 요리 이름과 소감 존재', 'N/A', '최종 보상: 전설의 요리사 인증서', 'Y']
  ];
  replaceSheetData_(sheet, MISSION_HEADERS, rows);
  formatTable_(sheet, MISSION_HEADERS.length, APP.COLORS.TERRACOTTA);
  sheet.setColumnWidths(1, MISSION_HEADERS.length, 150);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(7, 360);
}

function writeTemplates_(sheet) {
  const now = formatDateTime_(new Date());
  const rows = templateSeedRows_(now);
  replaceSheetData_(sheet, TEMPLATE_HEADERS, rows);
  formatTable_(sheet, TEMPLATE_HEADERS.length, APP.COLORS.OCHRE);
  sheet.setColumnWidth(4, 330);
  sheet.setColumnWidth(6, 520);
  sheet.setColumnWidth(7, 420);
}

function writeLogHeaders_(sheet) {
  if (sheet.getLastRow() === 0 || !headersMatch_(sheet, LOG_HEADERS)) {
    sheet.clear();
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  }
  formatTable_(sheet, LOG_HEADERS.length, APP.COLORS.MINT);
}

function writeConfig_(ss, assets) {
  const sheet = ss.getSheetByName(APP.SHEETS.CONFIG);
  const configured = Boolean(PropertiesService.getScriptProperties().getProperty(APP.PROP.DISCORD_WEBHOOK_URL));
  const existingConfig = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach((row) => {
      if (row[0]) existingConfig[String(row[0])] = row[1];
    });
  }
  const currentMode = existingConfig.PROJECT_MODE === APP.MODE_STANDALONE ? APP.MODE_STANDALONE : APP.MODE_MAKE;
  const standaloneEnabled = currentMode === APP.MODE_STANDALONE && existingConfig.STANDALONE_ENABLED === 'Y' ? 'Y' : 'N';
  const config = [
    ['KEY', 'VALUE', 'DESCRIPTION'],
    ['APP_VERSION', APP.VERSION, '설치 코드 버전'],
    ['PROJECT_MODE', currentMode, 'setup 재실행 시 현재 실행 모드를 보존'],
    ['STANDALONE_ENABLED', standaloneEnabled, '독립 실행 트리거 설치 시 Y'],
    ['MAKE_SCENARIOS_CONFIRMED_OFF', existingConfig.MAKE_SCENARIOS_CONFIRMED_OFF === 'Y' ? 'Y' : 'N', '독립 실행 설치 전 Make SCN-01~03 Scheduling OFF를 운영자가 확인한 경우만 Y'],
    ['TIMEZONE', APP.TIMEZONE, '날짜·트리거 기준 시간대'],
    ['REMINDER_DAYS', APP.REMINDER_DAYS, '미제출 리마인드 대기 일수'],
    ['REMINDER_HOUR', APP.REMINDER_HOUR, '매일 리마인드 실행 시각(0~23)'],
    ['DISCORD_WEBHOOK_CONFIGURED', configured ? 'Y' : 'N', 'Webhook URL 자체는 Script Properties에만 보관'],
    ['DISCORD_CHANNEL_SCOPE', 'PUBLIC_NICKNAME_AND_PARTICIPANT_ID_ONLY', '실명·이메일·전화번호 전송 금지'],
    ['DISCORD_ATTACHMENT_SAFE_BYTES', APP.DISCORD_SAFE_ATTACHMENT_BYTES, '이 크기 초과 PDF는 Drive 링크 fallback'],
    ['SPREADSHEET_ID', ss.getId(), '운영 DB ID'],
    ['SPREADSHEET_URL', ss.getUrl(), '운영 DB URL'],
    ['JOIN_FORM_ID', assets.joinForm.getId(), '참가 신청 Form ID'],
    ['JOIN_FORM_EDIT_URL', assets.joinForm.getEditUrl(), '참가 신청 Form 편집 URL'],
    ['JOIN_FORM_PUBLISHED_URL', assets.joinForm.getPublishedUrl(), '참가 신청 Form 응답 URL'],
    ['JOIN_RESPONSE_SHEET_NAME', assets.joinResponse.getName(), '참가 신청 응답 탭'],
    ['JOIN_RESPONSE_SHEET_ID', assets.joinResponse.getSheetId(), '참가 신청 응답 gid'],
    ['JOIN_RESPONSE_SHEET_URL', ss.getUrl() + '#gid=' + assets.joinResponse.getSheetId(), '참가 신청 응답 탭 URL'],
    ['MISSION_FORM_ID', assets.missionForm.getId(), '미션 인증 Form ID'],
    ['MISSION_FORM_EDIT_URL', assets.missionForm.getEditUrl(), '미션 인증 Form 편집 URL'],
    ['MISSION_FORM_PUBLISHED_URL', assets.missionForm.getPublishedUrl(), '미션 인증 Form 응답 URL'],
    ['MISSION_RESPONSE_SHEET_NAME', assets.missionResponse.getName(), '미션 인증 응답 탭'],
    ['MISSION_RESPONSE_SHEET_ID', assets.missionResponse.getSheetId(), '미션 인증 응답 gid'],
    ['MISSION_RESPONSE_SHEET_URL', ss.getUrl() + '#gid=' + assets.missionResponse.getSheetId(), '미션 인증 응답 탭 URL'],
    ['MISSION_ITEM_SUBMIT_LEVEL_ID', getFormItemIdByTitle_(assets.missionForm, '제출 레벨'), '사전 작성 링크 생성용 문항 ID'],
    ['MISSION_ITEM_PARTICIPANT_ID', getFormItemIdByTitle_(assets.missionForm, '참가자ID'), '사전 작성 링크 생성용 문항 ID'],
    ['MISSION_ITEM_EMAIL_ID', getFormItemIdByTitle_(assets.missionForm, '이메일주소'), 'Discord 공개 링크에는 이메일을 사전 작성하지 않음'],
    ['MISSION_ITEM_PHOTO_ID', getFormItemIdByTitle_(assets.missionForm, '인증 사진'), '사진 URL 또는 수동 파일 업로드 문항 ID'],
    ['PHOTO_CAPTURE_MODE', 'URL_QUESTION_FALLBACK', '운영자가 같은 제목의 파일 업로드 문항으로 수동 교체 가능'],
    ['CERTIFICATE_TEMPLATE_ID', assets.certTemplate.getId(), 'Google Slides 인증서 템플릿 ID'],
    ['CERTIFICATE_TEMPLATE_URL', assets.certTemplate.getUrl(), '인증서 템플릿 URL'],
    ['CERTIFICATE_FOLDER_ID', assets.certFolder.getId(), 'PDF 저장 폴더 ID'],
    ['CERTIFICATE_FOLDER_URL', assets.certFolder.getUrl(), 'PDF 저장 폴더 URL'],
    ['KAKAO_PROVIDER', '', '2차 확장 시 공급사 입력'],
    ['KAKAO_SENDER_PROFILE_KEY', '', '비밀값은 Script Properties 권장'],
    ['MAKE_READY', 'Y', 'Forms 응답 탭과 Discord 기준 운영 시트 준비 완료'],
    ['SETUP_COMPLETED_AT', formatDateTime_(new Date()), '최근 설치/복구 완료 시각']
  ];
  sheet.clear();
  sheet.getRange(1, 1, config.length, 3).setValues(config);
  formatTable_(sheet, 3, APP.COLORS.BROWN);
  sheet.setColumnWidth(1, 300); sheet.setColumnWidth(2, 520); sheet.setColumnWidth(3, 500);
  sheet.getRange(2, 1, config.length - 1, 3).setWrap(true).setVerticalAlignment('top');
}


// -----------------------------------------------------------------------------
// 설치: Forms
// -----------------------------------------------------------------------------

function getOrCreateJoinForm_(props) {
  const saved = props.getProperty(APP.PROP.JOIN_FORM_ID);
  if (saved) { try { return FormApp.openById(saved); } catch (err) { console.warn(err.message); } }
  const form = FormApp.create(APP.JOIN_FORM_TITLE);
  props.setProperty(APP.PROP.JOIN_FORM_ID, form.getId());
  form.setDescription('냉장고 속 재료를 맛있는 한 끼로 바꾸며 Lv.1부터 Lv.5까지 성장하는 요리 퀘스트입니다. 첫 미션과 진행 상태는 Discord 공개 채널에 챌린지 닉네임과 참가자ID로 안내됩니다.')
    .setConfirmationMessage('참가 신청이 접수되었습니다. Discord 챌린지 채널에서 첫 퀘스트를 확인해 주세요.')
    .setCollectEmail(false).setLimitOneResponsePerUser(false).setAcceptingResponses(true).setProgressBar(true);
  if (!form.getItems().length) {
    form.addTextItem().setTitle('이름').setRequired(true).setHelpText('운영 확인용이며 Discord 및 공개 인증서에는 표시하지 않습니다.');
    form.addTextItem().setTitle('챌린지 닉네임').setRequired(true).setHelpText('Discord 공개 상태창에 표시됩니다.');
    form.addTextItem().setTitle('이메일주소').setRequired(true).setValidation(FormApp.createTextValidation().requireTextIsEmail().setHelpText('본인 확인용이며 Discord에 전송하지 않습니다.').build());
    form.addTextItem().setTitle('휴대전화번호').setRequired(false).setHelpText('카카오 확장용이며 Discord에 전송하지 않습니다.');
    form.addMultipleChoiceItem().setTitle('알림 수신 채널').setRequired(true).setChoiceValues(['Discord 공개 채널', 'Discord+카카오(준비 후)']);
    form.addCheckboxItem().setTitle('카카오 알림 수신 동의').setRequired(false).setChoiceValues(['동의함']);
    form.addCheckboxItem().setTitle('개인정보 수집·이용 동의').setRequired(true).setChoiceValues(['동의함']);
    form.addParagraphTextItem().setTitle('이번 챌린지에서 만들고 싶은 한 끼').setRequired(false);
  }
  return form;
}


function getOrCreateMissionForm_(props) {
  const saved = props.getProperty(APP.PROP.MISSION_FORM_ID);
  if (saved) { try { return FormApp.openById(saved); } catch (err) { console.warn(err.message); } }
  const form = FormApp.create(APP.MISSION_FORM_TITLE);
  props.setProperty(APP.PROP.MISSION_FORM_ID, form.getId());
  form.setDescription('현재 진행중인 레벨을 선택하고 사진과 필수 설명을 제출하세요. 이메일은 본인 확인에만 사용되며 Discord에 공개되지 않습니다.')
    .setConfirmationMessage('미션 인증이 접수되었습니다. 판정 결과는 Discord 챌린지 채널에서 닉네임과 참가자ID로 안내됩니다.')
    .setCollectEmail(false).setLimitOneResponsePerUser(false).setAcceptingResponses(true).setProgressBar(true);
  if (!form.getItems().length) {
    const levelItem = form.addMultipleChoiceItem().setTitle('제출 레벨').setRequired(true);
    form.addTextItem().setTitle('참가자ID').setRequired(true).setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^FC-(?:\d{8}|TEST)-\d{4}$').setHelpText('예: FC-20260726-0001').build());
    form.addTextItem().setTitle('이메일주소').setRequired(true).setHelpText('본인 확인용이며 Discord에 전송하지 않습니다.').setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
    form.addTextItem().setTitle('인증 사진').setRequired(true).setHelpText('공유 URL을 입력하세요. 운영자는 같은 제목의 파일 업로드 문항으로 교체할 수 있습니다.').setValidation(FormApp.createTextValidation().requireTextIsUrl().build());
    form.addMultipleChoiceItem().setTitle('제출 내용 공개 동의').setRequired(true).setChoiceValues(['갤러리 공개 동의', '운영 확인만 동의']);
    const pages = [];
    pages.push(form.addPageBreakItem().setTitle('Lv.1 초보 요리사'));
    form.addParagraphTextItem().setTitle('사용한 재료 목록').setRequired(true).setHelpText('쉼표 또는 줄바꿈으로 냉장고 재료 3가지 이상을 구분해 주세요.');
    form.addTextItem().setTitle('완성한 요리 이름').setRequired(true);
    pages.push(form.addPageBreakItem().setTitle('Lv.2 살림 9단'));
    form.addTextItem().setTitle('업그레이드한 자취요리').setRequired(true);
    form.addParagraphTextItem().setTitle('나만의 업그레이드 한줄설명').setRequired(true);
    pages.push(form.addPageBreakItem().setTitle('Lv.3 집밥 마스터'));
    form.addParagraphTextItem().setTitle('상차림 구성').setRequired(true).setHelpText('메인요리 1개와 반찬 2개 이상을 구분해 주세요.');
    pages.push(form.addPageBreakItem().setTitle('Lv.4 창작 셰프'));
    form.addTextItem().setTitle('창작 요리 이름').setRequired(true);
    form.addParagraphTextItem().setTitle('응용한 기존 레시피와 나만의 레시피 설명').setRequired(true);
    pages.push(form.addPageBreakItem().setTitle('Lv.5 전설의 요리사'));
    form.addTextItem().setTitle('인생 한 끼 요리 이름').setRequired(true);
    form.addParagraphTextItem().setTitle('챌린지 완료 소감').setRequired(true);
    pages.forEach((page) => page.setGoToPage(FormApp.PageNavigationType.SUBMIT));
    levelItem.setChoices(pages.map((page, i) => levelItem.createChoice('Lv.' + (i + 1), page)));
  }
  return form;
}


function ensureFormDestination_(form, ss, desiredName, propertyKey) {
  const props = PropertiesService.getScriptProperties();
  const savedSheetId = Number(props.getProperty(propertyKey) || 0);
  if (savedSheetId) {
    const savedSheet = ss.getSheets().find((s) => s.getSheetId() === savedSheetId);
    if (savedSheet) {
      if (savedSheet.getName() !== desiredName && !ss.getSheetByName(desiredName)) savedSheet.setName(desiredName);
      return savedSheet;
    }
  }
  const named = ss.getSheetByName(desiredName);
  if (named) {
    props.setProperty(propertyKey, String(named.getSheetId()));
    return named;
  }

  const beforeIds = new Set(ss.getSheets().map((s) => s.getSheetId()));
  if (form.getDestinationId() !== ss.getId()) {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  }
  let created = null;
  for (let attempt = 0; attempt < 8 && !created; attempt++) {
    SpreadsheetApp.flush();
    Utilities.sleep(500);
    const refreshed = SpreadsheetApp.openById(ss.getId());
    created = refreshed.getSheets().find((s) => !beforeIds.has(s.getSheetId())) || null;
  }
  if (!created) {
    const candidates = SpreadsheetApp.openById(ss.getId()).getSheets().filter((s) => /Form Responses|설문지 응답/.test(s.getName()));
    created = candidates[candidates.length - 1] || null;
  }
  if (!created) throw new Error(form.getTitle() + '의 응답 시트를 찾지 못했습니다. Form 응답 대상 연결을 확인하세요.');
  created.setName(desiredName);
  props.setProperty(propertyKey, String(created.getSheetId()));
  return created;
}

// -----------------------------------------------------------------------------
// 설치: 인증서
// -----------------------------------------------------------------------------

function getOrCreateCertificateFolder_(props) {
  const saved = props.getProperty(APP.PROP.CERT_FOLDER_ID);
  if (saved) {
    try { return DriveApp.getFolderById(saved); } catch (err) { console.warn(err.message); }
  }
  const folder = DriveApp.createFolder('냉장고 파먹기_인증서_PDF');
  props.setProperty(APP.PROP.CERT_FOLDER_ID, folder.getId());
  return folder;
}

function getOrCreateCertificateTemplate_(props, folder) {
  const saved = props.getProperty(APP.PROP.CERT_TEMPLATE_ID);
  if (saved) {
    try { return DriveApp.getFileById(saved); } catch (err) { console.warn(err.message); }
  }
  const deck = SlidesApp.create('냉장고 파먹기_전설의 요리사_인증서_템플릿');
  const slide = deck.getSlides()[0];
  slide.getPageElements().forEach((element) => element.remove());
  slide.getBackground().setSolidFill(APP.COLORS.CREAM);

  const border = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 22, 18, 676, 500);
  border.getFill().setTransparent();
  border.getBorder().getLineFill().setSolidFill(APP.COLORS.TERRACOTTA);
  border.getBorder().setWeight(3);

  addSlideText_(slide, '[ QUEST COMPLETE ]', 70, 55, 580, 40, 18, APP.COLORS.TERRACOTTA, true, SlidesApp.ParagraphAlignment.CENTER);
  addSlideText_(slide, '전설의 요리사 인증서', 70, 105, 580, 60, 32, APP.COLORS.BROWN, true, SlidesApp.ParagraphAlignment.CENTER);
  addSlideText_(slide, '{{챌린지닉네임}}', 90, 195, 540, 45, 23, APP.COLORS.MINT, true, SlidesApp.ParagraphAlignment.CENTER);
  addSlideText_(slide, '플레이어 ID  {{참가자ID}}', 120, 250, 480, 30, 14, APP.COLORS.BROWN, false, SlidesApp.ParagraphAlignment.CENTER);
  addSlideText_(slide, '냉장고 속 재료를 아끼는 마음으로\nLv.1부터 Lv.5까지 모든 요리 퀘스트를 완료하여\n“전설의 요리사” 칭호를 수여합니다.', 100, 300, 520, 85, 17, APP.COLORS.BROWN, false, SlidesApp.ParagraphAlignment.CENTER);
  addSlideText_(slide, '인증서 ID  {{인증서ID}}   |   완료일  {{완료일}}', 90, 420, 540, 28, 12, APP.COLORS.BROWN, false, SlidesApp.ParagraphAlignment.CENTER);
  addSlideText_(slide, '🌿 “남은 재료를 아끼는 마음이 어느새 너만의 손맛이 되었구나.”', 75, 465, 570, 26, 12, APP.COLORS.TERRACOTTA, false, SlidesApp.ParagraphAlignment.CENTER);

  deck.saveAndClose();
  const file = DriveApp.getFileById(deck.getId());
  file.moveTo(folder);
  props.setProperty(APP.PROP.CERT_TEMPLATE_ID, file.getId());
  return file;
}

function addSlideText_(slide, text, x, y, w, h, size, color, bold, alignment) {
  const shape = slide.insertTextBox(text, x, y, w, h);
  const range = shape.getText();
  range.getTextStyle().setFontFamily('Noto Sans KR').setFontSize(size).setForegroundColor(color).setBold(bold);
  range.getParagraphStyle().setParagraphAlignment(alignment);
  return shape;
}

// -----------------------------------------------------------------------------
// 독립 실행: 참가 신청
// -----------------------------------------------------------------------------

function processJoinSubmission_(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss = getDatabase_(); const named = e.namedValues;
    const name = namedValue_(named, '이름');
    const nickname = namedValue_(named, '챌린지 닉네임').trim();
    const email = normalizeEmail_(namedValue_(named, '이메일주소'));
    const phone = String(namedValue_(named, '휴대전화번호') || '').replace(/\D/g, '');
    const channel = namedValue_(named, '알림 수신 채널') || 'Discord 공개 채널';
    const kakaoConsent = namedValue_(named, '카카오 알림 수신 동의').indexOf('동의함') >= 0 ? 'Y' : 'N';
    const privacy = namedValue_(named, '개인정보 수집·이용 동의');
    const pendingEvent = eventId_('PENDING', 'JOIN');
    if (!name || !nickname || !isValidEmail_(email) || privacy.indexOf('동의함') < 0) {
      appendLogs_(ss, [makeLogRow_({eventId: pendingEvent, idempotencyKey: 'JOIN|INVALID|' + e.range.getRow(), scenario: 'SCN-01_참가신청_웰컴발송', eventType: 'JOIN', result: '미통과', reason: '필수값 또는 개인정보 동의 누락', sendStatus: '건너뜀'})]);
      return;
    }
    if (channel.indexOf('카카오') >= 0 && (!phone || kakaoConsent !== 'Y')) {
      appendLogs_(ss, [makeLogRow_({eventId: pendingEvent, idempotencyKey: 'JOIN|KAKAO_INVALID|' + e.range.getRow(), scenario: 'SCN-01_참가신청_웰컴발송', eventType: 'JOIN', result: '미통과', reason: '카카오 확장 선택 시 전화번호와 동의 필요', sendStatus: '건너뜀'})]);
      return;
    }
    const tracker = ss.getSheetByName(APP.SHEETS.TRACKER);
    const data = getDataRows_(tracker, TRACKER_HEADERS.length);
    const existingIndex = data.findIndex((row) => normalizeEmail_(row[IDX['이메일주소']]) === email && String(row[IDX['운영메모']]).indexOf(APP.SAMPLE_MARKER) < 0);
    const joinKey = 'JOIN|' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)).slice(0, 16);
    if (existingIndex >= 0) {
      const row = data[existingIndex];
      const vars = participantVars_(row, Number(row[IDX['현재레벨']]), getMissionMap_(ss)[Number(row[IDX['현재레벨']])]);
      vars['미션인증_사전작성URL'] = createMissionPrefillUrl_(row[IDX['참가자ID']], '', Number(row[IDX['현재레벨']]));
      const result = sendDiscordCustom_('⚠️ [DUPLICATE] 이미 참가 중입니다', vars, '새 참가자를 만들지 않았습니다. 현재 퀘스트부터 이어가 주세요.', APP.COLORS.OCHRE, vars['미션인증_사전작성URL']);
      appendLogs_(ss, [makeLogRow_({eventId: eventId_(row[IDX['참가자ID']], 'JOIN_DUP'), idempotencyKey: joinKey, scenario: 'SCN-01_참가신청_웰컴발송', participantId: row[IDX['참가자ID']], eventType: 'JOIN', beforeLevel: row[IDX['현재레벨']], afterLevel: row[IDX['현재레벨']], result: '중복', reason: '동일 참가 정보가 이미 존재함', templateId: 'DISCORD_JOIN_DUPLICATE', sendStatus: result.status, retryCount: result.retryCount, errorCode: result.errorCode, errorMessage: result.error})]);
      return;
    }
    const now = e.values && e.values[0] instanceof Date ? e.values[0] : new Date();
    const participantId = nextParticipantId_(data, now); const realEventId = eventId_(participantId, 'JOIN');
    const row = blankTrackerRow_();
    setRowValues_(row, {'참가자ID': participantId, '신청일시': now, '이름': name, '챌린지닉네임': nickname, '이메일주소': email, '휴대전화번호': phone,
      '알림수신채널': channel, '카카오수신동의': kakaoConsent, '현재레벨': 1, '현재칭호': '초보 요리사', 'Lv1상태': '진행중', 'Lv2상태': '잠김', 'Lv3상태': '잠김', 'Lv4상태': '잠김', 'Lv5상태': '잠김',
      '전체완료여부': '진행중', '현재레벨리마인드발송여부': 'N', '마지막처리이벤트ID': realEventId, '인증서발급상태': '미발급', '인증서멱등키': 'CERT|' + participantId + '|V1', 'Discord최근발송상태': '대기', '카카오최근발송상태': '건너뜀', '운영메모': ''});
    tracker.getRange(tracker.getLastRow() + 1, 1, 1, TRACKER_HEADERS.length).setValues([row]);
    const vars = participantVars_(row, 1, getMissionMap_(ss)[1]);
    vars['미션인증_사전작성URL'] = createMissionPrefillUrl_(participantId, '', 1);
    const sentResult = sendDiscordTemplate_('DISCORD_WELCOME_LV1', vars);
    row[IDX['Discord최근발송상태']] = sentResult.status;
    if (sentResult.status === '성공') { row[IDX['최근미션안내일시']] = now; row[IDX['다음리마인드예정일시']] = addDays_(now, getNumberConfig_('REMINDER_DAYS', APP.REMINDER_DAYS)); }
    tracker.getRange(tracker.getLastRow(), 1, 1, TRACKER_HEADERS.length).setValues([row]);
    appendLogs_(ss, [makeLogRow_({eventId: realEventId, idempotencyKey: joinKey, scenario: 'SCN-01_참가신청_웰컴발송', participantId: participantId, eventType: 'JOIN', submitLevel: 1, beforeLevel: 0, afterLevel: 1, result: '통과', reason: '신규 참가자 생성 및 Lv.1 개방', templateId: 'DISCORD_WELCOME_LV1', sendStatus: sentResult.status, retryCount: sentResult.retryCount, errorCode: sentResult.errorCode, errorMessage: sentResult.error})]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}


// -----------------------------------------------------------------------------
// 독립 실행: 미션 판정과 레벨업
// -----------------------------------------------------------------------------

function processMissionSubmission_(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss = getDatabase_(); const named = e.namedValues;
    const participantId = namedValue_(named, '참가자ID').trim();
    const email = normalizeEmail_(namedValue_(named, '이메일주소'));
    const level = parseLevel_(namedValue_(named, '제출 레벨'));
    const submissionId = 'SUB-' + (participantId || 'UNKNOWN') + '-L' + (level || 'X') + '-' + e.range.getRow();
    const eventId = eventId_(participantId || 'UNKNOWN', 'SUBMIT'); const passKey = 'PASS|' + participantId + '|L' + level;
    const tracker = ss.getSheetByName(APP.SHEETS.TRACKER); const data = getDataRows_(tracker, TRACKER_HEADERS.length);
    const rowIndex = data.findIndex((row) => String(row[IDX['참가자ID']]) === participantId && String(row[IDX['운영메모']]).indexOf(APP.SAMPLE_MARKER) < 0);
    if (rowIndex < 0) {
      const unknownVars = {'챌린지닉네임': '미등록 플레이어', '참가자ID': participantId || 'UNKNOWN', '현재레벨': level || '-', '현재칭호': '참가자 확인 필요', '진행도': '- / 5'};
      const sentResult = sendDiscordCustom_('❓ [PLAYER NOT FOUND] 참가자 확인 필요', unknownVars, '참가자ID를 찾을 수 없습니다. 참가 신청 후 다시 인증해 주세요.', APP.COLORS.TERRACOTTA, getConfigValue_('JOIN_FORM_PUBLISHED_URL'));
      appendLogs_(ss, [makeLogRow_({eventId: eventId, idempotencyKey: passKey, scenario: 'SCN-02_미션인증_검증_레벨업', participantId: participantId, submissionId: submissionId, eventType: 'SUBMIT', submitLevel: level, result: '참가자미확인', reason: '참가자ID로 트래커 행을 찾을 수 없음', templateId: 'DISCORD_PLAYER_NOT_FOUND', sendStatus: sentResult.status, retryCount: sentResult.retryCount, errorCode: sentResult.errorCode, errorMessage: sentResult.error})]);
      return;
    }
    const row = data[rowIndex]; const currentLevel = Number(row[IDX['현재레벨']]);
    const templates = getTemplateMap_(ss); const missionMap = getMissionMap_(ss);
    const vars = participantVars_(row, currentLevel, missionMap[currentLevel]);
    vars['제출레벨'] = level; vars['미션인증_사전작성URL'] = createMissionPrefillUrl_(participantId, '', currentLevel);
    if (email !== normalizeEmail_(row[IDX['이메일주소']])) { completeMissionFailure_(ss, row, eventId, passKey, submissionId, level, currentLevel, '참가자미확인', '참가 정보가 일치하지 않음', 'DISCORD_RESUBMIT_REQUIRED', vars, templates); return; }
    if (level < 1 || level > 5) { completeMissionFailure_(ss, row, eventId, passKey, submissionId, level, currentLevel, '미통과', '제출 레벨 값이 올바르지 않음', 'DISCORD_RESUBMIT_REQUIRED', vars, templates); return; }
    if (row[IDX['Lv' + level + '상태']] === '완료' || hasSuccessfulIdempotency_(ss, passKey)) { completeMissionFailure_(ss, row, eventId, passKey, submissionId, level, currentLevel, '중복', '이미 완료된 레벨 또는 동일 PASS 이벤트 처리됨', 'DISCORD_DUPLICATE_NOTICE', vars, templates); return; }
    if (level !== currentLevel) { completeMissionFailure_(ss, row, eventId, passKey, submissionId, level, currentLevel, '순서오류', '제출 레벨과 현재 진행 레벨이 다름', 'DISCORD_LEVEL_ORDER_NOTICE', vars, templates); return; }
    const validation = validateMission_(level, named);
    if (!validation.ok) { vars['판정사유'] = validation.reason; completeMissionFailure_(ss, row, eventId, passKey, submissionId, level, currentLevel, '미통과', validation.reason, 'DISCORD_RESUBMIT_REQUIRED', vars, templates); return; }
    const now = new Date();
    row[IDX['Lv' + level + '상태']] = '완료'; row[IDX['Lv' + level + '완료일시']] = now; row[IDX['Lv' + level + '제출ID']] = submissionId;
    row[IDX['현재레벨리마인드발송여부']] = 'N'; row[IDX['현재레벨리마인드발송일시']] = ''; row[IDX['마지막처리이벤트ID']] = eventId; row[IDX['카카오최근발송상태']] = '건너뜀';
    let afterLevel = level; let sentResult = {status: '건너뜀', error: '', retryCount: 0, errorCode: ''}; let templateId = '';
    if (level < 5) {
      afterLevel = level + 1; const nextMission = missionMap[afterLevel]; row[IDX['현재레벨']] = afterLevel; row[IDX['현재칭호']] = nextMission.title; row[IDX['Lv' + afterLevel + '상태']] = '진행중';
      tracker.getRange(rowIndex + 2, 1, 1, TRACKER_HEADERS.length).setValues([row]);
      const nextVars = participantVars_(row, afterLevel, nextMission); nextVars['이전레벨'] = level; nextVars['미션인증_사전작성URL'] = createMissionPrefillUrl_(participantId, '', afterLevel);
      templateId = 'DISCORD_LEVELUP_L' + afterLevel; sentResult = sendDiscordTemplate_(templateId, nextVars, templates); row[IDX['Discord최근발송상태']] = sentResult.status;
      if (sentResult.status === '성공') { row[IDX['최근미션안내일시']] = now; row[IDX['다음리마인드예정일시']] = addDays_(now, getNumberConfig_('REMINDER_DAYS', APP.REMINDER_DAYS)); }
    } else { row[IDX['전체완료여부']] = '완료'; }
    tracker.getRange(rowIndex + 2, 1, 1, TRACKER_HEADERS.length).setValues([row]);
    appendLogs_(ss, [makeLogRow_({eventId: eventId, idempotencyKey: passKey, scenario: 'SCN-02_미션인증_검증_레벨업', participantId: participantId, submissionId: submissionId, eventType: 'PASS', submitLevel: level, beforeLevel: currentLevel, afterLevel: afterLevel, result: '통과', reason: validation.reason, templateId: templateId, sendStatus: sentResult.status, retryCount: sentResult.retryCount, errorCode: sentResult.errorCode, errorMessage: sentResult.error})]);
    if (level === 5) issueCertificateForRow_(ss, tracker, row, rowIndex + 2);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}


function validateMission_(level, named) {
  const missing = [];
  const photo = namedValue_(named, '인증 사진').trim();
  if (!hasPhotoEvidence_(photo)) missing.push('인증 사진 URL 또는 업로드 파일');

  if (level === 1) {
    const ingredients = splitComponents_(namedValue_(named, '사용한 재료 목록'));
    if (ingredients.length < 3) missing.push('냉장고 재료 3가지 이상');
    if (!namedValue_(named, '완성한 요리 이름').trim()) missing.push('완성한 요리 이름');
  } else if (level === 2) {
    if (!namedValue_(named, '업그레이드한 자취요리').trim()) missing.push('업그레이드한 자취요리');
    if (!namedValue_(named, '나만의 업그레이드 한줄설명').trim()) missing.push('나만의 업그레이드 한줄설명');
  } else if (level === 3) {
    const table = namedValue_(named, '상차림 구성');
    const components = splitComponents_(table);
    if (components.length < 3) missing.push('메인요리 1개와 반찬 2개 이상(3개 구성요소를 구분해 작성)');
  } else if (level === 4) {
    if (!namedValue_(named, '창작 요리 이름').trim()) missing.push('창작 요리 이름');
    if (!namedValue_(named, '응용한 기존 레시피와 나만의 레시피 설명').trim()) missing.push('기존 레시피와 나만의 설명');
  } else if (level === 5) {
    if (!namedValue_(named, '인생 한 끼 요리 이름').trim()) missing.push('인생 한 끼 요리 이름');
    if (!namedValue_(named, '챌린지 완료 소감').trim()) missing.push('챌린지 완료 소감');
  }
  return missing.length ? {ok: false, reason: '누락/미충족: ' + missing.join(', ')} :
    {ok: true, reason: '사진 및 레벨별 객관적 필수값 충족'};
}

function completeMissionFailure_(ss, row, eventId, key, submissionId, level, currentLevel, result, reason, templateId, vars, templates) {
  vars['판정사유'] = reason; vars['제출레벨'] = level; vars['현재레벨'] = currentLevel;
  const sentResult = sendDiscordTemplate_(templateId, vars, templates);
  row[IDX['Discord최근발송상태']] = sentResult.status;
  appendLogs_(ss, [makeLogRow_({eventId: eventId, idempotencyKey: key, scenario: 'SCN-02_미션인증_검증_레벨업', participantId: row[IDX['참가자ID']], submissionId: submissionId, eventType: 'SUBMIT', submitLevel: level, beforeLevel: currentLevel, afterLevel: currentLevel, result: result, reason: reason, templateId: templateId, sendStatus: sentResult.status, retryCount: sentResult.retryCount, errorCode: sentResult.errorCode, errorMessage: sentResult.error})]);
}


// -----------------------------------------------------------------------------
// 인증서 발급
// -----------------------------------------------------------------------------

function issueCertificateForRow_(ss, tracker, row, sheetRowNumber) {
  const participantId = String(row[IDX['참가자ID']]); const certKey = 'CERT|' + participantId + '|V1'; const certId = 'CERT-' + participantId + '-V1';
  const allDone = [1, 2, 3, 4, 5].every((level) => row[IDX['Lv' + level + '상태']] === '완료');
  if (!allDone || row[IDX['전체완료여부']] !== '완료' || row[IDX['인증서발급상태']] === '처리중' || row[IDX['인증서발급상태']] === '발급완료' || hasSuccessfulIdempotency_(ss, certKey)) return {issued: false, reason: '발급 조건 미충족 또는 이미 처리됨'};
  row[IDX['인증서발급상태']] = '처리중'; row[IDX['인증서ID']] = certId; row[IDX['인증서멱등키']] = certKey;
  tracker.getRange(sheetRowNumber, 1, 1, TRACKER_HEADERS.length).setValues([row]); SpreadsheetApp.flush();
  const eventId = eventId_(participantId, 'CERT');
  try {
    const props = PropertiesService.getScriptProperties(); const templateFile = DriveApp.getFileById(props.getProperty(APP.PROP.CERT_TEMPLATE_ID)); const folder = DriveApp.getFolderById(props.getProperty(APP.PROP.CERT_FOLDER_ID));
    const pdfName = certId + '_' + sanitizeFilename_(row[IDX['챌린지닉네임']]) + '.pdf'; let pdfFile = null; const existing = folder.getFilesByName(pdfName);
    if (existing.hasNext()) pdfFile = existing.next();
    else {
      const slideCopy = templateFile.makeCopy(certId + '_작업본', folder); const deck = SlidesApp.openById(slideCopy.getId()); const completedAt = asDate_(row[IDX['Lv5완료일시']]) || new Date();
      const replacements = {'{{이름}}': '', '{{챌린지닉네임}}': String(row[IDX['챌린지닉네임']] || ''), '{{참가자ID}}': participantId, '{{인증서ID}}': certId, '{{완료일}}': Utilities.formatDate(completedAt, getConfigValue_('TIMEZONE') || APP.TIMEZONE, 'yyyy년 M월 d일')};
      Object.keys(replacements).forEach((token) => deck.replaceAllText(token, replacements[token])); deck.saveAndClose();
      const pdfBlob = DriveApp.getFileById(slideCopy.getId()).getAs(MimeType.PDF).setName(pdfName); pdfFile = folder.createFile(pdfBlob); DriveApp.getFileById(slideCopy.getId()).setTrashed(true);
    }
    row[IDX['인증서파일URL']] = pdfFile.getUrl(); row[IDX['인증서발급일시']] = new Date();
    tracker.getRange(sheetRowNumber, 1, 1, TRACKER_HEADERS.length).setValues([row]); SpreadsheetApp.flush();
    const vars = participantVars_(row, 5, getMissionMap_(ss)[5]); vars['인증서ID'] = certId; vars['인증서파일URL'] = pdfFile.getUrl();
    const sentResult = sendCertificateDiscord_(vars, pdfFile);
    row[IDX['Discord최근발송상태']] = sentResult.status;
    row[IDX['인증서발급상태']] = sentResult.status === '성공' ? '발급완료' : '발급실패';
    tracker.getRange(sheetRowNumber, 1, 1, TRACKER_HEADERS.length).setValues([row]);
    const certCompleted = sentResult.status === '성공';
    appendLogs_(ss, [makeLogRow_({eventId: eventId, idempotencyKey: certKey, scenario: 'SCN-02_미션인증_검증_레벨업', participantId: participantId, eventType: 'CERT', submitLevel: 5, beforeLevel: 5, afterLevel: 5, result: certCompleted ? '통과' : '미통과', reason: certCompleted ? 'Lv.1~Lv.5 완료 및 PDF 인증서 1회 발급·Discord 공유' : 'PDF 인증서 생성 완료, Discord 공유 실패', templateId: sentResult.templateId || 'DISCORD_CERT_COMPLETE', sendStatus: sentResult.status, retryCount: sentResult.retryCount, errorCode: sentResult.errorCode, errorMessage: sentResult.error, certificateId: certId})]);
    return {issued: certCompleted, certificateCreated: true, certificateUrl: pdfFile.getUrl(), discordStatus: sentResult.status, delivery: sentResult.delivery};
  } catch (err) {
    row[IDX['인증서발급상태']] = '발급실패'; tracker.getRange(sheetRowNumber, 1, 1, TRACKER_HEADERS.length).setValues([row]);
    const safeVars = participantVars_(row, 5, getMissionMap_(ss)[5]);
    const notice = sendDiscordCustom_('⚠️ [QUEST COMPLETE] 인증서 처리 확인 필요', safeVars, 'Lv.5 완료 기록은 저장되었습니다. 인증서 생성은 운영자가 다시 점검합니다.', APP.COLORS.TERRACOTTA, '');
    appendLogs_(ss, [makeLogRow_({eventId: eventId, idempotencyKey: certKey, scenario: 'SCN-02_미션인증_검증_레벨업', participantId: participantId, eventType: 'CERT', submitLevel: 5, beforeLevel: 5, afterLevel: 5, result: '미통과', reason: '인증서 발급 실패', templateId: 'DISCORD_CERT_ERROR', sendStatus: notice.status, retryCount: notice.retryCount, errorCode: 'CERT_ERROR', errorMessage: '인증서 생성 중 오류', certificateId: certId})]);
    console.error('인증서 생성 중 오류가 발생했습니다.'); return {issued: false, reason: '인증서 생성 중 오류'};
  }
}


// -----------------------------------------------------------------------------
// Discord 상태창 템플릿, 보안 설정, 전송·재시도, PDF fallback
// -----------------------------------------------------------------------------

function templateSeedRows_(now) {
  return [
    ['DISCORD_WELCOME_LV1', 'DISCORD', 'JOIN', '🍲 [SYSTEM] 첫 퀘스트가 도착했습니다', '챌린지에 입장했습니다. 냉장고 재료 3가지로 첫 경험치를 획득하세요.', '#B85C38', 'QUEST START', 'Lv.1 인증 Form', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_LEVELUP_L2', 'DISCORD', 'PASS_L1', '✨ [LEVEL UP] Lv.2 살림 9단 해금', 'Lv.1 통과! 자취요리를 나만의 방식으로 업그레이드하세요.', '#C9933E', 'SKILL UNLOCKED', 'Lv.2 인증 Form', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_LEVELUP_L3', 'DISCORD', 'PASS_L2', '✨ [LEVEL UP] Lv.3 집밥 마스터 해금', 'Lv.2 통과! 메인요리와 반찬으로 한 상을 완성하세요.', '#5F8F7B', 'NEW QUEST', 'Lv.3 인증 Form', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_LEVELUP_L4', 'DISCORD', 'PASS_L3', '✨ [LEVEL UP] Lv.4 창작 셰프 해금', 'Lv.3 통과! 기존 레시피에 나만의 아이디어를 더하세요.', '#B85C38', 'CREATION MODE', 'Lv.4 인증 Form', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_LEVELUP_L5', 'DISCORD', 'PASS_L4', '🏆 [FINAL QUEST] Lv.5 전설의 요리사', 'Lv.4 통과! 가장 자신 있는 인생 한 끼로 마지막 퀘스트를 완료하세요.', '#C9933E', 'FINAL QUEST', 'Lv.5 인증 Form', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_RESUBMIT_REQUIRED', 'DISCORD', 'FAIL', '🛠️ [RETRY] 인증 보완이 필요합니다', '진행 기록은 유지됩니다. 아래 판정 사유를 확인하고 다시 제출해 주세요.\n**판정 사유:** {{판정사유}}', '#B85C38', 'RESUBMIT', '다시 인증하기', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_LEVEL_ORDER_NOTICE', 'DISCORD', 'ORDER', '🔒 [LOCKED] 현재 퀘스트부터 진행해 주세요', '제출 레벨 Lv.{{제출레벨}}과 현재 레벨 Lv.{{현재레벨}}이 다릅니다.', '#C9933E', 'ORDER ERROR', '현재 퀘스트 인증', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_DUPLICATE_NOTICE', 'DISCORD', 'DUPLICATE', '♻️ [DUPLICATE] 이미 완료된 퀘스트입니다', '완료 기록은 안전하게 보관되어 있습니다. 현재 Lv.{{현재레벨}}부터 이어가 주세요.', '#5F8F7B', 'NO DUPLICATE XP', '현재 퀘스트 보기', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_REMINDER_D5', 'DISCORD', 'REMIND_D5', '⏰ [QUEST REMINDER] 퀘스트가 기다리고 있어요', '미션 안내 후 5일이 지났습니다. 오늘 한 숟갈부터 다시 시작해 보세요.', '#C9933E', 'D5 REMINDER', '퀘스트 이어하기', '{{미션인증_사전작성URL}}', 'Y', '2.0', now],
    ['DISCORD_CERT_COMPLETE', 'DISCORD', 'CERT', '🏆 [QUEST COMPLETE] 전설의 요리사 탄생', 'Lv.1~Lv.5 모든 퀘스트 완료! 인증서 ID: `{{인증서ID}}`', '#5F8F7B', 'COMPLETE 5 / 5', '인증서 보기', '{{인증서파일URL}}', 'Y', '2.0', now]
  ];
}

function setDiscordWebhookUrl() {
  const props = PropertiesService.getScriptProperties();
  let url = '';
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt('Discord Webhook 안전 입력', 'Discord 채널 설정 > 연동 > Webhook에서 복사한 전체 URL을 입력하세요. URL은 Script Properties에만 저장되며 시트·로그에 기록되지 않습니다.', ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return '취소했습니다.';
    url = String(response.getResponseText() || '').trim();
  } catch (uiError) {
    // 독립형(script.google.com) 프로젝트에는 Spreadsheet UI가 없을 수 있습니다.
    // 그 경우 프로젝트 설정 > 스크립트 속성에 DISCORD_WEBHOOK_URL을 직접 추가한 뒤
    // 이 함수를 다시 실행하면, 인자·반환·로그 노출 없이 형식 검증과 상태 갱신만 수행합니다.
    url = String(props.getProperty(APP.PROP.DISCORD_WEBHOOK_URL) || '').trim();
    if (!url) throw new Error('Spreadsheet UI가 없습니다. 프로젝트 설정의 스크립트 속성에 DISCORD_WEBHOOK_URL을 추가한 뒤 다시 실행하세요.');
  }
  if (!isValidDiscordWebhookUrl_(url)) throw new Error('Discord Incoming Webhook URL 형식이 올바르지 않습니다.');
  props.setProperty(APP.PROP.DISCORD_WEBHOOK_URL, url);
  try { setConfigValues_({DISCORD_WEBHOOK_CONFIGURED: 'Y'}); SpreadsheetApp.flush(); } catch (ignored) {}
  return 'Discord Webhook URL을 Script Properties에 안전하게 저장하고 검증했습니다.';
}

function testDiscordWebhook() {
  const payload = buildDiscordPayload_({title: '✅ [SYSTEM CHECK] Discord 연결 성공', description: '냉장고 파먹기 상태창 Webhook이 정상 연결되었습니다.', color: APP.COLORS.MINT, fields: [{name: '공개 범위', value: '챌린지닉네임 + 참가자ID만', inline: false}], footer: 'allowed_mentions 차단 적용'});
  const result = postDiscordWebhook_(payload, null);
  if (result.status !== '성공') throw new Error('Discord 테스트 전송 실패: ' + result.errorCode);
  return 'Discord 테스트 메시지를 전송했습니다.';
}

function clearDiscordWebhookUrl() {
  PropertiesService.getScriptProperties().deleteProperty(APP.PROP.DISCORD_WEBHOOK_URL);
  try { setConfigValues_({DISCORD_WEBHOOK_CONFIGURED: 'N'}); SpreadsheetApp.flush(); } catch (ignored) {}
  return 'Discord Webhook URL을 Script Properties에서 삭제했습니다.';
}

function sendDiscordTemplate_(templateId, vars, templateMap) {
  const templates = templateMap || getTemplateMap_(getDatabase_()); const tpl = templates[templateId];
  if (!tpl || tpl.active !== 'Y') return {status: '건너뜀', error: '비활성 또는 없는 템플릿', errorCode: 'TEMPLATE_MISSING', retryCount: 0};
  const fields = publicStatusFields_(vars);
  if (vars['미션내용']) fields.push({name: '📜 퀘스트', value: truncateDiscord_(vars['미션내용'], 1024), inline: false});
  if (vars['인증방법']) fields.push({name: '📷 인증 방법', value: truncateDiscord_(vars['인증방법'], 1024), inline: false});
  if (vars['보상문구']) fields.push({name: '🎁 보상', value: truncateDiscord_(vars['보상문구'], 1024), inline: false});
  const ctaUrl = renderText_(tpl.ctaUrl, vars, false);
  if (ctaUrl) fields.push({name: '🔗 ' + (tpl.ctaText || '바로가기'), value: '[열기](' + sanitizeDiscordUrl_(ctaUrl) + ')', inline: false});
  const payload = buildDiscordPayload_({title: renderText_(tpl.title, vars, false), description: renderText_(tpl.description, vars, false), color: tpl.color, fields: fields, footer: tpl.statusLabel + ' · 게임 상태창 70% + 레시피북 30%'});
  return postDiscordWebhook_(payload, null);
}

function sendDiscordCustom_(title, vars, description, color, ctaUrl) {
  const fields = publicStatusFields_(vars);
  if (ctaUrl) fields.push({name: '🔗 바로가기', value: '[열기](' + sanitizeDiscordUrl_(ctaUrl) + ')', inline: false});
  return postDiscordWebhook_(buildDiscordPayload_({title: title, description: description, color: color, fields: fields, footer: '냉장고 파먹기 상태창'}), null);
}

function sendCertificateDiscord_(vars, pdfFile) {
  const template = getTemplateMap_(getDatabase_())['DISCORD_CERT_COMPLETE'];
  const base = {title: renderText_(template.title, vars, false), description: renderText_(template.description, vars, false), color: template.color, fields: publicStatusFields_(vars).concat([{name: '🏷️ 인증서 ID', value: '`' + truncateDiscord_(vars['인증서ID'], 100) + '`', inline: false}]), footer: 'COMPLETE 5 / 5 · 전설의 요리사'};
  const blob = pdfFile.getBlob().setName(pdfFile.getName());
  if (blob.getBytes().length <= APP.DISCORD_SAFE_ATTACHMENT_BYTES) {
    const attached = postDiscordWebhook_(buildDiscordPayload_(base), blob);
    if (attached.status === '성공') { attached.delivery = 'PDF_ATTACHMENT'; attached.templateId = 'DISCORD_CERT_COMPLETE'; return attached; }
  }
  let link = pdfFile.getUrl();
  try { pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); link = pdfFile.getUrl(); } catch (ignored) {}
  const fallback = Object.assign({}, base);
  fallback.description += '\n\nPDF 직접 첨부가 불가능하여 Drive 보기 링크로 제공합니다.';
  fallback.fields = base.fields.concat([{name: '📄 인증서 보기', value: '[Google Drive에서 열기](' + sanitizeDiscordUrl_(link) + ')', inline: false}]);
  const sent = postDiscordWebhook_(buildDiscordPayload_(fallback), null);
  sent.delivery = 'DRIVE_LINK_FALLBACK'; sent.templateId = 'DISCORD_CERT_COMPLETE_FALLBACK';
  return sent;
}

function buildDiscordPayload_(options) {
  return {allowed_mentions: {parse: []}, embeds: [{title: truncateDiscord_(sanitizeDiscordText_(options.title || ''), 256), description: truncateDiscord_(sanitizeDiscordText_(options.description || ''), 4096), color: discordColor_(options.color), fields: (options.fields || []).slice(0, 25).map((field) => ({name: truncateDiscord_(sanitizeDiscordText_(field.name || ''), 256), value: truncateDiscord_(sanitizeDiscordText_(field.value || '-'), 1024), inline: Boolean(field.inline)})), footer: {text: truncateDiscord_(sanitizeDiscordText_(options.footer || ''), 2048)}, timestamp: new Date().toISOString()}]};
}

function publicStatusFields_(vars) {
  return [
    {name: '🎮 플레이어', value: truncateDiscord_(vars['챌린지닉네임'] || '플레이어', 100), inline: true},
    {name: '🪪 참가자ID', value: '`' + truncateDiscord_(vars['참가자ID'] || 'UNKNOWN', 100) + '`', inline: true},
    {name: '📊 상태', value: 'Lv.' + truncateDiscord_(vars['현재레벨'] || '-', 10) + ' ' + truncateDiscord_(vars['현재칭호'] || '', 100) + '\n진행도 ' + truncateDiscord_(vars['진행도'] || '- / 5', 20), inline: false}
  ];
}

function postDiscordWebhook_(payload, blob) {
  const url = getDiscordWebhookUrl_();
  payload.allowed_mentions = {parse: []};
  const endpoint = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'wait=true';
  let retryCount = 0; let lastCode = 0;
  for (let attempt = 1; attempt <= APP.DISCORD_MAX_ATTEMPTS; attempt++) {
    try {
      const options = {method: 'post', muteHttpExceptions: true};
      if (blob) options.payload = {'payload_json': JSON.stringify(payload), 'files[0]': blob};
      else { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
      const response = UrlFetchApp.fetch(endpoint, options); const code = response.getResponseCode(); lastCode = code;
      if (code >= 200 && code < 300) return {status: '성공', error: '', errorCode: '', retryCount: retryCount, httpCode: code};
      if (attempt < APP.DISCORD_MAX_ATTEMPTS && (code === 429 || (code >= 500 && code <= 599))) {
        const waitMs = code === 429 ? discordRetryAfterMs_(response) : Math.min(1000 * Math.pow(2, attempt - 1), APP.DISCORD_MAX_RETRY_MS);
        Utilities.sleep(waitMs); retryCount++; continue;
      }
      return {status: '실패', error: 'Discord HTTP 응답 오류', errorCode: 'HTTP_' + code, retryCount: retryCount, httpCode: code};
    } catch (err) {
      if (attempt < APP.DISCORD_MAX_ATTEMPTS) { Utilities.sleep(Math.min(1000 * Math.pow(2, attempt - 1), APP.DISCORD_MAX_RETRY_MS)); retryCount++; continue; }
      return {status: '실패', error: 'Discord 네트워크 전송 오류', errorCode: 'NETWORK_ERROR', retryCount: retryCount, httpCode: lastCode};
    }
  }
  return {status: '실패', error: 'Discord 재시도 한도 초과', errorCode: 'RETRY_EXHAUSTED', retryCount: retryCount, httpCode: lastCode};
}

function discordRetryAfterMs_(response) {
  let seconds = NaN;
  try {
    const parsed = JSON.parse(response.getContentText() || '{}');
    if (Number.isFinite(Number(parsed.retry_after))) seconds = Number(parsed.retry_after);
  } catch (ignored) {}
  if (!Number.isFinite(seconds)) {
    try {
      const headers = response.getAllHeaders ? response.getAllHeaders() : response.getHeaders();
      const retryHeader = headers['Retry-After'] || headers['retry-after'];
      if (Number.isFinite(Number(retryHeader))) seconds = Number(retryHeader);
    } catch (ignored) {}
  }
  if (!Number.isFinite(seconds)) seconds = 1;
  if (seconds > 1000) seconds = seconds / 1000;
  return Math.max(250, Math.min(Math.ceil(seconds * 1000), APP.DISCORD_MAX_RETRY_MS));
}

function getDiscordWebhookUrl_() {
  const url = PropertiesService.getScriptProperties().getProperty(APP.PROP.DISCORD_WEBHOOK_URL);
  if (!url || !isValidDiscordWebhookUrl_(url)) throw new Error('Script Properties에 유효한 DISCORD_WEBHOOK_URL을 먼저 설정하세요.');
  return url;
}

function isValidDiscordWebhookUrl_(url) {
  return /^https:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+(?:\?.*)?$/.test(String(url || '').trim());
}

function discordColor_(value) {
  const hex = String(value || '#3B2A22').replace('#', ''); const n = parseInt(hex, 16); return Number.isFinite(n) ? n : 3877410;
}
function truncateDiscord_(value, limit) { const text = String(value === undefined || value === null ? '' : value); return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…'; }
function sanitizeDiscordText_(value) { return String(value || '').replace(/@/g, '@\u200b'); }
function sanitizeDiscordUrl_(value) { const url = String(value || '').trim(); return /^https:\/\//i.test(url) ? url.replace(/[()<>\s]/g, (c) => encodeURIComponent(c)) : ''; }


// -----------------------------------------------------------------------------
// 데이터 조회, 로그, ID, 사전 작성 URL
// -----------------------------------------------------------------------------

function getDatabase_() {
  const id = PropertiesService.getScriptProperties().getProperty(APP.PROP.SPREADSHEET_ID);
  if (!id) throw new Error('먼저 setupFridgeChallenge()를 실행하세요.');
  return SpreadsheetApp.openById(id);
}

function getMissionMap_(ss) {
  const rows = getDataRows_(ss.getSheetByName(APP.SHEETS.MISSIONS), MISSION_HEADERS.length);
  return rows.reduce((map, row) => {
    const level = Number(row[0]);
    map[level] = {level: level, title: row[1], mission: row[2], proof: row[3], photoRequired: row[4], requiredFields: row[5], rule: row[6], nextLevel: row[7], reward: row[8], active: row[9]};
    return map;
  }, {});
}

function getTemplateMap_(ss) {
  const rows = getDataRows_(ss.getSheetByName(APP.SHEETS.TEMPLATES), TEMPLATE_HEADERS.length);
  return rows.reduce((map, row) => {
    map[String(row[0])] = {channel: row[1], eventCode: row[2], title: row[3], description: row[4], color: row[5], statusLabel: row[6], ctaText: row[7], ctaUrl: row[8], active: row[9]};
    return map;
  }, {});
}


function participantVars_(row, level, mission) {
  const completed = [1, 2, 3, 4, 5].filter((n) => row[IDX['Lv' + n + '상태']] === '완료').length;
  return {'챌린지닉네임': row[IDX['챌린지닉네임']], '참가자ID': row[IDX['참가자ID']], '현재레벨': level,
    '현재칭호': mission ? mission.title : row[IDX['현재칭호']], '퀘스트상태': row[IDX['전체완료여부']] === '완료' ? 'COMPLETE' : '진행중',
    '미션내용': mission ? mission.mission : '', '인증방법': mission ? mission.proof : '', '보상문구': mission ? mission.reward : '',
    '진행도': completed + ' / 5', '할머니한마디': grandmaQuote_(level), '인증서ID': row[IDX['인증서ID']] || '', '인증서파일URL': row[IDX['인증서파일URL']] || ''};
}


function createMissionPrefillUrl_(participantId, ignoredEmail, level) {
  const formId = PropertiesService.getScriptProperties().getProperty(APP.PROP.MISSION_FORM_ID);
  if (!formId) return '';
  const form = FormApp.openById(formId);
  const levelItem = findFormItemByTitle_(form, '제출 레벨').asMultipleChoiceItem();
  const participantItem = findFormItemByTitle_(form, '참가자ID').asTextItem();
  const emailItem = findFormItemByTitle_(form, '이메일주소').asTextItem();
  // 공개 Discord 링크에는 이메일 값을 넣지 않습니다. URL에 PII가 노출되지 않으면서도
  // 빈 응답을 명시해 Forms 사전 작성 응답 객체를 안정적으로 생성합니다.
  return form.createResponse()
    .withItemResponse(levelItem.createResponse('Lv.' + level))
    .withItemResponse(participantItem.createResponse(String(participantId)))
    .withItemResponse(emailItem.createResponse(''))
    .toPrefilledUrl();
}


function findFormItemByTitle_(form, title) {
  const item = form.getItems().find((candidate) => candidate.getTitle() === title);
  if (!item) throw new Error('Form 문항을 찾을 수 없습니다: ' + title);
  return item;
}

function getFormItemIdByTitle_(form, title) {
  try { return findFormItemByTitle_(form, title).getId(); } catch (err) { return ''; }
}

function hasSuccessfulIdempotency_(ss, key) {
  return getSuccessfulIdempotencyKeys_(ss).has(key);
}

function getSuccessfulIdempotencyKeys_(ss) {
  const rows = getDataRows_(ss.getSheetByName(APP.SHEETS.LOG), LOG_HEADERS.length);
  const keys = new Set();
  rows.forEach((row) => {
    // 업무 판정 통과와 Discord 발송 성공을 모두 만족해야 멱등 완료로 봅니다.
    // 판정만 통과하고 전송이 실패한 이벤트는 운영자가 재시도할 수 있어야 합니다.
    if (row[2] && row[11] === '통과' && row[16] === '성공') keys.add(String(row[2]));
  });
  return keys;
}

function makeLogRow_(o) {
  return [new Date(), o.eventId || '', o.idempotencyKey || '', o.scenario || '', o.makeExecutionId || '', o.participantId || '', o.submissionId || '', o.eventType || '', valueOrBlank_(o.submitLevel), valueOrBlank_(o.beforeLevel), valueOrBlank_(o.afterLevel), o.result || '', o.reason || '', o.sendChannel || 'DISCORD', o.participantId ? '닉네임+참가자ID' : '시스템', o.templateId || '', o.sendStatus || '건너뜀', o.retryCount || 0, o.errorCode || '', o.errorMessage || '', o.certificateId || '', new Date()];
}


function appendLogs_(ss, rows) {
  if (!rows || !rows.length) return;
  const sheet = ss.getSheetByName(APP.SHEETS.LOG);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
}

function nextParticipantId_(trackerRows, now) {
  const datePart = Utilities.formatDate(now, getConfigValue_('TIMEZONE') || APP.TIMEZONE, 'yyyyMMdd');
  const prefix = 'FC-' + datePart + '-';
  const max = trackerRows.reduce((current, row) => {
    const id = String(row[IDX['참가자ID']] || '');
    if (id.indexOf(prefix) !== 0) return current;
    const n = Number(id.slice(prefix.length));
    return Number.isFinite(n) ? Math.max(current, n) : current;
  }, 0);
  return prefix + String(max + 1).padStart(4, '0');
}

function eventId_(participantId, code) {
  return 'EVT-' + Utilities.formatDate(new Date(), getConfigValue_('TIMEZONE') || APP.TIMEZONE, 'yyyyMMddHHmmss') + '-' + participantId + '-' + code;
}

// -----------------------------------------------------------------------------
// CONFIG와 공통 유틸리티
// -----------------------------------------------------------------------------

function getConfig_() {
  const ss = getDatabase_();
  const sheet = ss.getSheetByName(APP.SHEETS.CONFIG);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  return rows.reduce((map, row) => {
    if (row[0]) map[String(row[0])] = row[1];
    return map;
  }, {});
}

function getConfigValue_(key) {
  return getConfig_()[key];
}

function getNumberConfig_(key, fallback) {
  const n = Number(getConfigValue_(key));
  return Number.isFinite(n) ? n : fallback;
}

function setConfigValues_(updates) {
  const ss = getDatabase_();
  const sheet = ss.getSheetByName(APP.SHEETS.CONFIG);
  const data = sheet.getDataRange().getValues();
  const keyToRow = {};
  for (let i = 1; i < data.length; i++) keyToRow[String(data[i][0])] = i;
  Object.keys(updates).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(keyToRow, key)) {
      data[keyToRow[key]][1] = updates[key];
    } else {
      data.push([key, updates[key], '']);
    }
  });
  sheet.getRange(1, 1, data.length, Math.max(3, data[0].length)).setValues(data.map((row) => [row[0] || '', row[1] === undefined ? '' : row[1], row[2] || '']));
}

function removeManagedTriggers_() {
  const managed = new Set(['handleSpreadsheetFormSubmit', 'runFiveDayReminders']);
  let count = 0;
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (managed.has(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  });
  return count;
}

function replaceSheetData_(sheet, headers, rows) {
  sheet.clear();
  const all = [headers].concat(rows);
  sheet.getRange(1, 1, all.length, headers.length).setValues(all);
}

function getDataRows_(sheet, width) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

function formatTable_(sheet, width, color) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setBackground(color).setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, width).setVerticalAlignment('top').setWrap(true);
  sheet.autoResizeColumns(1, Math.min(width, 12));
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (sheet.getLastRow() >= 1 && sheet.getLastColumn() >= width) sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), width).createFilter();
}

function styleResponseSheet_(sheet) {
  sheet.setFrozenRows(1);
  const width = Math.max(sheet.getLastColumn(), 1);
  sheet.getRange(1, 1, 1, width).setBackground(APP.COLORS.BROWN).setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
}

function headersMatch_(sheet, headers) {
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < headers.length) return false;
  const values = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  return headers.every((header, i) => values[i] === header);
}

function sampleTrackerRows_() {
  const purposes = ['정상진행', '사진누락', '순서점프', '중복제출', '리마인드', '인증서중복'];
  return purposes.map((purpose, index) => {
    const row = blankTrackerRow_();
    setRowValues_(row, {'참가자ID': 'FC-TEST-' + String(index + 1).padStart(4, '0'), '신청일시': new Date('2026-07-26T10:15:00+09:00'), '이름': '비공개테스트' + (index + 1), '챌린지닉네임': purpose, '이메일주소': 'test' + (index + 1) + '@example.com', '휴대전화번호': '', '알림수신채널': 'Discord 공개 채널', '카카오수신동의': 'N', '현재레벨': 1, '현재칭호': '초보 요리사', 'Lv1상태': '진행중', 'Lv2상태': '잠김', 'Lv3상태': '잠김', 'Lv4상태': '잠김', 'Lv5상태': '잠김', '전체완료여부': '진행중', '현재레벨리마인드발송여부': 'N', '인증서발급상태': '미발급', '인증서멱등키': 'CERT|FC-TEST-' + String(index + 1).padStart(4, '0') + '|V1', 'Discord최근발송상태': '건너뜀', '카카오최근발송상태': '건너뜀', '운영메모': APP.SAMPLE_MARKER + ' | ' + purpose});
    if (purpose === '리마인드') { row[IDX['최근미션안내일시']] = new Date('2026-07-20T09:00:00+09:00'); row[IDX['다음리마인드예정일시']] = new Date('2026-07-25T09:00:00+09:00'); }
    return row;
  });
}


function blankTrackerRow_() {
  return new Array(TRACKER_HEADERS.length).fill('');
}

function setRowValues_(row, values) {
  Object.keys(values).forEach((key) => { row[IDX[key]] = values[key]; });
}

function namedValue_(namedValues, title) {
  const value = namedValues[title];
  if (Array.isArray(value)) return value.join(', ');
  return value === undefined || value === null ? '' : String(value);
}

function parseLevel_(value) {
  const match = String(value || '').match(/([1-5])/);
  return match ? Number(match[1]) : 0;
}

function splitComponents_(value) {
  return String(value || '').split(/[,;\n|·]+/).map((part) => part.trim()).filter(Boolean);
}

function hasPhotoEvidence_(value) {
  const parts = String(value || '').split(/[,\n]+/).map((part) => part.trim()).filter(Boolean);
  return parts.some((part) =>
    /^https?:\/\//i.test(part) ||
    /^[-\w]{20,}$/.test(part) ||
    /(?:drive\.google\.com|docs\.google\.com)\//i.test(part)
  );
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail_(value));
}




function renderText_(template, vars, escapeForHtml) {
  return String(template || '').replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
    const value = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
    return escapeForHtml ? escapeHtml_(String(value === null || value === undefined ? '' : value)) : String(value === null || value === undefined ? '' : value);
  });
}

function escapeHtml_(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function grandmaQuote_(level) {
  const quotes = {
    1: '있는 재료부터 찬찬히 꺼내 보자. 한 끼는 거기서 시작된단다.',
    2: '늘 먹던 음식도 손끝 하나 바꾸면 새 맛이 나는 법이지.',
    3: '한 상에는 맛도 담기고, 차린 사람의 마음도 담긴단다.',
    4: '레시피는 길잡이란다. 마지막 맛은 네 손으로 완성해 보렴.',
    5: '제일 자신 있는 한 끼에는 네 이야기를 듬뿍 담아 보렴.'
  };
  return quotes[level] || quotes[1];
}

function addDays_(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

function asDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, APP.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function sanitizeFilename_(value) {
  return String(value || '참가자').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

function valueOrBlank_(value) {
  return value === undefined || value === null ? '' : value;
}

function deleteUnusedBlankSheets_(ss) {
  ss.getSheets().forEach((sheet) => {
    if ((sheet.getName() === 'Sheet1' || sheet.getName() === '시트1') && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });
}

function isAccessibleForm_(id) {
  if (!id) return false;
  try { FormApp.openById(id); return true; } catch (err) { return false; }
}

function isAccessibleFile_(id) {
  if (!id) return false;
  try { DriveApp.getFileById(id); return true; } catch (err) { return false; }
}

function isAccessibleFolder_(id) {
  if (!id) return false;
  try { DriveApp.getFolderById(id); return true; } catch (err) { return false; }
}
