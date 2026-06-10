require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// ===== 초기화 =====
['uploads', 'data'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
const F = {
  users: 'data/users.json', config: 'data/config.json',
  suppliers: 'data/suppliers.json', mappings: 'data/mappings.json',
  purchaseOrders: 'data/purchase_orders.json',
  supplierRequests: 'data/supplier_requests.json',
  wsProducts: 'data/ws_products.json',
  wsOrders: 'data/ws_orders.json',
  deposits: 'data/deposits.json',
  orderTracking: 'data/order_tracking.json',
  normalizedOrders: 'data/normalized_orders.json',
  demoInvoiced: 'data/demo_invoiced.json',
};
Object.values(F).forEach(f => {
  if (!fs.existsSync(f)) fs.writeFileSync(f, f.includes('review') || f.includes('supplier') || f.includes('mapping') || f.includes('purchase') || f.includes('normalized') || f.includes('invoiced') ? '[]' : '{}', 'utf8');
});

const rj = (file, fb) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; } };
const wj = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
const hash = pw => crypto.createHash('sha256').update(pw + 'sellio_2026').digest('hex');

// ===== DEMO(가라) 모드: 실제 API 자격증명 없이 전체 플로우 테스트 =====
const { DEMO, mockCoupang, mockSheetProducts, DEMO_PRODUCTS, DEMO_SUPPLIERS, DEMO_SELLERS, setInvoiced } = require('./demo');
if (DEMO) console.log('\n  ⚡ DEMO 모드 ON — 쿠팡/네이버/솔라피/구글시트가 모두 가짜 데이터로 동작합니다. (끄려면 DEMO_MODE=false)\n');

// 데모: 송장 등록된 주문(orderId)을 기억 → 다음 조회 시 배송중으로 표시
function loadInvoiced() { let a = rj(F.demoInvoiced, []); if (!Array.isArray(a)) a = []; return a; }
function markInvoiced(ids) {
  if (!DEMO || !ids || !ids.length) return;
  const set = new Set(loadInvoiced().map(String));
  ids.forEach(id => set.add(String(id)));
  const arr = [...set];
  wj(F.demoInvoiced, arr);
  setInvoiced(arr);
}
if (DEMO) setInvoiced(loadInvoiced()); // 서버 시작 시 복원

// ===== Multer =====
const imgUpload = multer({
  storage: multer.diskStorage({ destination: (r, f, cb) => cb(null, 'uploads/'), filename: (r, f, cb) => cb(null, `img_${Date.now()}${path.extname(f.originalname)}`) }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (r, f, cb) => /jpeg|jpg|png|gif|webp/.test(path.extname(f.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('이미지만'))
});
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ===== Coupang HMAC =====
const CPN = 'api-gateway.coupang.com';
function hmac(method, urlPath, sk, ak) {
  const dt = new Date().toISOString().substr(2, 17).replace(/[-:]/g, '') + 'Z';
  const qi = urlPath.indexOf('?'), pp = qi >= 0 ? urlPath.substring(0, qi) : urlPath, qp = qi >= 0 ? urlPath.substring(qi + 1) : '';
  const sig = crypto.createHmac('sha256', sk).update(dt + method.toUpperCase() + pp + qp).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${ak}, signed-date=${dt}, signature=${sig}`;
}
const cpnH = (m, u, sk, ak, vid) => ({ Authorization: hmac(m, u, sk, ak), 'Content-Type': 'application/json', 'X-Requested-By': String(vid) });
const cpnGet = (u, sk, ak, vid) => DEMO ? Promise.resolve(mockCoupang('GET', u)) : axios.get(`https://${CPN}${u}`, { headers: cpnH('GET', u, sk, ak, vid), timeout: 15000 });
const cpnPut = (u, body, sk, ak, vid) => DEMO ? Promise.resolve(mockCoupang('PUT', u)) : axios.put(`https://${CPN}${u}`, body, { headers: cpnH('PUT', u, sk, ak, vid), timeout: 15000 });

// ========== 회원가입 ==========
app.post('/api/auth/register', (req, res) => {
  const { loginId, password, password2, role, company, ceo, mobile, email } = req.body;
  if (!loginId) return res.status(400).json({ success: false, message: '아이디 입력' });
  if (!password) return res.status(400).json({ success: false, message: '비밀번호 입력' });
  if (password !== password2) return res.status(400).json({ success: false, message: '비밀번호 불일치' });
  if (!company) return res.status(400).json({ success: false, message: '회사명/이름 입력' });
  if (!mobile) return res.status(400).json({ success: false, message: '휴대폰 입력' });
  if (!email) return res.status(400).json({ success: false, message: '이메일 입력' });

  const users = rj(F.users, {});
  if (Object.values(users).some(u => u.loginId === loginId)) return res.status(400).json({ success: false, message: '이미 사용중인 아이디' });

  const uid = 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  users[uid] = {
    loginId, passwordHash: hash(password), role: role === 'admin' ? 'admin' : 'seller',
    company, ceo: ceo || '', mobile, email,
    createdAt: new Date().toISOString(),
  };
  wj(F.users, users);
  console.log(`[가입] ${loginId} (${role || 'seller'}) - ${company}`);
  res.json({ success: true });
});

// ========== 로그인 ==========
app.post('/api/auth/login', (req, res) => {
  const { loginId, password, role } = req.body;
  if (!loginId || !password) return res.status(400).json({ success: false, message: '입력 필요' });
  const users = rj(F.users, {});
  const h = hash(password);
  // role이 지정되면 role까지 매칭, 없으면 첫 매칭
  const entry = role
    ? Object.entries(users).find(([_, u]) => u.loginId === loginId && u.passwordHash === h && u.role === role)
    : Object.entries(users).find(([_, u]) => u.loginId === loginId && u.passwordHash === h);
  if (!entry) return res.status(401).json({ success: false, message: '아이디 또는 비밀번호 오류' });
  const [uid, data] = entry;
  data.lastLogin = new Date().toISOString();
  wj(F.users, users);
  res.json({ success: true, user: { uid, loginId: data.loginId, role: data.role, company: data.company, ceo: data.ceo, mobile: data.mobile, email: data.email } });
});

// ========== 기본 계정 시드 ==========
(function seedAccounts() {
  const users = rj(F.users, {});
  const hasAdmin = Object.values(users).some(u => u.loginId === '1234' && u.role === 'admin');
  const hasSeller = Object.values(users).some(u => u.loginId === '1234' && u.role === 'seller');
  if (!hasAdmin) {
    users['u_admin_seed'] = { loginId: '1234', passwordHash: hash('1234'), role: 'admin', company: 'Sellio 관리자', ceo: '관리자', mobile: '010-0000-0000', email: 'admin@sellio.kr', createdAt: new Date().toISOString() };
    console.log('[시드] 관리자 계정 생성: 1234 / 1234');
  }
  if (!hasSeller) {
    users['u_seller_seed'] = { loginId: '1234', passwordHash: hash('1234'), role: 'seller', company: '테스트셀러', ceo: '홍길동', mobile: '010-1234-5678', email: 'seller@test.com', createdAt: new Date().toISOString() };
    console.log('[시드] 셀러 계정 생성: 1234 / 1234');
  }
  if (!hasAdmin || !hasSeller) wj(F.users, users);
})();

// ========== 공급처 스프레드시트 → 상품 파싱 공용 함수 ==========
function parseCSV(csvText) {
  const rows = [];
  let current = '', inQuote = false, row = [];
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') { if (inQuote && csvText[i+1] === '"') { current += '"'; i++; } else inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { row.push(current.trim()); current = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuote) { if (current || row.length) { row.push(current.trim()); rows.push(row); row = []; current = ''; } if (ch === '\r' && csvText[i+1] === '\n') i++; }
    else current += ch;
  }
  if (current || row.length) { row.push(current.trim()); rows.push(row); }
  return rows;
}

function parseSheetProducts(rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.replace(/\n/g,' ').trim());
  const nameIdx = header.findIndex(h => h.includes('품목') || h.includes('상품'));
  const optIdx = header.findIndex(h => h.includes('옵션'));
  const priceIdx = header.findIndex(h => h.includes('공급가') || h.includes('가격'));
  const originIdx = header.findIndex(h => h.includes('원산지'));
  const products = [];
  let lastProductName = '', lastOrigin = '';
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    let rawName = nameIdx >= 0 ? (r[nameIdx]||'').replace(/\[.*?\]/g,'').replace(/\n/g,' ').trim() : '';
    const option = optIdx >= 0 ? (r[optIdx]||'').trim() : '';
    const price = priceIdx >= 0 ? (r[priceIdx]||'').replace(/[₩,원\s]/g,'') : '';
    const origin = originIdx >= 0 ? (r[originIdx]||'').trim() : '';
    if (rawName) lastProductName = rawName;
    if (origin) lastOrigin = origin;
    if (option && lastProductName) products.push({ name: lastProductName, option, price: parseInt(price)||0, origin: lastOrigin });
  }
  return products;
}

async function fetchSheetProducts(sheetUrl) {
  if (DEMO) return mockSheetProducts(sheetUrl); // 데모: 구글시트 대신 공급처별 가짜 상품
  const idMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const gidMatch = sheetUrl.match(/gid=(\d+)/);
  if (!idMatch) return [];
  const sheetId = idMatch[1];
  const gid = gidMatch ? gidMatch[1] : '0';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const resp = await axios.get(csvUrl, { timeout: 15000, responseType: 'text' });
  return parseSheetProducts(parseCSV(resp.data));
}

// ========== 모든 공급처 스프레드시트 일괄 업데이트 ==========
async function refreshAllSuppliers() {
  let suppliers = rj(F.suppliers, []); if (!Array.isArray(suppliers)) suppliers = [];
  let updated = 0;
  for (const sup of suppliers) {
    if (!sup.sheetUrl) continue;
    try {
      const products = await fetchSheetProducts(sup.sheetUrl);
      sup.products = products;
      sup.updatedAt = new Date().toISOString();
      updated++;
      console.log(`[공급처 업데이트] ${sup.name}: ${products.length}개 상품`);
    } catch (e) { console.log(`[공급처 업데이트 실패] ${sup.name}: ${e.message}`); }
  }
  if (updated > 0) wj(F.suppliers, suppliers);
  return updated;
}

// ========== 공급처 시드 + 서버 시작 시 전체 공급처 업데이트 ==========
(async function initSuppliers() {
  let suppliers = rj(F.suppliers, []); if (!Array.isArray(suppliers)) suppliers = [];
  let changed = false;
  if (DEMO) {
    // 데모: 두 공급처(하루팜, 늘푸른우리) 시드 → 발주서 공급처별 분리 시연
    DEMO_SUPPLIERS.forEach((ds, i) => {
      let s = suppliers.find(x => x.name === ds.name);
      if (!s) {
        suppliers.push({ id: Date.now() + i, name: ds.name, sheetUrl: ds.sheetUrl, products: [], contact: ds.contact, phone: ds.phone, email: ds.email, note: ds.note, createdAt: new Date().toISOString() });
        changed = true;
      } else if (s.sheetUrl !== ds.sheetUrl) { s.sheetUrl = ds.sheetUrl; changed = true; }
    });
  } else if (!suppliers.find(s => s.name === '하루팜')) {
    suppliers.push({ id: Date.now(), name: '하루팜', sheetUrl: 'https://docs.google.com/spreadsheets/d/18tbzUoRTNLa6KkJXUIcNnX2HVhpDxNNSnhdXpsodw1M/edit#gid=0', products: [], contact: 'harumart88@naver.com', phone: '', email: 'harumart88@naver.com', note: '제주 과일 전문', createdAt: new Date().toISOString() });
    changed = true;
  }
  if (changed) wj(F.suppliers, suppliers);
  // 서버 시작 시 모든 공급처 업데이트
  await refreshAllSuppliers();
})();

// 24시간마다 공급처 상품 자동 업데이트
setInterval(async () => {
  console.log(`[스케줄] 공급처 상품 업데이트 시작: ${new Date().toLocaleString('ko')}`);
  await refreshAllSuppliers();
}, 24 * 60 * 60 * 1000);

// ========== DEMO(가라) 시드: 테스트셀러 3명 + 가짜 API키 + 매핑 + 예치금 ==========
function demoSeed() {
  if (!DEMO) return;
  const users = rj(F.users, {});
  let suppliers = rj(F.suppliers, []); if (!Array.isArray(suppliers)) suppliers = [];
  let mappings = rj(F.mappings, []); if (!Array.isArray(mappings)) mappings = [];
  const dep = rj(F.deposits, { balances: {}, transactions: [] });
  if (!dep.balances) dep.balances = {};
  if (!dep.transactions) dep.transactions = [];
  let uChanged = false, mChanged = false, dChanged = false;

  DEMO_SELLERS.forEach((sd, si) => {
    // 1) 계정 확보 (없으면 생성)
    let uid = Object.keys(users).find(u => users[u].loginId === sd.loginId && users[u].role === 'seller');
    if (!uid) {
      uid = 'u_demo_seller_' + si;
      users[uid] = {
        loginId: sd.loginId, passwordHash: hash(sd.password), role: 'seller',
        company: sd.company, ceo: sd.ceo, mobile: sd.mobile, email: sd.email,
        createdAt: new Date().toISOString(),
      };
      uChanged = true;
      console.log(`[데모 시드] 셀러 계정 생성: ${sd.loginId}/${sd.password} (${sd.company})`);
    }
    // 2) 가짜 API 키 (셀러마다 다른 vendorId → 서로 다른 주문)
    if (!users[uid].vendorId) {
      users[uid].vendorId = sd.vendorId;
      users[uid].accessKey = 'demo-access-' + sd.vendorId;
      users[uid].secretKey = 'demo-secret-' + sd.vendorId;
      users[uid].naverClientId = 'demo-naver-' + sd.vendorId;
      users[uid].naverClientSecret = 'demo-naver-secret';
      uChanged = true;
    }
    // 3) 상품 ↔ 배정 공급처 매핑 (없을 때만) → 발주서 공급처별 분리
    if (suppliers.length && !mappings.some(m => m.userId === uid)) {
      DEMO_PRODUCTS.forEach((p, i) => {
        const sup = suppliers.find(s => s.name === p.supplier);
        if (!sup) return;
        mappings.push({
          id: Date.now() + si * 100 + i,
          userId: uid, productName: p.sellerProductName, productId: String(p.sellerProductId),
          optionId: String(p.sellerProductItemId), option: p.itemName, salePrice: p.salePrice,
          supplierId: String(sup.id), supplierName: sup.name, supplierOptionKey: p.supplierOption,
          costPrice: p.cost, active: true, createdAt: new Date().toISOString(),
        });
      });
      mChanged = true;
    }
    // 4) 예치금 초기 잔액 (셀러마다 다른 금액)
    if (dep.balances[uid] === undefined) {
      dep.balances[uid] = sd.deposit;
      dep.transactions.unshift({ id: Date.now() + si, userId: uid, type: 'charge', amount: sd.deposit, balance: sd.deposit, description: '데모 초기 충전', createdAt: new Date().toISOString() });
      dChanged = true;
    }
  });

  if (uChanged) wj(F.users, users);
  if (mChanged) { wj(F.mappings, mappings); console.log(`[데모 시드] 매핑 총 ${mappings.length}건 (공급처별 분리)`); }
  if (dChanged) { wj(F.deposits, dep); console.log(`[데모 시드] 셀러 ${DEMO_SELLERS.length}명 예치금 충전 완료`); }
}
// 공급처 시드(하루팜) 이후 실행되도록 약간 지연
setTimeout(demoSeed, 300);

// 데모 상태 조회
app.get('/api/demo/status', (req, res) => res.json({ success: true, demo: DEMO }));

// 데모 데이터 초기화(정규화주문/주문추적/송장상태 리셋 → 주문 전부 원상복구)
app.post('/api/demo/reset', (req, res) => {
  if (!DEMO) return res.status(400).json({ success: false, message: '데모 모드 아님' });
  ['normalizedOrders', 'orderTracking', 'wsOrders', 'demoInvoiced'].forEach(k => wj(F[k], []));
  setInvoiced([]); // 배송중 전환된 주문 원상복구
  demoSeed();
  res.json({ success: true, message: '데모 데이터 초기화 완료' });
});

// 관리자 수동 업데이트 API
app.post('/api/admin/refresh-suppliers', async (req, res) => {
  try {
    const count = await refreshAllSuppliers();
    res.json({ success: true, updated: count });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ========== 유저 API키 ==========
app.post('/api/user/save-keys', (req, res) => {
  const { userId, vendorId, accessKey, secretKey } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId 필요' });
  const u = rj(F.users, {}); if (!u[userId]) u[userId] = {};
  u[userId].vendorId = vendorId; u[userId].accessKey = accessKey; u[userId].secretKey = secretKey;
  wj(F.users, u);
  res.json({ success: true });
});

app.post('/api/user/load-keys', (req, res) => {
  const u = rj(F.users, {}); const d = u[req.body.userId];
  res.json({ success: true, keys: d?.vendorId ? { vendorId: d.vendorId, accessKey: d.accessKey, secretKey: d.secretKey } : null });
});

// 네이버 커머스 API 키 저장/로드/테스트
app.post('/api/user/save-naver-keys', (req, res) => {
  const { userId, clientId, clientSecret } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId 필요' });
  const u = rj(F.users, {}); if (!u[userId]) u[userId] = {};
  u[userId].naverClientId = clientId;
  u[userId].naverClientSecret = clientSecret;
  wj(F.users, u);
  res.json({ success: true });
});

app.post('/api/user/load-naver-keys', (req, res) => {
  const u = rj(F.users, {}); const d = u[req.body.userId];
  res.json({ success: true, keys: d?.naverClientId ? { clientId: d.naverClientId, clientSecret: d.naverClientSecret } : null });
});

// 네이버 커머스 API 연결 테스트 (OAuth2 client_credentials 방식 서명)
app.post('/api/naver/test', async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) return res.status(400).json({ success: false, message: '모든 항목 입력' });
  if (DEMO) return res.json({ success: true }); // 데모: 네이버 OAuth 항상 성공
  try {
    const bcrypt = require('bcryptjs');
    const timestamp = Date.now();
    const password = `${clientId}_${timestamp}`;
    const hashed = bcrypt.hashSync(password, clientSecret);
    const clientSecretSign = Buffer.from(hashed).toString('base64');
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('timestamp', timestamp);
    params.append('client_secret_sign', clientSecretSign);
    params.append('grant_type', 'client_credentials');
    params.append('type', 'SELF');
    const r = await axios.post('https://api.commerce.naver.com/external/v1/oauth2/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (r.data?.access_token) return res.json({ success: true });
    res.status(400).json({ success: false, message: '토큰 발급 실패' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.response?.data?.message || e.response?.data?.error_description || e.message });
  }
});

// ========== 관리자 ==========
app.get('/api/admin/users', (req, res) => {
  const u = rj(F.users, {});
  const list = Object.entries(u).map(([uid, d]) => ({
    uid, loginId: d.loginId, role: d.role || 'seller', company: d.company || '', ceo: d.ceo || '',
    mobile: d.mobile || '', email: d.email || '', vendorId: d.vendorId || '',
    hasApiKeys: !!(d.vendorId && d.accessKey), createdAt: d.createdAt || '', lastLogin: d.lastLogin || '',
  }));
  res.json({ success: true, users: list, total: list.length });
});

// ========== 쿠팡 API 프록시 ==========
app.post('/api/coupang/test', async (req, res) => {
  const { vendorId, accessKey, secretKey } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: '모든 항목 입력' });
  try {
    await cpnGet(`/v2/providers/seller_api/apis/api/v1/marketplace/seller-products?vendorId=${vendorId}&nextToken=&maxPerPage=1&status=APPROVED`, secretKey, accessKey, vendorId);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, message: e.response?.data?.message || e.message }); }
});

app.post('/api/coupang/products', async (req, res) => {
  const { vendorId, accessKey, secretKey } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: 'API 필요' });
  try {
    const all = []; let token = '', page = 0;
    do {
      const r = await cpnGet(`/v2/providers/seller_api/apis/api/v1/marketplace/seller-products?vendorId=${vendorId}&nextToken=${token}&maxPerPage=100&status=APPROVED`, secretKey, accessKey, vendorId);
      (r.data?.data || []).forEach(p => { if (p.sellerProductId) all.push({ sellerProductId: p.sellerProductId, name: p.sellerProductName || '', vendorItemId: p.vendorItemId || '', optionId: p.sellerProductItemId || '', option: p.itemName || '', salePrice: p.salePrice || 0 }); });
      token = r.data?.nextToken || ''; page++;
    } while (token && page < 5);
    res.json({ success: true, products: all, total: all.length });
  } catch (e) { res.status(400).json({ success: false, message: e.response?.data?.message || e.message }); }
});

app.post('/api/coupang/orders', async (req, res) => {
  const { vendorId, accessKey, secretKey, status = 'INSTRUCT', createdAtFrom, createdAtTo } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: 'API 필요' });
  try {
    const from = createdAtFrom || new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
    const to = createdAtTo || new Date().toISOString().split('T')[0];
    const sts = status === 'ALL' ? ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'] : [status];
    const all = [];
    for (const st of sts) {
      try {
        const r = await cpnGet(`/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?status=${st}&createdAtFrom=${from}&createdAtTo=${to}&maxPerPage=50`, secretKey, accessKey, vendorId);
        (r.data?.data || []).forEach(o => all.push({
          orderId: o.orderId, shipmentBoxId: o.shipmentBoxId,
          receiverName: o.receiver?.name || '', productName: o.sellerProductName || '',
          optionName: o.sellerProductItemName || '', quantity: o.shippingCount || 1,
          orderDate: o.orderedAt || '', status: st, paymentPrice: o.orderPrice || 0,
          receiverPhone: o.receiver?.safeNumber || o.receiver?.receiverPhoneNumber1 || '',
          receiverAddr: ((o.receiver?.addr1 || '') + ' ' + (o.receiver?.addr2 || '')).trim(),
          vendorItemId: o.vendorItemId || '',
        }));
      } catch (e) { console.error(`[주문 ${st}]`, e.response?.data?.message || e.message); }
    }
    all.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    res.json({ success: true, orders: all, total: all.length });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/coupang/approve-orders', async (req, res) => {
  const { vendorId, accessKey, secretKey, shipmentBoxIds } = req.body;
  if (!vendorId || !accessKey || !secretKey || !shipmentBoxIds?.length) return res.status(400).json({ success: false, message: '필요 데이터 없음' });
  const results = [];
  for (const boxId of shipmentBoxIds) {
    try { await cpnPut(`/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets/${boxId}/acknowledgement`, { vendorId, shipmentBoxId: parseInt(boxId) }, secretKey, accessKey, vendorId); results.push({ shipmentBoxId: boxId, success: true }); }
    catch (e) { results.push({ shipmentBoxId: boxId, success: false, message: e.response?.data?.message || e.message }); }
  }
  const ok = results.filter(r => r.success).length;
  res.json({ success: true, results, summary: { total: shipmentBoxIds.length, success: ok, fail: shipmentBoxIds.length - ok } });
});

app.post('/api/coupang/invoice-batch', async (req, res) => {
  const { vendorId, accessKey, secretKey, invoices } = req.body;
  if (!vendorId || !accessKey || !secretKey || !invoices?.length) return res.status(400).json({ success: false, message: '필요 데이터 없음' });
  const results = [];
  for (const inv of invoices) {
    if (!inv.shipmentBoxId || !inv.invoiceNumber) { results.push({ shipmentBoxId: inv.shipmentBoxId, success: false, message: '누락' }); continue; }
    try { await cpnPut(`/v2/providers/openapi/apis/api/v5/vendors/${vendorId}/ordersheets/${inv.shipmentBoxId}/invoice`, { vendorId, shipmentBoxId: parseInt(inv.shipmentBoxId), invoiceNumber: String(inv.invoiceNumber), deliveryCompanyCode: inv.deliveryCompanyCode || 'CJGLS' }, secretKey, accessKey, vendorId); results.push({ shipmentBoxId: inv.shipmentBoxId, success: true }); }
    catch (e) { results.push({ shipmentBoxId: inv.shipmentBoxId, success: false, message: e.response?.data?.message || e.message }); }
  }
  markInvoiced(results.filter(r => r.success).map(r => r.shipmentBoxId)); // 데모: 배송중 전환
  const ok = results.filter(r => r.success).length;
  res.json({ success: true, results, summary: { total: invoices.length, success: ok, fail: invoices.length - ok } });
});

// 관리자가 특정 셀러의 API로 송장 등록
app.post('/api/admin/invoice-for-seller', async (req, res) => {
  const { sellerUid, invoices, deliveryCompanyCode } = req.body;
  const users = rj(F.users, {});
  const seller = users[sellerUid];
  if (!seller?.vendorId || !seller?.accessKey || !seller?.secretKey) return res.status(400).json({ success: false, message: '셀러 API 미등록' });
  const results = [];
  for (const inv of (invoices || [])) {
    if (!inv.shipmentBoxId || !inv.invoiceNumber) { results.push({ success: false, message: '누락' }); continue; }
    try {
      await cpnPut(`/v2/providers/openapi/apis/api/v5/vendors/${seller.vendorId}/ordersheets/${inv.shipmentBoxId}/invoice`,
        { vendorId: seller.vendorId, shipmentBoxId: parseInt(inv.shipmentBoxId), invoiceNumber: String(inv.invoiceNumber), deliveryCompanyCode: deliveryCompanyCode || 'CJGLS' },
        seller.secretKey, seller.accessKey, seller.vendorId);
      results.push({ shipmentBoxId: inv.shipmentBoxId, success: true });
    } catch (e) { results.push({ shipmentBoxId: inv.shipmentBoxId, success: false, message: e.response?.data?.message || e.message }); }
  }
  markInvoiced(results.filter(r => r.success).map(r => r.shipmentBoxId)); // 데모: 배송중 전환
  const ok = results.filter(r => r.success).length;
  res.json({ success: true, results, summary: { total: invoices?.length || 0, success: ok, fail: (invoices?.length || 0) - ok } });
});

// 관리자: 특정 셀러 주문 조회
app.post('/api/admin/orders-for-seller', async (req, res) => {
  const { sellerUid, status, createdAtFrom, createdAtTo } = req.body;
  const users = rj(F.users, {});
  const seller = users[sellerUid];
  if (!seller?.vendorId || !seller?.accessKey || !seller?.secretKey)
    return res.status(400).json({ success: false, message: '셀러 API 미등록' });
  try {
    const from = createdAtFrom || new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
    const to = createdAtTo || new Date().toISOString().split('T')[0];
    const r = await cpnGet(`/v2/providers/openapi/apis/api/v4/vendors/${seller.vendorId}/ordersheets?status=${status}&createdAtFrom=${from}&createdAtTo=${to}&maxPerPage=100`, seller.secretKey, seller.accessKey, seller.vendorId);
    const all = (r.data?.data || []).map(o => ({
      orderId: o.orderId, shipmentBoxId: o.shipmentBoxId,
      receiverName: o.receiver?.name || '', productName: o.sellerProductName || '',
      optionName: o.sellerProductItemName || '', quantity: o.shippingCount || 1,
      orderDate: o.orderedAt || '', status,
      receiverPhone: o.receiver?.safeNumber || o.receiver?.receiverPhoneNumber1 || '',
      receiverAddr: ((o.receiver?.addr1 || '') + ' ' + (o.receiver?.addr2 || '')).trim(),
    }));
    all.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    res.json({ success: true, orders: all, total: all.length });
  } catch (e) { res.json({ success: false, message: e.response?.data?.message || e.message, orders: [], total: 0 }); }
});

// 관리자: 특정 셀러 주문 승인 (결제완료 → 상품준비중)
app.post('/api/admin/approve-orders-for-seller', async (req, res) => {
  const { sellerUid, shipmentBoxIds } = req.body;
  const users = rj(F.users, {});
  const seller = users[sellerUid];
  if (!seller?.vendorId || !seller?.accessKey || !seller?.secretKey)
    return res.status(400).json({ success: false, message: '셀러 API 미등록' });
  const results = [];
  for (const boxId of (shipmentBoxIds || [])) {
    try {
      await cpnPut(`/v2/providers/openapi/apis/api/v4/vendors/${seller.vendorId}/ordersheets/${boxId}/acknowledgement`,
        { vendorId: seller.vendorId, shipmentBoxId: parseInt(boxId) },
        seller.secretKey, seller.accessKey, seller.vendorId);
      results.push({ shipmentBoxId: boxId, success: true });
    } catch (e) { results.push({ shipmentBoxId: boxId, success: false, message: e.response?.data?.message || e.message }); }
  }
  const ok = results.filter(r => r.success).length;
  res.json({ success: true, results, summary: { total: shipmentBoxIds?.length || 0, success: ok, fail: (shipmentBoxIds?.length || 0) - ok } });
});

// ========== 송장입력 양식 엑셀 (정규화 주문 기반, 샘플 송장번호 포함) ==========
app.post('/api/admin/invoice-template', (req, res) => {
  let list = rj(F.normalizedOrders, []); if (!Array.isArray(list)) list = [];
  const { supplierId } = req.body || {};
  if (supplierId) list = list.filter(o => String(o.supplierId) === String(supplierId));
  const rows = list.map((o, i) => ({
    '주문번호': o.orderId || o.shipmentBoxId || '',
    '수령인': o.receiverName || '',
    '상품명': o.productName || '',
    '연락처': o.receiverPhone || '',
    '택배사': 'CJ대한통운',
    '송장번호': '6290' + String(100000000 + i), // 데모용 샘플 송장번호
  }));
  // 정규화 주문이 없으면 빈 양식 헤더만
  if (!rows.length) rows.push({ '주문번호': '', '수령인': '', '상품명': '', '연락처': '', '택배사': 'CJ대한통운', '송장번호': '' });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [18, 12, 30, 16, 12, 18].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '송장입력');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = encodeURIComponent(`송장입력양식_${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// ========== 엑셀 파싱 ==========
app.post('/api/invoice/parse-excel', excelUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '파일 없음' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const parsed = rows.map(row => {
      const keys = Object.keys(row);
      const find = (...pats) => { const k = keys.find(k => pats.some(p => k.includes(p))); return k ? String(row[k]).trim() : ''; };
      return { orderId: find('주문번호','주문','orderId'), receiverName: find('수령인','수취인','받는분','이름'), invoiceNumber: find('송장번호','운송장','송장','tracking'), productName: find('상품명','상품'), option: find('옵션'), phone: find('연락처','전화','휴대폰') };
    }).filter(r => r.invoiceNumber || r.orderId || r.receiverName);
    res.json({ success: true, data: parsed, total: parsed.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ========== 공급처 ==========
app.get('/api/suppliers', (req, res) => {
  let list = rj(F.suppliers, []); if (!Array.isArray(list)) list = [];
  res.json({ success: true, suppliers: list });
});
app.post('/api/supplier/save', (req, res) => {
  let list = rj(F.suppliers, []); if (!Array.isArray(list)) list = [];
  const { id, name, contact, phone, email, note } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '공급처명 필요' });
  if (id) { const idx = list.findIndex(s => String(s.id) === String(id)); if (idx >= 0) list[idx] = { ...list[idx], name, contact, phone, email, note, updatedAt: new Date().toISOString() }; }
  else list.push({ id: Date.now(), name, contact: contact || '', phone: phone || '', email: email || '', note: note || '', createdAt: new Date().toISOString() });
  wj(F.suppliers, list); res.json({ success: true });
});
app.post('/api/supplier/delete', (req, res) => {
  let list = rj(F.suppliers, []); list = list.filter(s => String(s.id) !== String(req.body.id)); wj(F.suppliers, list); res.json({ success: true });
});

// ========== 상품-공급처 매핑 ==========
app.get('/api/mappings', (req, res) => {
  let list = rj(F.mappings, []); if (!Array.isArray(list)) list = [];
  if (req.query.userId) list = list.filter(m => m.userId === req.query.userId);
  res.json({ success: true, mappings: list });
});
app.post('/api/mapping/save', (req, res) => {
  let list = rj(F.mappings, []); if (!Array.isArray(list)) list = [];
  const { userId, productName, productId, optionId, option, salePrice, supplierId, supplierName, supplierOptionKey, costPrice, active } = req.body;
  if (!productId) return res.status(400).json({ success: false, message: '상품 필요' });
  const idx = list.findIndex(m => m.userId === userId && m.productId === productId);
  const entry = { userId, productName, productId, optionId, option, salePrice: parseFloat(salePrice) || 0,
    supplierId: supplierId || '', supplierName: supplierName || '', supplierOptionKey: supplierOptionKey || '',
    costPrice: parseFloat(costPrice) || 0,
    active: active !== undefined ? active : true, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = { ...list[idx], ...entry }; else list.push({ id: Date.now(), ...entry, createdAt: new Date().toISOString() });
  wj(F.mappings, list); res.json({ success: true });
});
app.post('/api/mapping/toggle', (req, res) => {
  let list = rj(F.mappings, []); if (!Array.isArray(list)) list = [];
  const { userId, productId, active } = req.body;
  const idx = list.findIndex(m => m.userId === userId && m.productId === productId);
  if (idx >= 0) { list[idx].active = active; wj(F.mappings, list); }
  res.json({ success: true });
});
app.post('/api/mapping/delete', (req, res) => {
  let list = rj(F.mappings, []); list = list.filter(m => String(m.id) !== String(req.body.id)); wj(F.mappings, list); res.json({ success: true });
});

// ========== 상품 등록 요청 (공급처 요청) ==========
app.post('/api/supplier-request/save', (req, res) => {
  let list = rj(F.supplierRequests, []); if (!Array.isArray(list)) list = [];
  const { userId, seller, name, url } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '공급처명 필요' });
  if (!url) return res.status(400).json({ success: false, message: 'URL 필요' });
  list.push({ id: Date.now(), userId, seller, name, url, status: '대기중', createdAt: new Date().toISOString() });
  wj(F.supplierRequests, list); res.json({ success: true });
});
app.get('/api/supplier-request/list', (req, res) => {
  let list = rj(F.supplierRequests, []); if (!Array.isArray(list)) list = [];
  if (req.query.userId) list = list.filter(r => r.userId === req.query.userId);
  res.json({ success: true, requests: list });
});
app.get('/api/admin/supplier-requests', (req, res) => {
  let list = rj(F.supplierRequests, []); if (!Array.isArray(list)) list = [];
  res.json({ success: true, requests: list });
});
app.post('/api/admin/supplier-request/update', (req, res) => {
  let list = rj(F.supplierRequests, []); if (!Array.isArray(list)) list = [];
  const idx = list.findIndex(r => r.id === req.body.id);
  if (idx >= 0) { list[idx].status = req.body.status; wj(F.supplierRequests, list); }
  res.json({ success: true });
});

// ========== 관리자: 통합 발주서 ==========
app.get('/api/admin/all-mappings', (req, res) => {
  const list = rj(F.mappings, []); res.json({ success: true, mappings: Array.isArray(list) ? list : [] });
});

// 관리자: 발주서 생성 (모든 셀러 매핑 취합 → 공급처별 정리)
app.get('/api/admin/purchase-order', (req, res) => {
  const mappings = rj(F.mappings, []);
  const suppliers = rj(F.suppliers, []);
  // 공급처별로 그룹핑
  const bySupplier = {};
  mappings.forEach(m => {
    if (!bySupplier[m.supplierId]) {
      const sup = suppliers.find(s => String(s.id) === String(m.supplierId));
      bySupplier[m.supplierId] = { supplier: sup || { name: m.supplierName }, items: [] };
    }
    bySupplier[m.supplierId].items.push(m);
  });
  res.json({ success: true, purchaseOrder: bySupplier });
});

// ========== Google Sheets 공급처 상품 조회 ==========
app.post('/api/supplier/fetch-sheet', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'URL 필요' });
  try {
    const products = await fetchSheetProducts(url);
    res.json({ success: true, products, total: products.length });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// 관리자: 공급처 승인 + 스프레드시트 연동
app.post('/api/admin/supplier-request/approve', async (req, res) => {
  const { id } = req.body;
  let requests = rj(F.supplierRequests, []); if (!Array.isArray(requests)) requests = [];
  const idx = requests.findIndex(r => r.id === id);
  if (idx < 0) return res.status(404).json({ success: false, message: '요청 없음' });
  const request = requests[idx];
  // 스프레드시트에서 상품 가져오기
  try {
    const products = await fetchSheetProducts(request.url);
    // 공급처 등록
    let suppliers = rj(F.suppliers, []); if (!Array.isArray(suppliers)) suppliers = [];
    const existing = suppliers.find(s => s.name === request.name);
    const supplierId = existing ? existing.id : Date.now();
    if (existing) {
      existing.sheetUrl = request.url;
      existing.products = products;
      existing.updatedAt = new Date().toISOString();
    } else {
      suppliers.push({ id: supplierId, name: request.name, sheetUrl: request.url, products, contact: '', phone: '', email: '', note: '', createdAt: new Date().toISOString() });
    }
    wj(F.suppliers, suppliers);
    // 요청 상태 업데이트
    requests[idx].status = '승인';
    requests[idx].productCount = products.length;
    wj(F.supplierRequests, requests);
    res.json({ success: true, productCount: products.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ========== 솔라피 (Solapi) 카카오톡 발송 ==========
function solapiAuth(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 솔라피 설정 저장/조회
app.post('/api/admin/solapi/save-config', (req, res) => {
  const { apiKey, apiSecret, pfId, senderNumber } = req.body;
  if (!apiKey || !apiSecret) return res.status(400).json({ success: false, message: 'API Key, API Secret 필요' });
  const config = rj(F.config, {});
  config.solapi = { apiKey, apiSecret, pfId: pfId || '', senderNumber: senderNumber || '' };
  wj(F.config, config);
  console.log('[솔라피] 설정 저장 완료');
  res.json({ success: true });
});

app.get('/api/admin/solapi/config', (req, res) => {
  const config = rj(F.config, {});
  const s = config.solapi || {};
  if (DEMO) return res.json({ success: true, config: { apiKey: '****DEMO', apiSecret: '설정됨(데모)', pfId: s.pfId || 'DEMO_PF', senderNumber: s.senderNumber || '010-0000-0000', configured: true, demo: true } });
  res.json({ success: true, config: { apiKey: s.apiKey ? '****' + s.apiKey.slice(-4) : '', apiSecret: s.apiSecret ? '설정됨' : '', pfId: s.pfId || '', senderNumber: s.senderNumber || '', configured: !!(s.apiKey && s.apiSecret) } });
});

// 솔라피 메시지 발송
app.post('/api/admin/solapi/send', async (req, res) => {
  const { to, text, type } = req.body;
  if (!to || !text) return res.status(400).json({ success: false, message: '수신번호와 메시지 필요' });
  if (DEMO) { console.log(`[솔라피·데모] 발송됨(가짜): ${to} / ${String(text).slice(0, 30)}...`); return res.json({ success: true, result: { demo: true, groupId: 'DEMO-' + Date.now(), to } }); }
  const config = rj(F.config, {});
  const s = config.solapi;
  if (!s?.apiKey || !s?.apiSecret) return res.status(400).json({ success: false, message: '솔라피 API 설정을 먼저 해주세요' });
  if (!s.senderNumber) return res.status(400).json({ success: false, message: '발신번호를 설정해주세요' });

  const auth = solapiAuth(s.apiKey, s.apiSecret);
  // 수신번호 정리 (하이픈 제거)
  const cleanTo = to.replace(/-/g, '').trim();

  // 메시지 타입 결정: 카카오 친구톡(CTA) > LMS > SMS
  let msgType = type || 'LMS';
  const msgBody = {
    message: {
      to: cleanTo,
      from: s.senderNumber.replace(/-/g, ''),
      text: text,
    }
  };

  // 카카오 친구톡 사용 시
  if (msgType === 'CTA' && s.pfId) {
    msgBody.message.type = 'CTA';
    msgBody.message.kakaoOptions = { pfId: s.pfId, disableSms: false };
  } else {
    // LMS (장문) - 80바이트 초과 시 자동 LMS
    msgBody.message.type = text.length > 45 ? 'LMS' : 'SMS';
    msgBody.message.subject = '알림';
  }

  try {
    const result = await axios.post('https://api.solapi.com/messages/v4/send', msgBody, {
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    console.log(`[솔라피] 발송 성공: ${cleanTo}`);
    res.json({ success: true, result: result.data });
  } catch (e) {
    const errMsg = e.response?.data?.errorMessage || e.response?.data?.message || e.message;
    console.error(`[솔라피] 발송 실패: ${errMsg}`);
    res.status(400).json({ success: false, message: errMsg });
  }
});

// 솔라피 다건 발송 (여러 번호로 동시 발송)
app.post('/api/admin/solapi/send-bulk', async (req, res) => {
  const { recipients, text, type } = req.body;
  if (!recipients?.length || !text) return res.status(400).json({ success: false, message: '수신 목록과 메시지 필요' });
  if (DEMO) { console.log(`[솔라피·데모] ${recipients.length}건 발송됨(가짜)`); return res.json({ success: true, result: { demo: true, count: recipients.length, groupId: 'DEMO-' + Date.now() } }); }
  const config = rj(F.config, {});
  const s = config.solapi;
  if (!s?.apiKey || !s?.apiSecret || !s.senderNumber) return res.status(400).json({ success: false, message: '솔라피 설정 필요' });

  const auth = solapiAuth(s.apiKey, s.apiSecret);
  const from = s.senderNumber.replace(/-/g, '');
  const messages = recipients.map(r => {
    const msg = { to: r.replace(/-/g, '').trim(), from, text };
    if (type === 'CTA' && s.pfId) {
      msg.type = 'CTA';
      msg.kakaoOptions = { pfId: s.pfId, disableSms: false };
    } else {
      msg.type = text.length > 45 ? 'LMS' : 'SMS';
      msg.subject = '알림';
    }
    return msg;
  });

  try {
    const result = await axios.post('https://api.solapi.com/messages/v4/send-many', { messages }, {
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      timeout: 30000
    });
    console.log(`[솔라피] ${recipients.length}건 다건 발송`);
    res.json({ success: true, result: result.data });
  } catch (e) {
    const errMsg = e.response?.data?.errorMessage || e.response?.data?.message || e.message;
    console.error(`[솔라피] 다건 발송 실패: ${errMsg}`);
    res.status(400).json({ success: false, message: errMsg });
  }
});

// ========== 공급처 상품 관리 ==========
app.get('/api/ws/products', (req, res) => {
  let list = rj(F.wsProducts, []); if (!Array.isArray(list)) list = [];
  res.json({ success: true, products: list, total: list.length });
});

app.post('/api/ws/product/save', imgUpload.single('image'), (req, res) => {
  let list = rj(F.wsProducts, []); if (!Array.isArray(list)) list = [];
  const { id, name, category, tax, shipping, delivery, origin, note } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '상품명 필요' });

  let parsedOptions = [];
  try { parsedOptions = JSON.parse(req.body.options || '[]'); } catch { parsedOptions = []; }
  if (!parsedOptions.length) return res.status(400).json({ success: false, message: '옵션을 1개 이상 추가하세요' });

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.existingImage || '');

  const productData = {
    name, category: category || '기타', tax: tax || '비과세',
    options: parsedOptions, shipping: shipping || '수량별배송비',
    delivery: delivery || '', origin: origin || '', note: note || ''
  };

  if (id) {
    const idx = list.findIndex(p => String(p.id) === String(id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...productData, image: imageUrl || list[idx].image, updatedAt: new Date().toISOString() };
    }
  } else {
    list.push({ id: Date.now(), ...productData, image: imageUrl, createdAt: new Date().toISOString() });
  }
  wj(F.wsProducts, list);
  res.json({ success: true });
});

app.post('/api/ws/product/delete', (req, res) => {
  let list = rj(F.wsProducts, []);
  list = list.filter(p => String(p.id) !== String(req.body.id));
  wj(F.wsProducts, list);
  res.json({ success: true });
});

// ========== 공급처 주문 관리 ==========
app.get('/api/ws/orders', (req, res) => {
  let list = rj(F.wsOrders, []); if (!Array.isArray(list)) list = [];
  res.json({ success: true, orders: list, total: list.length });
});

app.post('/api/ws/order/save', (req, res) => {
  let list = rj(F.wsOrders, []); if (!Array.isArray(list)) list = [];
  const { name, phone, email, address, productId, productName, quantity, amount, memo } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '주문자명 필요' });
  if (!productId) return res.status(400).json({ success: false, message: '상품 선택 필요' });

  const { sellerId, sellerName } = req.body;
  const ordNo = 'WS' + Date.now().toString().slice(-10);
  list.unshift({
    id: Date.now(), orderNo: ordNo, name, phone: phone || '', email: email || '',
    address: address || '', productId, productName: productName || '', quantity: parseInt(quantity) || 1,
    amount: parseInt(amount) || 0, memo: memo || '', status: '신규',
    sellerId: sellerId || '', sellerName: sellerName || '',
    createdAt: new Date().toISOString()
  });
  wj(F.wsOrders, list);
  console.log(`[공급처 주문] ${ordNo} - ${name} - ${productName}`);
  res.json({ success: true, orderNo: ordNo });
});

app.post('/api/ws/order/update-status', (req, res) => {
  let list = rj(F.wsOrders, []); if (!Array.isArray(list)) list = [];
  const idx = list.findIndex(o => o.id === req.body.id);
  if (idx >= 0) { list[idx].status = req.body.status; wj(F.wsOrders, list); }
  res.json({ success: true });
});

app.post('/api/ws/order/delete', (req, res) => {
  let list = rj(F.wsOrders, []);
  list = list.filter(o => String(o.id) !== String(req.body.id));
  wj(F.wsOrders, list);
  res.json({ success: true });
});

// 셀러별 주문 조회
app.get('/api/ws/orders/seller/:sellerId', (req, res) => {
  let list = rj(F.wsOrders, []); if (!Array.isArray(list)) list = [];
  const filtered = list.filter(o => o.sellerId === req.params.sellerId);
  res.json({ success: true, orders: filtered, total: filtered.length });
});

// ========== 예치금 관리 ==========
app.get('/api/deposits/balance/:userId', (req, res) => {
  const data = rj(F.deposits, { balances: {}, transactions: [] });
  res.json({ success: true, balance: data.balances?.[req.params.userId] || 0 });
});

app.get('/api/deposits/transactions/:userId', (req, res) => {
  const data = rj(F.deposits, { balances: {}, transactions: [] });
  const txs = (data.transactions || []).filter(t => t.userId === req.params.userId);
  res.json({ success: true, transactions: txs });
});

app.post('/api/deposits/charge', (req, res) => {
  const { userId, amount, description } = req.body;
  if (!userId || !amount) return res.status(400).json({ success: false, message: '필수 항목 누락' });
  const data = rj(F.deposits, { balances: {}, transactions: [] });
  if (!data.balances) data.balances = {};
  if (!data.transactions) data.transactions = [];
  const prev = data.balances[userId] || 0;
  const amt = parseInt(amount);
  data.balances[userId] = prev + amt;
  data.transactions.unshift({
    id: Date.now(), userId, type: 'charge', amount: amt,
    balance: prev + amt, description: description || '예치금 충전',
    createdAt: new Date().toISOString()
  });
  wj(F.deposits, data);
  console.log(`[예치금 충전] ${userId}: +${amt.toLocaleString()}원 → ${(prev+amt).toLocaleString()}원`);
  res.json({ success: true, balance: prev + amt });
});

app.post('/api/deposits/deduct', (req, res) => {
  const { userId, amount, description, type } = req.body;
  if (!userId || !amount) return res.status(400).json({ success: false, message: '필수 항목 누락' });
  const data = rj(F.deposits, { balances: {}, transactions: [] });
  if (!data.balances) data.balances = {};
  if (!data.transactions) data.transactions = [];
  const prev = data.balances[userId] || 0;
  const amt = parseInt(amount);
  if (prev < amt) return res.json({ success: false, message: `잔액 부족 (현재: ${prev.toLocaleString()}원)` });
  data.balances[userId] = prev - amt;
  data.transactions.unshift({
    id: Date.now(), userId, type: type || 'deduct', amount: -amt,
    balance: prev - amt, description: description || '예치금 차감',
    createdAt: new Date().toISOString()
  });
  wj(F.deposits, data);
  console.log(`[예치금 차감] ${userId}: -${amt.toLocaleString()}원 → ${(prev-amt).toLocaleString()}원`);
  res.json({ success: true, balance: prev - amt });
});

app.get('/api/admin/deposits', (req, res) => {
  const data = rj(F.deposits, { balances: {}, transactions: [] });
  const users = rj(F.users, {});
  const summary = Object.entries(users)
    .filter(([uid, u]) => u.role === 'seller')
    .map(([uid, u]) => ({
      uid, loginId: u.loginId, company: u.company || u.loginId,
      balance: data.balances?.[uid] || 0
    }));
  res.json({ success: true, summary, transactions: data.transactions || [] });
});

// 셀러 목록 (어드민용)
app.post('/api/auth/users', (req, res) => {
  const users = rj(F.users, []); if (!Array.isArray(users)) return res.json({ users: [] });
  res.json({ success: true, users: users.map(u => ({ uid: u.uid, loginId: u.loginId, company: u.company, role: u.role })) });
});

// 어드민: 추적 상태 직접 변경
app.post('/api/order-tracking/update-admin-status', (req, res) => {
  let list = rj(F.orderTracking, []); if (!Array.isArray(list)) list = [];
  const { trackId, status } = req.body;
  const idx = list.findIndex(t => t.id === trackId);
  if (idx >= 0) { list[idx].supplyStatus = status; list[idx].updatedAt = new Date().toISOString(); wj(F.orderTracking, list); }
  res.json({ success: true });
});

// ========== 주문 추적 / 재발주 시스템 ==========
// 데이터: data/order_tracking.json (array)
// 키: id(track_xxx), sellerId, orderId(쿠팡), supplyStatus

app.get('/api/order-tracking/:sellerId', (req, res) => {
  let list = rj(F.orderTracking, []); if (!Array.isArray(list)) list = [];
  res.json({ success: true, tracking: list.filter(t => t.sellerId === req.params.sellerId) });
});

app.get('/api/admin/order-tracking', (req, res) => {
  let list = rj(F.orderTracking, []); if (!Array.isArray(list)) list = [];
  res.json({ success: true, tracking: list });
});

// 어드민: 공급취소 등록
app.post('/api/order-tracking/cancel', (req, res) => {
  let list = rj(F.orderTracking, []); if (!Array.isArray(list)) list = [];
  const { orderId, sellerId, sellerName, productName, optionName, quantity, receiverName, orderDate, cancelReason } = req.body;
  if (!orderId || !sellerId) return res.status(400).json({ success: false, message: '주문번호/셀러 필요' });
  const key = `${sellerId}_${orderId}`;
  const idx = list.findIndex(t => t.key === key);
  const entry = {
    id: idx >= 0 ? list[idx].id : 'track_' + Date.now(),
    key, orderId: String(orderId), sellerId, sellerName: sellerName || '',
    productName: productName || '', optionName: optionName || '',
    quantity: parseInt(quantity) || 1, receiverName: receiverName || '', orderDate: orderDate || '',
    supplyStatus: '공급취소', cancelReason: cancelReason || '기타',
    reorderedFromId: null, reorderedToId: null, reorderMemo: '',
    createdAt: idx >= 0 ? list[idx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (idx >= 0) list[idx] = entry; else list.unshift(entry);
  wj(F.orderTracking, list);
  console.log(`[공급취소] ${orderId} - 셀러:${sellerName} - 사유:${cancelReason}`);
  res.json({ success: true });
});

// 공급 상태 업데이트 (발주완료 처리)
app.post('/api/order-tracking/update', (req, res) => {
  let list = rj(F.orderTracking, []); if (!Array.isArray(list)) list = [];
  const { orderId, sellerId, sellerName, productName, optionName, quantity, receiverName, orderDate, supplyStatus } = req.body;
  if (!orderId || !sellerId) return res.status(400).json({ success: false, message: '필수 항목 누락' });
  const key = `${sellerId}_${orderId}`;
  const idx = list.findIndex(t => t.key === key);
  if (idx >= 0) {
    list[idx].supplyStatus = supplyStatus || '발주완료';
    list[idx].updatedAt = new Date().toISOString();
  } else {
    list.unshift({
      id: 'track_' + Date.now(), key, orderId: String(orderId), sellerId, sellerName: sellerName || '',
      productName: productName || '', optionName: optionName || '',
      quantity: parseInt(quantity) || 1, receiverName: receiverName || '', orderDate: orderDate || '',
      supplyStatus: supplyStatus || '발주완료', cancelReason: '',
      reorderedFromId: null, reorderedToId: null, reorderMemo: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }
  wj(F.orderTracking, list);
  res.json({ success: true });
});

// 셀러: 재발주 처리
app.post('/api/order-tracking/reorder', (req, res) => {
  let list = rj(F.orderTracking, []); if (!Array.isArray(list)) list = [];
  const { trackIds, memo } = req.body;
  if (!Array.isArray(trackIds) || !trackIds.length) return res.status(400).json({ success: false, message: '재발주 항목 없음' });

  const newEntries = [];
  const updates = {};
  trackIds.forEach(origId => {
    const orig = list.find(t => t.id === origId);
    if (!orig || orig.supplyStatus !== '공급취소') return;
    const newId = 'track_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    updates[origId] = newId;
    newEntries.push({
      id: newId, key: orig.key + '_re', orderId: orig.orderId, sellerId: orig.sellerId,
      sellerName: orig.sellerName, productName: orig.productName, optionName: orig.optionName,
      quantity: orig.quantity, receiverName: orig.receiverName, orderDate: orig.orderDate,
      supplyStatus: '재발주완료', cancelReason: '', reorderedFromId: origId, reorderedToId: null,
      reorderMemo: memo || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  });

  list = list.map(t => {
    if (updates[t.id]) return { ...t, supplyStatus: '재발주완료', reorderedToId: updates[t.id], updatedAt: new Date().toISOString() };
    return t;
  });
  list = [...newEntries, ...list];
  wj(F.orderTracking, list);
  console.log(`[재발주] ${newEntries.length}건 처리`);
  res.json({ success: true, count: newEntries.length });
});

// 예치금 정기 차감 설정 저장/조회
app.get('/api/deposits/settings', (req, res) => {
  const data = rj(F.deposits, { balances: {}, transactions: [], settings: {} });
  res.json({ success: true, settings: data.settings || {} });
});
app.post('/api/deposits/settings', (req, res) => {
  const data = rj(F.deposits, { balances: {}, transactions: [], settings: {} });
  data.settings = { ...data.settings, ...req.body };
  wj(F.deposits, data);
  res.json({ success: true });
});

// ========== 발주 자동화: 쿠팡 주문 → 매핑 필터 → 정규화 저장 ==========

// 모든 셀러의 쿠팡 주문을 가져와 매핑된 상품만 정규화 저장
app.post('/api/admin/fetch-mapped-orders', async (req, res) => {
  const { createdAtFrom, createdAtTo } = req.body;
  const users = rj(F.users, {});
  const mappings = rj(F.mappings, []);
  const activeMappings = mappings.filter(m => m.active && m.supplierId);

  if (!activeMappings.length) return res.json({ success: true, saved: 0, message: '활성 매핑 없음' });

  const from = createdAtFrom || new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
  const to = createdAtTo || new Date().toISOString().split('T')[0];

  let existing = rj(F.normalizedOrders, []);
  if (!Array.isArray(existing)) existing = [];
  const existingKeys = new Set(existing.map(o => o.key));

  const newOrders = [];
  const errors = [];

  for (const [uid, seller] of Object.entries(users)) {
    if (!seller.vendorId || !seller.accessKey || !seller.secretKey) continue;
    const sellerMappings = activeMappings.filter(m => m.userId === uid);
    if (!sellerMappings.length) continue;

    const mappedProductIds = new Set(sellerMappings.map(m => String(m.productId)));

    try {
      const statuses = ['ACCEPT', 'INSTRUCT'];
      for (const st of statuses) {
        try {
          const r = await cpnGet(
            `/v2/providers/openapi/apis/api/v4/vendors/${seller.vendorId}/ordersheets?status=${st}&createdAtFrom=${from}&createdAtTo=${to}&maxPerPage=100`,
            seller.secretKey, seller.accessKey, seller.vendorId
          );
          const orders = r.data?.data || [];
          for (const o of orders) {
            const pid = String(o.sellerProductId || o.vendorItemId || '');
            const mapping = sellerMappings.find(m =>
              String(m.productId) === pid ||
              String(m.productId) === String(o.sellerProductId) ||
              String(m.productId) === String(o.vendorItemId)
            );
            if (!mapping) continue;

            const key = `cpn_${o.shipmentBoxId || o.orderId}`;
            if (existingKeys.has(key)) continue;

            const productFull = [o.sellerProductName, o.sellerProductItemName].filter(Boolean).join(' / ');
            const normalized = {
              id: `poi_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
              key,
              source: 'coupang',
              sellerId: uid,
              sellerName: seller.company || seller.loginId || uid,
              orderId: String(o.orderId || ''),
              shipmentBoxId: String(o.shipmentBoxId || ''),
              productId: pid,
              mappingId: mapping.id,
              supplierId: mapping.supplierId,
              supplierName: mapping.supplierName,
              // 발주서 9개 필드
              ordererName: o.orderer?.name || '',
              ordererPhone: o.orderer?.safeNumber || o.orderer?.ordererPhoneNumber || '',
              senderAddress: o.orderer?.addr || '',
              productName: productFull,
              quantity: o.shippingCount || 1,
              receiverName: o.receiver?.name || '',
              receiverPhone: o.receiver?.safeNumber || o.receiver?.receiverPhoneNumber1 || '',
              receiverAddress: ((o.receiver?.addr1 || '') + ' ' + (o.receiver?.addr2 || '')).trim(),
              deliveryMessage: o.parcelPrintMessage || '',
              // 메타
              orderDate: o.orderedAt || '',
              orderStatus: st,
              supplyStatus: '미발주',
              fetchedAt: new Date().toISOString(),
            };
            newOrders.push(normalized);
            existingKeys.add(key);
          }
        } catch (e) { errors.push(`${seller.company||uid} [${st}]: ${e.response?.data?.message || e.message}`); }
      }
    } catch (e) { errors.push(`${seller.company||uid}: ${e.message}`); }
  }

  if (newOrders.length) {
    existing.unshift(...newOrders);
    wj(F.normalizedOrders, existing);
  }

  res.json({ success: true, saved: newOrders.length, total: existing.length, errors });
});

// 정규화 주문 목록 조회
app.get('/api/admin/normalized-orders', (req, res) => {
  let list = rj(F.normalizedOrders, []);
  if (!Array.isArray(list)) list = [];
  const { supplierId, supplyStatus, from, to } = req.query;
  if (supplierId) list = list.filter(o => String(o.supplierId) === String(supplierId));
  if (supplyStatus) list = list.filter(o => o.supplyStatus === supplyStatus);
  if (from) list = list.filter(o => o.orderDate >= from);
  if (to) list = list.filter(o => o.orderDate <= to + 'T23:59:59');
  res.json({ success: true, orders: list, total: list.length });
});

// 발주 상태 업데이트 (미발주 → 발주완료)
app.post('/api/admin/normalized-orders/update-status', (req, res) => {
  const { ids, supplyStatus } = req.body;
  if (!ids?.length || !supplyStatus) return res.status(400).json({ success: false, message: '필요 데이터 없음' });
  let list = rj(F.normalizedOrders, []);
  ids.forEach(id => {
    const idx = list.findIndex(o => o.id === id);
    if (idx >= 0) { list[idx].supplyStatus = supplyStatus; list[idx].updatedAt = new Date().toISOString(); }
  });
  wj(F.normalizedOrders, list);
  res.json({ success: true });
});

// 발주서 엑셀 다운로드 (선택 주문 → 발주서 9개 필드 엑셀)
app.post('/api/admin/normalized-orders/export-excel', (req, res) => {
  const { ids, supplierName } = req.body;
  let list = rj(F.normalizedOrders, []);
  const targets = ids?.length ? list.filter(o => ids.includes(o.id)) : list;
  if (!targets.length) return res.status(400).json({ success: false, message: '대상 없음' });

  const rows = targets.map(o => ({
    '주문자명': o.ordererName,
    '주문자 전화번호': o.ordererPhone,
    '보내는분 주소': o.senderAddress,
    '상품명(옵션포함)': o.productName,
    '주문건수': o.quantity,
    '받는분 성명': o.receiverName,
    '받는분 전화번호': o.receiverPhone,
    '받는분주소': o.receiverAddress,
    '배송메시지': o.deliveryMessage,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // 컬럼 너비 설정
  ws['!cols'] = [14,18,30,30,10,14,18,40,30].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '발주서');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const fname = encodeURIComponent(`발주서_${supplierName || '거래처'}_${new Date().toISOString().slice(0,10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// ========== 쿠팡 주문서 엑셀 업로드 → 발주서 변환 (테스트용) ==========
app.post('/api/admin/parse-coupang-excel', excelUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '파일 없음' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.json({ success: false, message: '데이터 없음' });

    const find = (row, ...pats) => {
      const k = Object.keys(row).find(k => pats.some(p => k.includes(p)));
      return k ? String(row[k]).trim() : '';
    };

    const parsed = rows.map((row, i) => {
      const productName = find(row, '등록상품명', '노출상품명', '상품명');
      const optionName = find(row, '등록옵션명', '옵션명', '옵션');
      const productFull = [productName, optionName].filter(Boolean).join(' / ');
      return {
        id: `excel_${Date.now()}_${i}`,
        source: 'coupang_excel',
        ordererName: find(row, '구매자'),
        ordererPhone: find(row, '구매자전화번호', '구매자 전화번호'),
        senderAddress: '',
        productName: productFull,
        quantity: parseInt(find(row, '구매수', '수량')) || 1,
        receiverName: find(row, '수취인이름', '수취인명', '수취인'),
        receiverPhone: find(row, '수취인전화번호', '수취인 전화번호'),
        receiverAddress: find(row, '수취인 주소', '주소'),
        deliveryMessage: find(row, '배송메세지', '배송메시지'),
        orderId: find(row, '주문번호'),
        supplyStatus: '미발주',
      };
    }).filter(r => r.receiverName || r.orderId);

    res.json({ success: true, orders: parsed, total: parsed.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 네이버 스마트스토어 주문서 엑셀 파싱
app.post('/api/admin/parse-naver-excel', excelUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '파일 없음' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // 네이버 주문서는 상단에 안내문구가 있어 헤더 행을 자동 탐색
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    let headerIdx = raw.findIndex(row => Array.isArray(row) && row.some(c => String(c).trim() === '상품주문번호'));
    if (headerIdx < 0) return res.json({ success: false, message: '헤더 찾기 실패 (상품주문번호 없음)' });
    const headers = raw[headerIdx].map(h => String(h).trim());
    const rows = raw.slice(headerIdx + 1).filter(r => r.some(c => c !== '')).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });
    if (!rows.length) return res.json({ success: false, message: '데이터 없음' });

    const find = (row, ...pats) => {
      const k = Object.keys(row).find(k => pats.some(p => k.includes(p)));
      return k ? String(row[k]).trim() : '';
    };

    const parsed = rows.map((row, i) => {
      const productName = find(row, '상품명');
      const optionName = find(row, '옵션정보', '옵션');
      const productFull = [productName, optionName].filter(v => v && v !== '-').join(' / ');
      let address = find(row, '통합배송지');
      if (!address) address = [find(row, '기본배송지'), find(row, '상세배송지')].filter(Boolean).join(' ');
      return {
        id: `naver_${Date.now()}_${i}`,
        source: 'naver_excel',
        ordererName: find(row, '구매자명', '구매자'),
        ordererPhone: find(row, '구매자연락처'),
        senderAddress: '',
        productName: productFull,
        quantity: parseInt(find(row, '수량')) || 1,
        receiverName: find(row, '수취인명'),
        receiverPhone: find(row, '수취인연락처1', '수취인연락처'),
        receiverAddress: address,
        deliveryMessage: find(row, '배송메세지', '배송메시지'),
        orderId: find(row, '상품주문번호') || find(row, '주문번호'),
        supplyStatus: '미발주',
      };
    }).filter(r => r.receiverName || r.orderId);

    res.json({ success: true, orders: parsed, total: parsed.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 파싱된 주문 → 발주서 엑셀 다운로드
app.post('/api/admin/excel-to-purchase-order', (req, res) => {
  const { orders, supplierName } = req.body;
  if (!orders?.length) return res.status(400).json({ success: false, message: '데이터 없음' });

  const rows = orders.map(o => ({
    '주문자명': o.ordererName || '',
    '주문자 전화번호': o.ordererPhone || '',
    '보내는분 주소': o.senderAddress || '',
    '상품명(옵션포함)': o.productName || '',
    '주문건수': o.quantity || 1,
    '받는분 성명': o.receiverName || '',
    '받는분 전화번호': o.receiverPhone || '',
    '받는분주소': o.receiverAddress || '',
    '배송메세지': o.deliveryMessage || '',
    '택배사': '',
    '운송장': '',
    '주문번호': o.orderId || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [14,18,30,30,10,14,18,40,30,12,16,20].map(w => ({ wch: w }));
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, '발주서');
  const buf = XLSX.write(wbOut, { type: 'buffer', bookType: 'xlsx' });

  const fname = encodeURIComponent(`발주서_${supplierName || '거래처'}_${new Date().toISOString().slice(0,10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// ===== Start =====
app.listen(PORT, () => console.log(`\n  Sellio 서버: http://localhost:${PORT}\n`));
