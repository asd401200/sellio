// ============================================================
//  demo.js  —  Sellio MVP 데모(가라) 모드
//  실제 쿠팡/네이버/솔라피/구글시트 API 자격증명 없이도
//  전체 플로우를 테스트할 수 있도록 모든 외부 호출을 가짜로 대체한다.
//  켜기:  DEMO_MODE=true (기본값 ON)   끄기:  DEMO_MODE=false
// ============================================================

const DEMO = process.env.DEMO_MODE !== 'false'; // 기본 ON

// ---------- 가짜 테스트 셀러 (3명: 각자 API키/예치금/주문) ----------
const DEMO_SELLERS = [
  { loginId: '1234', password: '1234', company: '테스트셀러', ceo: '홍길동', mobile: '010-1234-5678', email: 'seller1@test.com', vendorId: 'A00012345', deposit: 500000 },
  { loginId: 'seller2', password: '1234', company: '제주팜스토어', ceo: '김제주', mobile: '010-2222-3333', email: 'seller2@test.com', vendorId: 'A00067890', deposit: 1200000 },
  { loginId: 'seller3', password: '1234', company: '과일나라', ceo: '박과일', mobile: '010-4444-5555', email: 'seller3@test.com', vendorId: 'A00055555', deposit: 80000 },
];

// ---------- 가짜 공급처 (2곳: 발주서 분리 시연용) ----------
const DEMO_SUPPLIERS = [
  { name: '하루팜', sheetUrl: 'demo://sheet/하루팜', contact: '하루팜 김대표', phone: '064-123-4567', email: 'harumart88@naver.com', note: '제주 감귤류 전문' },
  { name: '늘푸른우리', sheetUrl: 'demo://sheet/늘푸른우리', contact: '늘푸른우리 박실장', phone: '054-987-6543', email: 'green@nulpr.co.kr', note: '경북 과일/참외 전문' },
];

// ---------- 가짜 상품 (쿠팡 seller-products 원본 형태) ----------
// 졸업프로젝트 샘플 주문서(제주 천혜향 등) 기반 / 상품마다 공급처 배정
const DEMO_PRODUCTS = [
  { sellerProductId: 9438958643, sellerProductName: '[오늘특가] 당도선별 고당도 제주도 천혜향', sellerProductItemId: 95029174062, itemName: '1박스 5kg', vendorItemId: 81000001, salePrice: 24900, cost: 17000, supplierOption: '천혜향 5kg', supplier: '하루팜' },
  { sellerProductId: 9438958644, sellerProductName: '[산지직송] 제주 한라봉 선물세트', sellerProductItemId: 95029174063, itemName: '1박스 5kg', vendorItemId: 81000002, salePrice: 27900, cost: 19000, supplierOption: '한라봉 5kg', supplier: '하루팜' },
  { sellerProductId: 9438958645, sellerProductName: '제주 황금향 가정용', sellerProductItemId: 95029174064, itemName: '1박스 3kg', vendorItemId: 81000003, salePrice: 19900, cost: 13000, supplierOption: '황금향 3kg', supplier: '하루팜' },
  { sellerProductId: 9438958646, sellerProductName: '[프리미엄] 제주 레드향 5kg', sellerProductItemId: 95029174065, itemName: '1박스 5kg', vendorItemId: 81000004, salePrice: 32900, cost: 23000, supplierOption: '레드향 5kg', supplier: '늘푸른우리' },
  { sellerProductId: 9438958647, sellerProductName: '성주 꿀참외 산지직송', sellerProductItemId: 95029174066, itemName: '1박스 5kg', vendorItemId: 81000005, salePrice: 29900, cost: 21000, supplierOption: '참외 5kg', supplier: '늘푸른우리' },
];

// ---------- 가짜 주문 풀 (쿠팡 주문서 샘플 기반) ----------
const DEMO_BUYERS = [
  { name: '이안기', phone: '0504-2780-9841', addr1: '경상남도 창원시 진해구 진해대로 727', addr2: '113동 904호 (석동, 진해 석동 푸르지오)', zip: '51582', msg: '문 앞' },
  { name: '강희경', phone: '0502-1823-0608', addr1: '서울특별시 광진구 능동 244-13', addr2: '희래하이츠 201호', zip: '04987', msg: '부재시 경비실' },
  { name: '김민정', phone: '0502-5393-2238', addr1: '경상남도 창원시 성산구 창이대로881번길 19', addr2: '황토방아파트 103동 1602호', zip: '51466', msg: '문 앞에 놓아주세요' },
  { name: '박서준', phone: '0507-1234-5678', addr1: '경기도 성남시 분당구 판교역로 235', addr2: 'H스퀘어 N동 7층', zip: '13494', msg: '배송 전 연락주세요' },
  { name: '최유나', phone: '0504-9988-1122', addr1: '부산광역시 해운대구 센텀중앙로 79', addr2: '센텀사이언스파크 1203호', zip: '48058', msg: '경비실에 맡겨주세요' },
  { name: '정도현', phone: '0507-4567-8910', addr1: '대전광역시 유성구 대학로 99', addr2: '101동 502호', zip: '34134', msg: '문 앞' },
  { name: '한지민', phone: '0502-3344-5566', addr1: '인천광역시 연수구 송도과학로 32', addr2: '송도더샵 305동 1801호', zip: '21984', msg: '안전하게 부탁드려요' },
  { name: '오세훈', phone: '0504-7788-9900', addr1: '광주광역시 서구 상무중앙로 110', addr2: '202호', zip: '61956', msg: '문 앞' },
  { name: '윤하늘', phone: '0507-2233-4455', addr1: '강원특별자치도 춘천시 중앙로 1', addr2: '한빛타워 904호', zip: '24239', msg: '택배함' },
  { name: '서지우', phone: '0502-6677-8899', addr1: '제주특별자치도 제주시 첨단로 242', addr2: 'A동 301호', zip: '63309', msg: '문 앞에 놓아주세요' },
  { name: '임채원', phone: '0504-1010-2020', addr1: '경기도 수원시 영통구 광교중앙로 145', addr2: '광교아이파크 1505호', zip: '16514', msg: '부재시 문 앞' },
  { name: '신예은', phone: '0507-3030-4040', addr1: '서울특별시 마포구 양화로 45', addr2: '메세나폴리스 B동 1102호', zip: '04039', msg: '경비실' },
];

// 발송처(셀러 출고지) 기본값
const SENDER_ADDR = '경기도 이천시 마장면 서이천로 449-19 하루팜물류센터';

// 송장 등록된 주문(orderId) → 배송중 처리용 집합 (server.js가 주입)
let _invoiced = new Set();
function setInvoiced(arr) { _invoiced = new Set((arr || []).map(String)); }

// vendorId → 결정적 시드 (셀러마다 다른 주문이 생성되도록)
function vendorSeed(vid) {
  if (!vid) return 0;
  const s = String(vid); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return h;
}

// 쿠팡 주문 1건(원본 ordersheet 형태)을 만든다 — 인덱스+셀러시드로 결정적 생성
function makeOrder(i, status, seed = 0) {
  const buyer = DEMO_BUYERS[(i + seed) % DEMO_BUYERS.length];
  const prod = DEMO_PRODUCTS[(i + seed) % DEMO_PRODUCTS.length];
  const qty = (i % 3) + 1;
  const n = seed * 1000 + i;
  const baseId = 20100178000000 + n * 137;
  const boxId = 666140539000000 + n * 911;
  const orderedAt = new Date(Date.now() - (i % 6) * 864e5 - 3600 * 1000 * (i % 12))
    .toISOString().replace('T', ' ').slice(0, 19);
  return {
    orderId: baseId,
    shipmentBoxId: boxId,
    orderedAt,
    status,
    shippingCount: qty,
    orderPrice: prod.salePrice * qty,
    sellerProductId: prod.sellerProductId,
    sellerProductName: prod.sellerProductName,
    sellerProductItemName: prod.itemName,
    vendorItemId: prod.vendorItemId,
    parcelPrintMessage: buyer.msg,
    orderer: { name: buyer.name, safeNumber: buyer.phone, ordererPhoneNumber: buyer.phone, addr: SENDER_ADDR },
    receiver: {
      name: buyer.name, safeNumber: buyer.phone, receiverPhoneNumber1: buyer.phone,
      addr1: buyer.addr1, addr2: buyer.addr2, postCode: buyer.zip,
    },
  };
}

// 상태별 가짜 주문 목록 (셀러시드별로 다른 주문)
function ordersByStatus(status, seed = 0) {
  // 신규주문(ACCEPT) / 상품준비중(INSTRUCT) 위주로 분포
  const pool = [];
  const total = 12;
  for (let i = 0; i < total; i++) {
    // 짝수는 ACCEPT(결제완료), 홀수는 INSTRUCT(상품준비중)
    const st = i % 2 === 0 ? 'ACCEPT' : 'INSTRUCT';
    const o = makeOrder(i, st, seed);
    // 송장 등록된 주문은 배송중으로 전환
    if (_invoiced.has(String(o.orderId))) o.status = 'DELIVERING';
    pool.push(o);
  }
  if (!status || status === 'ALL') return pool;
  return pool.filter(o => o.status === status);
}

// urlPath 에서 vendorId 추출 (셀러 구분용)
function extractVendorId(urlPath) {
  const m = String(urlPath).match(/vendors\/([A-Za-z0-9]+)\//) || String(urlPath).match(/[?&]vendorId=([A-Za-z0-9]+)/);
  return m ? m[1] : '';
}

// ---------- 쿠팡 API 가짜 응답 (axios 응답 형태로 반환) ----------
function mockCoupang(method, urlPath) {
  const m = method.toUpperCase();
  const seed = vendorSeed(extractVendorId(urlPath));
  // 1) 상품 목록
  if (urlPath.includes('/marketplace/seller-products')) {
    const data = DEMO_PRODUCTS.map(p => ({
      sellerProductId: p.sellerProductId,
      sellerProductName: p.sellerProductName,
      sellerProductItemId: p.sellerProductItemId,
      itemName: p.itemName,
      vendorItemId: p.vendorItemId,
      salePrice: p.salePrice,
      statusName: 'APPROVED',
    }));
    return { data: { code: 200, data, nextToken: '' } };
  }
  // 2) 주문 조회
  if (urlPath.includes('/ordersheets') && m === 'GET') {
    const sm = urlPath.match(/[?&]status=([A-Z_]+)/);
    const status = sm ? sm[1] : 'ALL';
    return { data: { code: 200, data: ordersByStatus(status, seed) } };
  }
  // 3) 주문 승인(acknowledgement) / 송장등록(invoice) — PUT 성공
  if (m === 'PUT') {
    return { data: { code: 200, message: 'OK (DEMO)' } };
  }
  // 기본
  return { data: { code: 200, data: [] } };
}

// ---------- 구글시트 → 공급처 상품 가짜 ----------
// sheetUrl 에 공급처명이 포함되면 그 공급처 상품만, 아니면 전체
function mockSheetProducts(sheetUrl) {
  let list = DEMO_PRODUCTS;
  if (sheetUrl) {
    const matched = DEMO_SUPPLIERS.find(s => String(sheetUrl).includes(s.name));
    if (matched) list = DEMO_PRODUCTS.filter(p => p.supplier === matched.name);
  }
  // parseSheetProducts 출력 형태: { name, option, price, origin }
  return list.map(p => ({
    name: p.sellerProductName.replace(/\[.*?\]\s*/g, '').trim(),
    option: p.supplierOption,
    price: p.cost,
    origin: '대한민국 제주/성주',
  }));
}

module.exports = {
  DEMO,
  DEMO_PRODUCTS,
  DEMO_SUPPLIERS,
  DEMO_SELLERS,
  mockCoupang,
  mockSheetProducts,
  ordersByStatus,
  setInvoiced,
};
