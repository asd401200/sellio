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

// ===== 디렉토리/파일 초기화 =====
['uploads', 'data'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
const FILES = {
  users: 'data/users.json',
  reviews: 'data/review_requests.json',
  tags: 'data/review_tags.json',
};
Object.values(FILES).forEach(f => { if (!fs.existsSync(f)) fs.writeFileSync(f, f.includes('review_requests') ? '[]' : '{}'); });

function readJSON(file, fb) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ===== Multer =====
const imgUpload = multer({
  storage: multer.diskStorage({
    destination: (r, f, cb) => cb(null, 'uploads/'),
    filename: (r, f, cb) => cb(null, `img_${Date.now()}${path.extname(f.originalname)}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (r, f, cb) => {
    if (/jpeg|jpg|png|gif|webp/.test(path.extname(f.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 이미지 형식입니다 (jpg, png, gif, webp만 가능)'));
    }
  }
});
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ===== Coupang HMAC =====
const CPN = 'api-gateway.coupang.com';

function generateHmac(method, urlPath, secretKey, accessKey) {
  const datetime = new Date().toISOString().substr(2, 17).replace(/[-:]/g, '') + 'Z';
  const qIdx = urlPath.indexOf('?');
  const pathPart = qIdx >= 0 ? urlPath.substring(0, qIdx) : urlPath;
  const queryPart = qIdx >= 0 ? urlPath.substring(qIdx + 1) : '';
  const message = datetime + method.toUpperCase() + pathPart + queryPart;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

function cpnHeaders(method, url, sk, ak, vendorId) {
  return {
    Authorization: generateHmac(method, url, sk, ak),
    'Content-Type': 'application/json',
    'X-Requested-By': String(vendorId),
  };
}

const cpnGet = (url, sk, ak, vid) => axios.get(`https://${CPN}${url}`, { headers: cpnHeaders('GET', url, sk, ak, vid), timeout: 15000 });
const cpnPut = (url, body, sk, ak, vid) => axios.put(`https://${CPN}${url}`, body, { headers: cpnHeaders('PUT', url, sk, ak, vid), timeout: 15000 });

// ========== 유저 관리 ==========
app.post('/api/user/save-keys', (req, res) => {
  const { userId, vendorId, accessKey, secretKey } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId 필요' });
  const u = readJSON(FILES.users, {});
  u[userId] = { vendorId, accessKey, secretKey, updatedAt: new Date().toISOString() };
  writeJSON(FILES.users, u);
  res.json({ success: true });
});

app.post('/api/user/load-keys', (req, res) => {
  if (!req.body.userId) return res.status(400).json({ success: false, message: 'userId 필요' });
  const u = readJSON(FILES.users, {});
  res.json({ success: true, keys: u[req.body.userId] || null });
});

// ========== 쿠팡: 연결 테스트 ==========
app.post('/api/coupang/test', async (req, res) => {
  const { vendorId, accessKey, secretKey } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: '모든 항목 입력 필요' });
  try {
    await cpnGet(`/v2/providers/seller_api/apis/api/v1/marketplace/seller-products?vendorId=${vendorId}&nextToken=&maxPerPage=1&status=APPROVED`, secretKey, accessKey, vendorId);
    res.json({ success: true, message: '연결 성공' });
  } catch (e) {
    const errData = e.response?.data;
    console.error('[쿠팡 API 테스트 실패]', JSON.stringify(errData || e.message));
    res.status(400).json({ success: false, message: `연결 실패: ${errData?.message || errData?.error || e.message}`, detail: errData });
  }
});

// ========== 쿠팡: 상품 목록 ==========
app.post('/api/coupang/products', async (req, res) => {
  const { vendorId, accessKey, secretKey } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: 'API 설정 필요' });
  try {
    const all = [];
    let token = '', page = 0;
    do {
      const r = await cpnGet(`/v2/providers/seller_api/apis/api/v1/marketplace/seller-products?vendorId=${vendorId}&nextToken=${token}&maxPerPage=100&status=APPROVED`, secretKey, accessKey, vendorId);
      (r.data?.data || []).forEach(p => {
        if (p.sellerProductId) all.push({
          sellerProductId: p.sellerProductId,
          name: p.sellerProductName || '',
          vendorItemId: p.vendorItemId || '',
          optionId: p.sellerProductItemId || '',
          option: p.itemName || '',
          salePrice: p.salePrice || 0,
        });
      });
      token = r.data?.nextToken || '';
      page++;
    } while (token && page < 5);
    res.json({ success: true, products: all, total: all.length });
  } catch (e) {
    console.error('[상품 조회 실패]', e.response?.data || e.message);
    res.status(400).json({ success: false, message: `상품 조회 실패: ${e.response?.data?.message || e.message}` });
  }
});

// ========== 쿠팡: 주문 조회 ==========
app.post('/api/coupang/orders', async (req, res) => {
  const { vendorId, accessKey, secretKey, status = 'INSTRUCT', createdAtFrom, createdAtTo } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: 'API 설정 필요' });
  try {
    const from = createdAtFrom || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const to = createdAtTo || new Date().toISOString().split('T')[0];
    const sts = status === 'ALL' ? ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'] : [status];
    const all = [];
    const labels = { ACCEPT: '결제완료', INSTRUCT: '상품준비중', DEPARTURE: '배송지시', DELIVERING: '배송중', FINAL_DELIVERY: '배송완료' };
    const errors = [];

    for (const st of sts) {
      try {
        const r = await cpnGet(`/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?status=${st}&createdAtFrom=${from}&createdAtTo=${to}&maxPerPage=50`, secretKey, accessKey, vendorId);
        (r.data?.data || []).forEach(o => all.push({
          orderId: o.orderId, shipmentBoxId: o.shipmentBoxId,
          ordererName: o.orderer?.name || '', receiverName: o.receiver?.name || '',
          receiverAddr: ((o.receiver?.addr1 || '') + ' ' + (o.receiver?.addr2 || '')).trim(),
          receiverPhone: o.receiver?.safeNumber || o.receiver?.receiverPhoneNumber1 || '',
          productName: o.sellerProductName || '', optionName: o.sellerProductItemName || '',
          quantity: o.shippingCount || 1, orderDate: o.orderedAt || '',
          status: st, statusText: labels[st] || st,
          vendorItemId: o.vendorItemId || '', paymentPrice: o.orderPrice || 0,
        }));
      } catch (e) {
        const msg = e.response?.data?.message || e.message;
        console.error(`[주문 조회 ${st} 실패]`, msg);
        errors.push({ status: st, message: msg });
      }
    }
    all.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    res.json({ success: true, orders: all, total: all.length, errors: errors.length > 0 ? errors : undefined });
  } catch (e) {
    res.status(400).json({ success: false, message: e.response?.data?.message || e.message });
  }
});

// ========== 쿠팡: 발주확인 (결제완료 → 상품준비중) ==========
app.post('/api/coupang/approve-orders', async (req, res) => {
  const { vendorId, accessKey, secretKey, shipmentBoxIds } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: 'API 설정 필요' });
  if (!Array.isArray(shipmentBoxIds) || shipmentBoxIds.length === 0) return res.status(400).json({ success: false, message: '이동할 주문이 없습니다' });

  const results = [];
  for (const boxId of shipmentBoxIds) {
    try {
      const url = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets/${boxId}/acknowledgement`;
      await cpnPut(url, { vendorId, shipmentBoxId: parseInt(boxId) }, secretKey, accessKey, vendorId);
      results.push({ shipmentBoxId: boxId, success: true });
    } catch (e) {
      results.push({ shipmentBoxId: boxId, success: false, message: e.response?.data?.message || e.message });
    }
  }
  const ok = results.filter(r => r.success).length;
  res.json({ success: true, results, summary: { total: shipmentBoxIds.length, success: ok, fail: shipmentBoxIds.length - ok } });
});

// ========== 쿠팡: 송장 일괄 등록 ==========
app.post('/api/coupang/invoice-batch', async (req, res) => {
  const { vendorId, accessKey, secretKey, invoices } = req.body;
  if (!vendorId || !accessKey || !secretKey) return res.status(400).json({ success: false, message: 'API 설정 필요' });
  if (!Array.isArray(invoices) || invoices.length === 0) return res.status(400).json({ success: false, message: '등록할 송장이 없습니다' });

  const results = [];
  for (const inv of invoices) {
    if (!inv.shipmentBoxId || !inv.invoiceNumber) {
      results.push({ shipmentBoxId: inv.shipmentBoxId, success: false, message: '송장번호 또는 주문번호 누락' });
      continue;
    }
    try {
      const url = `/v2/providers/openapi/apis/api/v5/vendors/${vendorId}/ordersheets/${inv.shipmentBoxId}/invoice`;
      await cpnPut(url, {
        vendorId,
        shipmentBoxId: parseInt(inv.shipmentBoxId),
        invoiceNumber: String(inv.invoiceNumber),
        deliveryCompanyCode: inv.deliveryCompanyCode || 'CJGLS',
      }, secretKey, accessKey, vendorId);
      results.push({ shipmentBoxId: inv.shipmentBoxId, success: true });
    } catch (e) {
      results.push({ shipmentBoxId: inv.shipmentBoxId, success: false, message: e.response?.data?.message || e.message });
    }
  }
  const ok = results.filter(r => r.success).length;
  res.json({ success: true, results, summary: { total: invoices.length, success: ok, fail: invoices.length - ok } });
});

// ========== 엑셀 파싱 ==========
app.post('/api/invoice/parse-excel', excelUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '파일 없음' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    if (!wb.SheetNames.length) return res.status(400).json({ success: false, message: '빈 엑셀 파일입니다' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (rows.length === 0) return res.json({ success: true, data: [], total: 0 });

    const parsed = rows.map(row => {
      const keys = Object.keys(row);
      const find = (...pats) => { const k = keys.find(k => pats.some(p => k.includes(p))); return k ? String(row[k]).trim() : ''; };
      return {
        orderId: find('주문번호', '주문', 'orderId', 'order'),
        receiverName: find('수령인', '수취인', '받는분', 'receiver', '이름'),
        invoiceNumber: find('송장번호', '운송장', '송장', 'invoice', 'tracking'),
        deliveryCompany: find('택배사', '배송사', 'courier', 'delivery'),
        productName: find('상품명', '상품', 'product'),
        option: find('옵션', 'option'),
        phone: find('연락처', '전화', '휴대폰', 'phone', 'tel'),
      };
    }).filter(r => r.invoiceNumber || r.orderId || r.receiverName);
    res.json({ success: true, data: parsed, total: parsed.length });
  } catch (e) {
    console.error('[엑셀 파싱 실패]', e.message);
    res.status(500).json({ success: false, message: `엑셀 파싱 실패: ${e.message}` });
  }
});

// ========== 체험단 신청 ==========
app.post('/api/review/apply', imgUpload.single('productImage'), (req, res) => {
  try {
    const b = req.body;
    const rq = {
      id: Date.now(),
      userId: b.userId || '',
      seller: b.seller || '',
      sellerEmail: b.sellerEmail || '',
      productName: b.productName || '',
      keyword: b.keyword || '',
      productUrl: b.productUrl || '',
      purchaseOption: b.purchaseOption || '',
      totalCount: parseInt(b.totalCount) || 0,
      dailyCount: parseInt(b.dailyCount) || 0,
      requestTime: b.requestTime || '상관없음',
      photoReview: b.photoReview === 'true' ? '유' : '무',
      reviewGuide: b.reviewGuide || 'X',
      paymentProxy: b.paymentProxy === 'true' ? 'Y' : 'N',
      deliveryProxy: b.deliveryProxy === 'true' ? 'Y' : 'N',
      weekend: b.weekend === 'true' ? 'O' : 'X',
      productImage: req.file ? `/uploads/${req.file.filename}` : null,
      status: '대기중',
      createdAt: new Date().toISOString(),
    };
    let list = readJSON(FILES.reviews, []);
    if (!Array.isArray(list)) list = [];
    list.unshift(rq);
    writeJSON(FILES.reviews, list);
    console.log(`[체험단 신청] ${rq.seller} | ${rq.keyword} | ${rq.totalCount}건`);
    res.json({ success: true, request: rq });
  } catch (e) {
    console.error('[체험단 신청 실패]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/review/list', (req, res) => {
  let list = readJSON(FILES.reviews, []);
  if (!Array.isArray(list)) list = [];
  if (req.query.userId) list = list.filter(r => r.userId === req.query.userId);
  res.json({ success: true, requests: list });
});

app.get('/api/review/export', (req, res) => {
  let list = readJSON(FILES.reviews, []);
  if (!Array.isArray(list)) list = [];
  if (req.query.userId) list = list.filter(r => r.userId === req.query.userId);
  const pending = list.filter(r => r.status === '대기중');
  let text = `체험단 신청 (${new Date().toLocaleDateString('ko')}) ${pending.length}건\n━━━━━━━━━━━━\n\n`;
  pending.forEach((r, i) => {
    text += `[${i + 1}] ${r.productName}\n키워드: ${r.keyword}\n주소: ${r.productUrl}\n옵션: ${r.purchaseOption}\n총건수: ${r.totalCount} / 일건수: ${r.dailyCount}\n시간: ${r.requestTime}\n포토: ${r.photoReview} | 가이드: ${r.reviewGuide || 'X'}\n입금대행: ${r.paymentProxy} | 택배대행: ${r.deliveryProxy} | 주말: ${r.weekend}\n\n`;
  });
  res.json({ success: true, text, count: pending.length, requests: pending });
});

app.post('/api/review/update-status', (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ success: false, message: 'id와 status 필요' });
  let list = readJSON(FILES.reviews, []);
  if (!Array.isArray(list)) list = [];
  const idx = list.findIndex(r => r.id === id);
  if (idx >= 0) {
    list[idx].status = status;
    writeJSON(FILES.reviews, list);
  }
  res.json({ success: true });
});

// ========== 체험단 태그 ==========
// set-tags: 클라이언트의 전체 태그 목록으로 교체 (기존 tag-orders는 병합 방식이라 버그 유발)
app.post('/api/review/set-tags', (req, res) => {
  const tags = readJSON(FILES.tags, {});
  const uid = req.body.userId || 'default';
  const orderIds = req.body.orderIds;
  if (!Array.isArray(orderIds)) return res.status(400).json({ success: false, message: 'orderIds 배열 필요' });
  tags[uid] = [...new Set(orderIds.map(String))];
  writeJSON(FILES.tags, tags);
  res.json({ success: true });
});

app.post('/api/review/tag-orders', (req, res) => {
  const tags = readJSON(FILES.tags, {});
  const uid = req.body.userId || 'default';
  tags[uid] = [...new Set([...(tags[uid] || []), ...(req.body.orderIds || []).map(String)])];
  writeJSON(FILES.tags, tags);
  res.json({ success: true });
});

app.post('/api/review/untag-orders', (req, res) => {
  const tags = readJSON(FILES.tags, {});
  const uid = req.body.userId || 'default';
  const removeSet = new Set((req.body.orderIds || []).map(String));
  tags[uid] = (tags[uid] || []).filter(id => !removeSet.has(id));
  writeJSON(FILES.tags, tags);
  res.json({ success: true });
});

app.post('/api/review/get-tags', (req, res) => {
  const tags = readJSON(FILES.tags, {});
  res.json({ success: true, orderIds: tags[req.body.userId || 'default'] || [] });
});

// ========== 마진 계산 ==========
app.post('/api/margin/calculate', (req, res) => {
  const { salePrice, costPrice, shippingCost = 0, commissionRate = 10.8, reviewCost = 0, otherCost = 0, quantity = 1 } = req.body;

  if (!salePrice || salePrice <= 0) return res.status(400).json({ success: false, message: '판매가를 입력해주세요' });

  const sale = parseFloat(salePrice);
  const cost = parseFloat(costPrice) || 0;
  const shipping = parseFloat(shippingCost) || 0;
  const commission = sale * (parseFloat(commissionRate) / 100);
  const review = parseFloat(reviewCost) || 0;
  const other = parseFloat(otherCost) || 0;
  const qty = parseInt(quantity) || 1;

  const totalCost = cost + shipping + commission + review + other;
  const profit = sale - totalCost;
  const marginRate = sale > 0 ? (profit / sale) * 100 : 0;

  const totalProfit = profit * qty;
  const totalRevenue = sale * qty;
  const totalCostAll = totalCost * qty;

  res.json({
    success: true,
    result: {
      salePrice: Math.round(sale),
      costPrice: Math.round(cost),
      shippingCost: Math.round(shipping),
      commission: Math.round(commission),
      commissionRate: parseFloat(commissionRate),
      reviewCost: Math.round(review),
      otherCost: Math.round(other),
      totalCost: Math.round(totalCost),
      profit: Math.round(profit),
      marginRate: Math.round(marginRate * 10) / 10,
      quantity: qty,
      totalRevenue: Math.round(totalRevenue),
      totalCostAll: Math.round(totalCostAll),
      totalProfit: Math.round(totalProfit),
    }
  });
});

// ===== Start =====
app.listen(PORT, () => console.log(`\n  Sellio 서버: http://localhost:${PORT}\n`));
