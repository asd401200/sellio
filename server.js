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
  users: 'data/users.json', reviews: 'data/review_requests.json',
  tags: 'data/review_tags.json', config: 'data/config.json',
  suppliers: 'data/suppliers.json', mappings: 'data/mappings.json',
  purchaseOrders: 'data/purchase_orders.json',
  supplierRequests: 'data/supplier_requests.json',
  wsProducts: 'data/ws_products.json',
  wsOrders: 'data/ws_orders.json',
  deposits: 'data/deposits.json',
  orderTracking: 'data/order_tracking.json',
};
Object.values(F).forEach(f => {
  if (!fs.existsSync(f)) fs.writeFileSync(f, f.includes('review') || f.includes('supplier') || f.includes('mapping') || f.includes('purchase') ? '[]' : '{}', 'utf8');
});

const rj = (file, fb) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; } };
const wj = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
const hash = pw => crypto.createHash('sha256').update(pw + 'sellio_2026').digest('hex');

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
const cpnGet = (u, sk, ak, vid) => axios.get(`https://${CPN}${u}`, { headers: cpnH('GET', u, sk, ak, vid), timeout: 15000 });
const cpnPut = (u, body, sk, ak, vid) => axios.put(`https://${CPN}${u}`, body, { headers: cpnH('PUT', u, sk, ak, vid), timeout: 15000 });

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

// ========== 하루팜 시드 + 서버 시작 시 전체 공급처 업데이트 ==========
(async function initSuppliers() {
  // 하루팜 시드 (없으면 생성)
  let suppliers = rj(F.suppliers, []); if (!Array.isArray(suppliers)) suppliers = [];
  if (!suppliers.find(s => s.name === '하루팜')) {
    suppliers.push({ id: Date.now(), name: '하루팜', sheetUrl: 'https://docs.google.com/spreadsheets/d/18tbzUoRTNLa6KkJXUIcNnX2HVhpDxNNSnhdXpsodw1M/edit#gid=0', products: [], contact: 'harumart88@naver.com', phone: '', email: 'harumart88@naver.com', note: '제주 과일 전문', createdAt: new Date().toISOString() });
    wj(F.suppliers, suppliers);
  }
  // 서버 시작 시 모든 공급처 업데이트
  await refreshAllSuppliers();
})();

// 24시간마다 공급처 상품 자동 업데이트
setInterval(async () => {
  console.log(`[스케줄] 공급처 상품 업데이트 시작: ${new Date().toLocaleString('ko')}`);
  await refreshAllSuppliers();
}, 24 * 60 * 60 * 1000);

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

app.get('/api/admin/all-requests', (req, res) => {
  let list = rj(F.reviews, []); if (!Array.isArray(list)) list = [];
  res.json({ success: true, requests: list, total: list.length });
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

// ========== 체험단 ==========
app.post('/api/review/apply', (req, res) => {
  try {
    const b = req.body;
    const rq = {
      id: Date.now(), userId: b.userId || '', seller: b.seller || '', sellerEmail: b.sellerEmail || '',
      productName: b.productName || '', keyword: b.keyword || '', productUrl: b.productUrl || '',
      purchaseOption: b.purchaseOption || '', totalCount: parseInt(b.totalCount) || 0, dailyCount: parseInt(b.dailyCount) || 0,
      requestTime: b.requestTime || '상관없음', photoReview: b.photoReview === true || b.photoReview === 'true' ? '유' : '무',
      reviewGuide: b.reviewGuide || 'X', paymentProxy: b.paymentProxy === true || b.paymentProxy === 'true' ? 'Y' : 'N',
      deliveryProxy: b.deliveryProxy === true || b.deliveryProxy === 'true' ? 'Y' : 'N',
      weekend: b.weekend === true || b.weekend === 'true' ? 'O' : 'X',
      productImage: null,
      status: '대기중', createdAt: new Date().toISOString(),
    };
    let list = rj(F.reviews, []); if (!Array.isArray(list)) list = [];
    list.unshift(rq); wj(F.reviews, list);
    res.json({ success: true, request: rq });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/review/list', (req, res) => {
  let list = rj(F.reviews, []); if (!Array.isArray(list)) list = [];
  if (req.query.userId) list = list.filter(r => r.userId === req.query.userId);
  res.json({ success: true, requests: list });
});

app.get('/api/review/export', (req, res) => {
  let list = rj(F.reviews, []); if (!Array.isArray(list)) list = [];
  if (req.query.userId) list = list.filter(r => r.userId === req.query.userId);
  const pending = list.filter(r => r.status === '대기중');
  let text = '';
  pending.forEach((r, i) => {
    if (i > 0) text += '\n━━━━━━━━━━━━━━━\n\n';
    text += `[${i + 1}] 체험단 신청\n\n`;
    text += `1. 구매진행시 검색할 키워드: ${r.keyword}\n2. 총 구매 건수 : ${r.totalCount}\n3. 일 진행 건수 : ${r.dailyCount}\n4. 진행 요청 시간 : ${r.requestTime}\n5. 상품주소 / 상품 이미지 : ${r.productUrl}\n6. 구매옵션 : ${r.purchaseOption || '-'}\n7. 포토제공 유 무 : ${r.photoReview}\n8. 리뷰내용 가이드 : ${r.reviewGuide || 'X'}\n9. 입금대행 Y/N : ${r.paymentProxy}\n10. 택배대행 Y/N: ${r.deliveryProxy}\n11. 주말 진행 여부 : ${r.weekend}\n`;
    if (r.seller) text += `\n신청자: ${r.seller}`;
  });
  if (!text) text = '대기중 없음';
  res.json({ success: true, text, count: pending.length, requests: pending });
});

app.post('/api/review/update-status', (req, res) => {
  const { id, status } = req.body;
  let list = rj(F.reviews, []); if (!Array.isArray(list)) list = [];
  const idx = list.findIndex(r => r.id === id);
  if (idx >= 0) { list[idx].status = status; wj(F.reviews, list); }
  res.json({ success: true });
});

// ========== 태그 ==========
app.post('/api/review/set-tags', (req, res) => {
  const tags = rj(F.tags, {}); tags[req.body.userId || 'default'] = [...new Set((req.body.orderIds || []).map(String))]; wj(F.tags, tags); res.json({ success: true });
});
app.post('/api/review/get-tags', (req, res) => {
  const tags = rj(F.tags, {}); res.json({ success: true, orderIds: tags[req.body.userId || 'default'] || [] });
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
  res.json({ success: true, config: { apiKey: s.apiKey ? '****' + s.apiKey.slice(-4) : '', apiSecret: s.apiSecret ? '설정됨' : '', pfId: s.pfId || '', senderNumber: s.senderNumber || '', configured: !!(s.apiKey && s.apiSecret) } });
});

// 솔라피 메시지 발송
app.post('/api/admin/solapi/send', async (req, res) => {
  const { to, text, type } = req.body;
  if (!to || !text) return res.status(400).json({ success: false, message: '수신번호와 메시지 필요' });
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
    msgBody.message.subject = '체험단 신청 안내';
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
      msg.subject = '체험단 신청 안내';
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
  const users = rj(F.users, []);
  const sellers = (Array.isArray(users) ? users : []).filter(u => u.role === 'seller');
  const summary = sellers.map(u => ({
    uid: u.uid, loginId: u.loginId, company: u.company || u.loginId,
    balance: data.balances?.[u.uid] || 0
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

// ===== Start =====
app.listen(PORT, () => console.log(`\n  Sellio 서버: http://localhost:${PORT}\n`));
