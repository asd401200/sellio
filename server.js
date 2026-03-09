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
};
Object.values(F).forEach(f => {
  if (!fs.existsSync(f)) fs.writeFileSync(f, f.includes('review') || f.includes('supplier') || f.includes('mapping') || f.includes('purchase') ? '[]' : '{}');
});

const rj = (file, fb) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; } };
const wj = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
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
  if (!loginId || loginId.length < 4) return res.status(400).json({ success: false, message: '아이디 4자 이상' });
  if (!password || password.length < 8) return res.status(400).json({ success: false, message: '비밀번호 8자 이상' });
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
  const { loginId, password } = req.body;
  if (!loginId || !password) return res.status(400).json({ success: false, message: '입력 필요' });
  const users = rj(F.users, {});
  const h = hash(password);
  const entry = Object.entries(users).find(([_, u]) => u.loginId === loginId && u.passwordHash === h);
  if (!entry) return res.status(401).json({ success: false, message: '아이디 또는 비밀번호 오류' });
  const [uid, data] = entry;
  data.lastLogin = new Date().toISOString();
  wj(F.users, users);
  res.json({ success: true, user: { uid, loginId: data.loginId, role: data.role, company: data.company, ceo: data.ceo, mobile: data.mobile, email: data.email } });
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
app.post('/api/review/apply', imgUpload.single('productImage'), (req, res) => {
  try {
    const b = req.body;
    const rq = {
      id: Date.now(), userId: b.userId || '', seller: b.seller || '', sellerEmail: b.sellerEmail || '',
      productName: b.productName || '', keyword: b.keyword || '', productUrl: b.productUrl || '',
      purchaseOption: b.purchaseOption || '', totalCount: parseInt(b.totalCount) || 0, dailyCount: parseInt(b.dailyCount) || 0,
      requestTime: b.requestTime || '상관없음', photoReview: b.photoReview === 'true' ? '유' : '무',
      reviewGuide: b.reviewGuide || 'X', paymentProxy: b.paymentProxy === 'true' ? 'Y' : 'N',
      deliveryProxy: b.deliveryProxy === 'true' ? 'Y' : 'N', weekend: b.weekend === 'true' ? 'O' : 'X',
      productImage: req.file ? `/uploads/${req.file.filename}` : null,
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
  const { userId, productName, productId, optionId, option, salePrice, supplierId, supplierName, costPrice, active } = req.body;
  if (!productId) return res.status(400).json({ success: false, message: '상품 필요' });
  const idx = list.findIndex(m => m.userId === userId && m.productId === productId);
  const entry = { userId, productName, productId, optionId, option, salePrice: parseFloat(salePrice) || 0,
    supplierId: supplierId || '', supplierName: supplierName || '', costPrice: parseFloat(costPrice) || 0,
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

// ===== Start =====
app.listen(PORT, () => console.log(`\n  Sellio 서버: http://localhost:${PORT}\n`));
