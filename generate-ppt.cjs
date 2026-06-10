// Sellio 졸업프로젝트 발표자료 생성 (pptxgenjs)
// 실행: npm install pptxgenjs --no-save && node generate-ppt.cjs
const PptxGenJS = require('pptxgenjs');
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inch
pptx.author = 'Sellio';
pptx.company = '졸업프로젝트';
pptx.title = 'Sellio - 쿠팡/네이버 셀러 발주 자동화 플랫폼';

const FONT = 'Malgun Gothic';
const BLUE = '3182F6';
const NAVY = '111827';
const GRAY = '6B7280';
const LIGHT = 'F2F4F6';
const GREEN = '22C55E';
const ORANGE = 'F59E0B';
const WHITE = 'FFFFFF';

// ---- 공통 헬퍼 ----
function header(slide, no, kicker, title) {
  slide.background = { color: WHITE };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: NAVY } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 0.9, fill: { color: BLUE } });
  slide.addText(kicker, { x: 0.55, y: 0.12, w: 10, h: 0.28, fontFace: FONT, fontSize: 11, color: BLUE, bold: true, charSpacing: 2 });
  slide.addText(title, { x: 0.55, y: 0.36, w: 11.5, h: 0.45, fontFace: FONT, fontSize: 23, color: WHITE, bold: true });
  slide.addText(String(no).padStart(2, '0'), { x: 12.3, y: 0.2, w: 0.8, h: 0.5, fontFace: FONT, fontSize: 20, color: BLUE, bold: true, align: 'right' });
}

function card(slide, x, y, w, h, opt = {}) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: opt.fill || LIGHT }, line: opt.line ? { color: opt.line, width: 1 } : { color: 'E5E7EB', width: 1 }, shadow: opt.shadow ? { type: 'outer', blur: 6, offset: 2, angle: 90, color: 'BBBBBB', opacity: 0.3 } : undefined });
}

function bullet(slide, x, y, w, items, opt = {}) {
  slide.addText(
    items.map(t => ({ text: t, options: { bullet: { code: '2022', indent: 14 }, fontSize: opt.fontSize || 15, color: opt.color || '374151', paraSpaceAfter: opt.gap != null ? opt.gap : 10, fontFace: FONT } })),
    { x, y, w, h: opt.h || 4, valign: 'top' }
  );
}

// ============ 1. 표지 ============
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 4.55, w: 13.33, h: 0.07, fill: { color: BLUE } });
  // 로고 마크
  s.addShape(pptx.ShapeType.roundRect, { x: 5.3, y: 1.45, w: 0.85, h: 0.85, rectRadius: 0.18, fill: { color: BLUE } });
  s.addText('S', { x: 5.3, y: 1.45, w: 0.85, h: 0.85, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 40, bold: true, color: WHITE });
  s.addText('Sellio', { x: 6.2, y: 1.5, w: 3, h: 0.8, valign: 'middle', fontFace: FONT, fontSize: 44, bold: true, color: WHITE });
  s.addText('쿠팡 · 네이버 셀러 발주 자동화 플랫폼', { x: 1, y: 2.75, w: 11.33, h: 0.7, align: 'center', fontFace: FONT, fontSize: 26, bold: true, color: WHITE });
  s.addText('주문 수집부터 공급처 발주서 · 송장 등록까지 한 번에', { x: 1, y: 3.5, w: 11.33, h: 0.5, align: 'center', fontFace: FONT, fontSize: 15, color: 'A5B4CB' });
  s.addText('졸업프로젝트 발표자료', { x: 1, y: 4.9, w: 11.33, h: 0.4, align: 'center', fontFace: FONT, fontSize: 14, color: BLUE, bold: true, charSpacing: 2 });
  s.addText('2026', { x: 1, y: 5.35, w: 11.33, h: 0.4, align: 'center', fontFace: FONT, fontSize: 12, color: GRAY });
}

// ============ 2. 문제 정의 ============
{
  const s = pptx.addSlide();
  header(s, 2, 'PROBLEM', '셀러의 반복 수작업, 어디서 시간이 새는가');
  const probs = [
    ['주문 수집', '쿠팡·네이버 채널마다 따로 접속해\n주문을 일일이 엑셀로 내려받음'],
    ['공급처 발주', '상품마다 공급처가 다른데\n손으로 분류해 발주서를 따로 작성'],
    ['송장 등록', '공급처가 보낸 송장을\n주문과 대조해 하나씩 입력'],
  ];
  probs.forEach((p, i) => {
    const x = 0.7 + i * 4.15;
    card(s, x, 1.5, 3.8, 3.6, { shadow: true });
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.3, y: 1.85, w: 0.7, h: 0.7, rectRadius: 0.14, fill: { color: 'FEE2E2' } });
    s.addText(['①', '②', '③'][i], { x: x + 0.3, y: 1.85, w: 0.7, h: 0.7, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 24, bold: true, color: 'EF4444' });
    s.addText(p[0], { x: x + 0.3, y: 2.75, w: 3.2, h: 0.5, fontFace: FONT, fontSize: 19, bold: true, color: NAVY });
    s.addText(p[1], { x: x + 0.3, y: 3.3, w: 3.2, h: 1.4, fontFace: FONT, fontSize: 13.5, color: GRAY, lineSpacingMultiple: 1.15 });
  });
  s.addText('→ 채널·공급처·송장이 늘어날수록 실수와 소요 시간이 기하급수적으로 증가', { x: 0.7, y: 5.45, w: 12, h: 0.6, align: 'center', fontFace: FONT, fontSize: 16, bold: true, color: NAVY, fill: { color: LIGHT } });
}

// ============ 3. 솔루션 개요 ============
{
  const s = pptx.addSlide();
  header(s, 3, 'SOLUTION', 'Sellio — 발주 프로세스 전 과정을 자동화');
  const feats = [
    ['🔗', '채널 API 연동', '쿠팡·네이버 주문/상품을\nAPI로 자동 수집'],
    ['🧩', '상품 ↔ 공급처 매핑', '상품마다 공급처를 지정해\n발주 기준을 한 번만 설정'],
    ['📑', '통합 발주서 자동 생성', '주문을 공급처별로 묶어\n엑셀 발주서를 자동 분리'],
    ['🚚', '송장 일괄 등록', '송장 양식 다운로드 →\n업로드 한 번으로 일괄 반영'],
  ];
  feats.forEach((f, i) => {
    const x = 0.6 + (i % 2) * 6.2;
    const y = 1.45 + Math.floor(i / 2) * 1.95;
    card(s, x, y, 5.9, 1.75, { shadow: true });
    s.addText(f[0], { x: x + 0.25, y: y + 0.3, w: 1, h: 1, fontSize: 34, align: 'center' });
    s.addText(f[1], { x: x + 1.35, y: y + 0.28, w: 4.3, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: BLUE });
    s.addText(f[2], { x: x + 1.35, y: y + 0.78, w: 4.3, h: 0.8, fontFace: FONT, fontSize: 13.5, color: GRAY, lineSpacingMultiple: 1.1 });
  });
}

// ============ 4. 시스템 구성 ============
{
  const s = pptx.addSlide();
  header(s, 4, 'ARCHITECTURE', '시스템 구성도');
  const box = (x, y, w, h, title, sub, color) => {
    card(s, x, y, w, h, { fill: WHITE, line: color, shadow: true });
    s.addText(title, { x, y: y + 0.18, w, h: 0.45, align: 'center', fontFace: FONT, fontSize: 16, bold: true, color });
    s.addText(sub, { x: x + 0.15, y: y + 0.62, w: w - 0.3, h: h - 0.7, align: 'center', fontFace: FONT, fontSize: 11.5, color: GRAY, lineSpacingMultiple: 1.05 });
  };
  box(0.7, 1.6, 3.5, 1.7, '셀러 (3명)', 'API 연동 · 상품 매핑\n주문관리 · 예치금', BLUE);
  box(0.7, 3.7, 3.5, 1.7, '관리자', '주문 수집 · 통합 발주서\n송장 등록 · 셀러/예치금', 'EF4444');
  box(4.95, 2.65, 3.45, 1.7, 'Sellio 서버', 'Node.js · Express\nREST API · 엑셀 엔진', NAVY);
  box(9.15, 1.6, 3.5, 1.7, '외부 채널 API', '쿠팡 OPEN API\n네이버 커머스 API', GREEN);
  box(9.15, 3.7, 3.5, 1.7, '공급처', '하루팜 · 늘푸른우리\n발주서 수신 / 송장 회신', ORANGE);
  // 연결선
  const line = (x1, y1, x2, y2) => s.addShape(pptx.ShapeType.line, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: '9CA3AF', width: 1.5, dashType: 'dash' } });
  line(4.2, 2.45, 4.95, 3.1); line(4.2, 4.55, 4.95, 3.9);
  line(8.4, 3.1, 9.15, 2.45); line(8.4, 3.9, 9.15, 4.55);
  s.addText('셀러·관리자는 Sellio 서버를 통해 외부 채널/공급처와 연결됩니다', { x: 0.7, y: 5.65, w: 12, h: 0.5, align: 'center', fontFace: FONT, fontSize: 13, color: GRAY, italic: true });
}

// ============ 5. 핵심 워크플로우 ============
{
  const s = pptx.addSlide();
  header(s, 5, 'WORKFLOW', '핵심 워크플로우 (End-to-End)');
  const steps = [
    ['1', '주문 수집', '쿠팡/네이버\n주문 자동 조회', BLUE],
    ['2', '상품 매핑', '상품 → 공급처\n매핑 기준 적용', '8B5CF6'],
    ['3', '발주서 생성', '공급처별\n엑셀 자동 분리', ORANGE],
    ['4', '발주 전달', '공급처에 발주서\n전달 → 출고', GREEN],
    ['5', '송장 등록', '송장 양식 업로드\n→ 채널 일괄 반영', 'EF4444'],
  ];
  const w = 2.25, gap = 0.18, startX = 0.55, y = 2.3;
  steps.forEach((st, i) => {
    const x = startX + i * (w + gap);
    card(s, x, y, w, 2.5, { fill: WHITE, line: st[3], shadow: true });
    s.addShape(pptx.ShapeType.ellipse, { x: x + w / 2 - 0.42, y: y - 0.42, w: 0.84, h: 0.84, fill: { color: st[3] } });
    s.addText(st[0], { x: x + w / 2 - 0.42, y: y - 0.42, w: 0.84, h: 0.84, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 28, bold: true, color: WHITE });
    s.addText(st[1], { x, y: y + 0.7, w, h: 0.5, align: 'center', fontFace: FONT, fontSize: 17, bold: true, color: NAVY });
    s.addText(st[2], { x: x + 0.1, y: y + 1.25, w: w - 0.2, h: 1.1, align: 'center', fontFace: FONT, fontSize: 12.5, color: GRAY, lineSpacingMultiple: 1.1 });
    if (i < steps.length - 1) s.addText('▶', { x: x + w - 0.02, y: y + 1.0, w: gap + 0.04, h: 0.5, align: 'center', valign: 'middle', fontSize: 12, color: '9CA3AF' });
  });
  s.addText('모든 단계가 Sellio 한 화면에서 — 채널/공급처를 오갈 필요 없음', { x: 0.55, y: 5.5, w: 12.2, h: 0.55, align: 'center', fontFace: FONT, fontSize: 15, bold: true, color: BLUE });
}

// ============ 6. 기능: 주문 자동 수집 ============
{
  const s = pptx.addSlide();
  header(s, 6, 'FEATURE 01', '주문 자동 수집 · 상품 매핑');
  card(s, 0.7, 1.55, 5.85, 3.9, { shadow: true });
  s.addText('주문 자동 수집', { x: 1.0, y: 1.8, w: 5.2, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: BLUE });
  bullet(s, 1.0, 2.35, 5.3, [
    '쿠팡 OPEN API · 네이버 커머스 API 연동',
    '결제완료 / 상품준비중 등 상태별 주문 조회',
    'API 키는 셀러별로 안전하게 저장',
    '엑셀 주문서 업로드 방식도 지원(백업)',
  ], { fontSize: 14 });
  card(s, 6.8, 1.55, 5.85, 3.9, { shadow: true });
  s.addText('상품 ↔ 공급처 매핑', { x: 7.1, y: 1.8, w: 5.2, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: '8B5CF6' });
  bullet(s, 7.1, 2.35, 5.3, [
    '쿠팡 상품을 공급처 옵션과 1:1 연결',
    '한 번 매핑하면 이후 주문은 자동 분류',
    '판매가 · 공급가(원가)까지 함께 관리',
    '활성/비활성 토글로 발주 대상 제어',
  ], { fontSize: 14 });
  s.addText('예시 · 천혜향·한라봉·황금향 → 하루팜  |  레드향·참외 → 늘푸른우리', { x: 0.7, y: 5.65, w: 12, h: 0.5, align: 'center', fontFace: FONT, fontSize: 13.5, bold: true, color: NAVY, fill: { color: LIGHT } });
}

// ============ 7. 기능: 통합 발주서 (핵심) ============
{
  const s = pptx.addSlide();
  header(s, 7, 'FEATURE 02', '통합 발주서 — 공급처별 엑셀 자동 분리');
  s.addText('수집된 주문을 매핑 정보에 따라 공급처별로 자동 그룹핑 → 거래처별 발주서 엑셀을 따로 생성', { x: 0.7, y: 1.4, w: 12, h: 0.5, fontFace: FONT, fontSize: 14, color: '374151' });
  // 분기 다이어그램
  card(s, 5.0, 2.15, 3.3, 0.95, { fill: NAVY, line: NAVY });
  s.addText('주문 36건 (3셀러)', { x: 5.0, y: 2.15, w: 3.3, h: 0.95, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 16, bold: true, color: WHITE });
  const sup = (x, name, cnt, color) => {
    card(s, x, 3.95, 3.6, 1.7, { fill: WHITE, line: color, shadow: true });
    s.addText(name, { x, y: 4.2, w: 3.6, h: 0.5, align: 'center', fontFace: FONT, fontSize: 18, bold: true, color });
    s.addText(`발주서_${name}.xlsx`, { x, y: 4.7, w: 3.6, h: 0.4, align: 'center', fontFace: FONT, fontSize: 13, color: GRAY });
    s.addText(`${cnt}건`, { x, y: 5.08, w: 3.6, h: 0.45, align: 'center', fontFace: FONT, fontSize: 15, bold: true, color });
    s.addShape(pptx.ShapeType.line, { x: 6.65, y: 3.1, w: (x + 1.8) - 6.65, h: 0.85, line: { color, width: 2 } });
  };
  sup(2.0, '하루팜', 20, ORANGE);
  sup(7.7, '늘푸른우리', 16, GREEN);
  s.addText('발주서 양식 12개 컬럼(주문자·수령인·주소·상품·수량·배송메시지 등)을 그대로 출력', { x: 0.7, y: 5.85, w: 12, h: 0.4, align: 'center', fontFace: FONT, fontSize: 12.5, color: GRAY, italic: true });
}

// ============ 8. 기능: 송장 일괄 등록 ============
{
  const s = pptx.addSlide();
  header(s, 8, 'FEATURE 03', '송장 일괄 등록');
  const flow = [
    ['양식 다운로드', '주문 기반 송장입력\n엑셀 양식 자동 생성', BLUE],
    ['송장 입력', '공급처가 보낸\n운송장 번호 입력', '8B5CF6'],
    ['엑셀 업로드', '작성한 양식을\n그대로 업로드', ORANGE],
    ['일괄 등록', '주문과 자동 매칭 →\n채널에 송장 반영', GREEN],
  ];
  const w = 2.7, gap = 0.35, startX = 0.95, y = 2.5;
  flow.forEach((f, i) => {
    const x = startX + i * (w + gap);
    card(s, x, y, w, 2.0, { fill: WHITE, line: f[2], shadow: true });
    s.addText(String(i + 1), { x: x + 0.2, y: y + 0.2, w: 0.6, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: f[2] });
    s.addText(f[0], { x: x + 0.15, y: y + 0.78, w: w - 0.3, h: 0.45, align: 'center', fontFace: FONT, fontSize: 15.5, bold: true, color: NAVY });
    s.addText(f[1], { x: x + 0.15, y: y + 1.2, w: w - 0.3, h: 0.7, align: 'center', fontFace: FONT, fontSize: 12, color: GRAY, lineSpacingMultiple: 1.1 });
    if (i < flow.length - 1) s.addText('▶', { x: x + w, y: y + 0.75, w: gap, h: 0.5, align: 'center', valign: 'middle', fontSize: 13, color: '9CA3AF' });
  });
  s.addText('주문번호 · 수령인 · 상품명 · 연락처 · 택배사 · 송장번호 컬럼으로 구성 — 다운로드한 양식을 그대로 재업로드 가능', { x: 0.7, y: 5.2, w: 12, h: 0.6, align: 'center', fontFace: FONT, fontSize: 13.5, bold: true, color: BLUE, fill: { color: LIGHT } });
}

// ============ 9. 기능: 셀러 · 예치금 관리 ============
{
  const s = pptx.addSlide();
  header(s, 9, 'FEATURE 04', '셀러 · 예치금 관리');
  card(s, 0.7, 1.55, 5.85, 3.9, { shadow: true });
  s.addText('셀러 관리', { x: 1.0, y: 1.8, w: 5, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: BLUE });
  bullet(s, 1.0, 2.35, 5.3, [
    '셀러 회원가입 · 로그인 · 권한(셀러/관리자)',
    '관리자 화면에서 전체 셀러 현황 조회',
    'API 연동 여부 · 회사정보 일괄 확인',
    '멀티 셀러 동시 운영 (데모 3명)',
  ], { fontSize: 14 });
  card(s, 6.8, 1.55, 5.85, 3.9, { shadow: true });
  s.addText('예치금 관리', { x: 7.1, y: 1.8, w: 5, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: GREEN });
  bullet(s, 7.1, 2.35, 5.3, [
    '셀러별 예치금 충전 · 차감 · 잔액 조회',
    '모든 거래 내역(트랜잭션) 기록',
    '관리자 화면에서 전 셀러 잔액 한눈에',
    '데모: 50만 / 120만 / 8만원 셀러별 차등',
  ], { fontSize: 14 });
}

// ============ 10. 기존 솔루션과 비교 ============
{
  const s = pptx.addSlide();
  header(s, 10, 'COMPARISON', '기존 솔루션과의 비교');
  const head = (t) => ({ text: t, options: { fill: { color: NAVY }, color: WHITE, bold: true, fontSize: 13, align: 'center', valign: 'middle', fontFace: FONT } });
  const headHi = (t) => ({ text: t, options: { fill: { color: BLUE }, color: WHITE, bold: true, fontSize: 13.5, align: 'center', valign: 'middle', fontFace: FONT } });
  const cell = (t) => ({ text: t, options: { color: '374151', fontSize: 11.5, align: 'center', valign: 'middle', fontFace: FONT, fill: { color: WHITE } } });
  const cellHi = (t) => ({ text: t, options: { color: NAVY, fontSize: 11.5, bold: true, align: 'center', valign: 'middle', fontFace: FONT, fill: { color: 'EAF2FE' } } });
  const label = (t) => ({ text: t, options: { color: NAVY, fontSize: 12, bold: true, align: 'left', valign: 'middle', fontFace: FONT, fill: { color: LIGHT } } });
  const rows = [
    [head('비교 항목'), head('수작업 (엑셀)'), head('기존 통합관리 솔루션\n(사방넷·이지어드민·플레이오토 등)'), headHi('Sellio')],
    [label('주문 수집'), cell('채널별 수동 다운로드'), cell('다채널 자동 수집'), cellHi('쿠팡·네이버 자동 수집')],
    [label('공급처별 발주서'), cell('직접 분류 · 작성'), cell('부분 지원 / 설정 복잡'), cellHi('공급처별 엑셀 자동 분리 ✓')],
    [label('송장 등록'), cell('주문별 수동 입력'), cell('일괄 등록 지원'), cellHi('양식 다운로드→업로드 일괄 ✓')],
    [label('도입 난이도'), cell('낮음 (비효율)'), cell('높음 (전문 설정 필요)'), cellHi('쉽고 가벼움 ✓')],
    [label('비용'), cell('인건비 · 시간'), cell('월 구독료'), cellHi('경량 자체 구축 ✓')],
    [label('멀티 셀러 운영'), cell('사실상 불가'), cell('가능'), cellHi('가능 ✓')],
  ];
  s.addTable(rows, {
    x: 0.55, y: 1.45, w: 12.25, colW: [2.0, 2.95, 4.1, 3.2], rowH: [0.62, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    border: { type: 'solid', color: 'E5E7EB', pt: 1 }, align: 'center', valign: 'middle',
  });
  s.addText('핵심 차별점 — 공급처별 발주서 자동 분리 + 무거운 설정 없이 바로 쓰는 경량 자동화', { x: 0.55, y: 5.75, w: 12.25, h: 0.5, align: 'center', fontFace: FONT, fontSize: 13.5, bold: true, color: BLUE, fill: { color: LIGHT } });
}

// ============ 11. 기술 스택 ============
{
  const s = pptx.addSlide();
  header(s, 11, 'TECH STACK', '기술 스택 & 구현');
  const stacks = [
    ['Backend', 'Node.js · Express\nREST API 서버', BLUE],
    ['Frontend', 'HTML · CSS\nVanilla JavaScript (SPA)', '8B5CF6'],
    ['데이터/엑셀', 'JSON 파일 저장\nSheetJS(XLSX) 엑셀 생성', ORANGE],
    ['외부 연동', '쿠팡 HMAC 서명\n네이버 OAuth2 · 솔라피', GREEN],
    ['배포', 'GitHub → Render\n자동 배포(CI)', 'EF4444'],
    ['데모 모드', '실 API 없이 가짜 데이터로\n전 기능 시연 가능', NAVY],
  ];
  stacks.forEach((t, i) => {
    const x = 0.6 + (i % 3) * 4.15;
    const y = 1.55 + Math.floor(i / 3) * 1.95;
    card(s, x, y, 3.9, 1.7, { fill: WHITE, line: t[2], shadow: true });
    s.addText(t[0], { x: x + 0.25, y: y + 0.22, w: 3.4, h: 0.45, fontFace: FONT, fontSize: 16, bold: true, color: t[2] });
    s.addText(t[1], { x: x + 0.25, y: y + 0.72, w: 3.4, h: 0.85, fontFace: FONT, fontSize: 13, color: GRAY, lineSpacingMultiple: 1.15 });
  });
}

// ============ 12. 데모 시나리오 ============
{
  const s = pptx.addSlide();
  header(s, 12, 'DEMO', '데모 시연 시나리오');
  const steps = [
    '관리자(1234/1234) 로그인 → 셀러 3명 · 공급처 2곳 확인',
    '통합 발주서 → "주문 불러오기" → 36건 자동 수집',
    '공급처별 그룹(하루팜 20건 / 늘푸른우리 16건) 확인 → 각 엑셀 다운로드',
    '송장 일괄 등록 → "송장입력 양식 다운로드"',
    '양식 그대로 업로드 → 송장 일괄 등록 성공 확인',
    '예치금 관리 → 셀러별 잔액 차이 확인',
  ];
  steps.forEach((t, i) => {
    const y = 1.55 + i * 0.66;
    s.addShape(pptx.ShapeType.ellipse, { x: 0.8, y, w: 0.46, h: 0.46, fill: { color: BLUE } });
    s.addText(String(i + 1), { x: 0.8, y, w: 0.46, h: 0.46, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 16, bold: true, color: WHITE });
    s.addText(t, { x: 1.45, y: y - 0.05, w: 11, h: 0.55, valign: 'middle', fontFace: FONT, fontSize: 15, color: '374151' });
  });
  s.addText('테스트 계정 — 셀러/관리자 공용  ID 1234 / PW 1234   (seller2, seller3 도 PW 1234)', { x: 0.7, y: 5.75, w: 12, h: 0.5, align: 'center', fontFace: FONT, fontSize: 13, bold: true, color: NAVY, fill: { color: LIGHT } });
}

// ============ 13. 기대효과 & 마무리 ============
{
  const s = pptx.addSlide();
  header(s, 13, 'IMPACT', '기대 효과 & 향후 계획');
  card(s, 0.7, 1.55, 5.85, 3.9, { shadow: true, line: GREEN });
  s.addText('기대 효과', { x: 1.0, y: 1.8, w: 5, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: GREEN });
  bullet(s, 1.0, 2.35, 5.3, [
    '채널·공급처를 오가는 수작업 제거',
    '주문 → 발주 → 송장 처리 시간 대폭 단축',
    '공급처별 자동 분류로 발주 실수 감소',
    '멀티 셀러를 한 시스템에서 운영',
  ], { fontSize: 14 });
  card(s, 6.8, 1.55, 5.85, 3.9, { shadow: true, line: BLUE });
  s.addText('향후 계획', { x: 7.1, y: 1.8, w: 5, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: BLUE });
  bullet(s, 7.1, 2.35, 5.3, [
    '실 채널 API 정식 연동 및 검증',
    '발주/송장 자동 스케줄링(배치)',
    '공급처 포털(발주 확인·송장 회신) 고도화',
    '정산·통계 대시보드 추가',
  ], { fontSize: 14 });
}

// ============ 13. 감사합니다 ============
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addShape(pptx.ShapeType.roundRect, { x: 5.85, y: 2.2, w: 0.75, h: 0.75, rectRadius: 0.16, fill: { color: BLUE } });
  s.addText('S', { x: 5.85, y: 2.2, w: 0.75, h: 0.75, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 34, bold: true, color: WHITE });
  s.addText('Sellio', { x: 6.65, y: 2.25, w: 2, h: 0.7, valign: 'middle', fontFace: FONT, fontSize: 36, bold: true, color: WHITE });
  s.addText('감사합니다', { x: 1, y: 3.3, w: 11.33, h: 0.8, align: 'center', fontFace: FONT, fontSize: 34, bold: true, color: WHITE });
  s.addText('쿠팡 · 네이버 셀러 발주 자동화 플랫폼  ·  졸업프로젝트', { x: 1, y: 4.2, w: 11.33, h: 0.5, align: 'center', fontFace: FONT, fontSize: 14, color: 'A5B4CB' });
  s.addShape(pptx.ShapeType.rect, { x: 5.4, y: 4.0, w: 2.53, h: 0.05, fill: { color: BLUE } });
}

const out = 'C:/Users/qkrwh/OneDrive/Desktop/Sellio_발표자료.pptx';
pptx.writeFile({ fileName: out }).then(f => console.log('생성 완료: ' + f));
