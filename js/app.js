// ============================================
//  Sellio — 관리자/셀러 분리 버전
// ============================================
const API = location.origin + '/api';

let currentUser = null;
let products = [], orders = [], reviewTags = new Set();
let orderTypeFilter = 'all';
let acceptOrders = [], matchedReviewOrders = [], invoiceMatchData = [];
let dashOrders = [];
// Admin state
let allRequests = [], allUsers = [], allSuppliers = [];
let adminReqFilter = 'all';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});

function getKeys() { const s = localStorage.getItem('sellio_api'); return s ? JSON.parse(s) : null; }
function needKeys() {
  const k = getKeys();
  if (!k || !k.vendorId || !k.accessKey || !k.secretKey) { toast('먼저 API를 설정해주세요'); navTo(currentUser?.role === 'admin' ? 'a-dashboard' : 's-api'); return null; }
  return k;
}

// ===== AUTH =====
function initAuth() {
  const saved = localStorage.getItem('sellio_user');
  if (saved) { currentUser = JSON.parse(saved); enterApp(); }

  document.getElementById('goto-register').onclick = e => { e.preventDefault(); document.getElementById('login-card').classList.add('hidden'); document.getElementById('register-card').classList.remove('hidden'); };
  document.getElementById('goto-login').onclick = e => { e.preventDefault(); document.getElementById('register-card').classList.add('hidden'); document.getElementById('login-card').classList.remove('hidden'); };
  document.getElementById('btn-login').onclick = doLogin;
  document.getElementById('login-pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  document.getElementById('btn-register').onclick = doRegister;
  document.getElementById('reg-email-statement-same').onchange = e => { if (e.target.checked) document.getElementById('reg-email-statement').value = document.getElementById('reg-email-order').value; };
  document.getElementById('reg-email-tax-same').onchange = e => { if (e.target.checked) document.getElementById('reg-email-tax').value = document.getElementById('reg-email-order').value; };
  document.getElementById('reg-biz-cert').onchange = e => {
    const f = e.target.files[0];
    document.getElementById('reg-biz-cert-name').textContent = f ? f.name : '선택된 파일 없음';
    if (f && f.size > 1024 * 1024) { toast('1MB 이하만'); e.target.value = ''; document.getElementById('reg-biz-cert-name').textContent = '선택된 파일 없음'; }
  };
  document.getElementById('btn-zip-search').onclick = openZipSearch;
  document.querySelectorAll('.logout-btn').forEach(b => b.onclick = doLogout);
}

async function doLogin() {
  const id = document.getElementById('login-id').value.trim(), pw = document.getElementById('login-pw').value;
  if (!id || !pw) { toast('아이디와 비밀번호를 입력하세요'); return; }
  const btn = document.getElementById('btn-login'); btn.disabled = true; btn.textContent = '로그인 중...';
  try {
    const d = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: id, password: pw }) })).json();
    if (d.success) { currentUser = d.user; localStorage.setItem('sellio_user', JSON.stringify(currentUser)); enterApp(); }
    else toast(d.message || '로그인 실패');
  } catch (e) { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '로그인';
}

async function doRegister() {
  const v = id => document.getElementById(id).value.trim();
  const data = { loginId: v('reg-id'), password: v('reg-pw'), password2: v('reg-pw2'), bizNumber: v('reg-biz-num'), company: v('reg-company'), bizType: v('reg-biz-type'), bizItem: v('reg-biz-item'), ceo: v('reg-ceo'), phone: v('reg-phone'), mobile: v('reg-mobile'), fax: v('reg-fax'), homepage: v('reg-homepage'), emailOrder: v('reg-email-order'), emailStatement: v('reg-email-statement'), emailTax: v('reg-email-tax'), zipcode: v('reg-zipcode'), address: v('reg-address'), addressDetail: v('reg-address-detail') };
  const checks = [
    [!data.loginId || data.loginId.length < 4, '아이디 4자 이상'], [!data.password || data.password.length < 8, '비밀번호 8자 이상'],
    [data.password !== data.password2, '비밀번호 불일치'], [!data.bizNumber, '사업자번호'], [!data.company, '회사명'],
    [!data.bizType || !data.bizItem, '업태/종목'], [!data.ceo, '대표자'], [!data.mobile, '휴대폰'],
    [!data.emailOrder, '주문서 이메일'], [!data.emailStatement, '거래명세표 이메일'], [!data.emailTax, '세금계산서 이메일'],
    [!data.zipcode || !data.address, '주소'],
  ];
  for (const [cond, msg] of checks) if (cond) { toast(msg + ' 입력 필요'); return; }
  const cert = document.getElementById('reg-biz-cert').files[0];
  if (!cert) { toast('사업자등록증 첨부 필요'); return; }

  const btn = document.getElementById('btn-register'); btn.disabled = true; btn.textContent = '가입 중...';
  try {
    const fd = new FormData();
    Object.entries(data).forEach(([k, val]) => fd.append(k, val));
    fd.append('bizCert', cert);
    const d = await (await fetch(`${API}/auth/register`, { method: 'POST', body: fd })).json();
    if (d.success) {
      toast('회원가입 완료!');
      document.getElementById('register-card').classList.add('hidden');
      document.getElementById('login-card').classList.remove('hidden');
      document.getElementById('login-id').value = data.loginId;
    } else toast(d.message || '실패');
  } catch (e) { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '가입하기';
}

function doLogout() {
  localStorage.removeItem('sellio_user'); currentUser = null;
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-seller').classList.add('hidden');
  document.getElementById('app-admin').classList.add('hidden');
  document.getElementById('login-card').classList.remove('hidden');
  document.getElementById('register-card').classList.add('hidden');
  toast('로그아웃');
}

function openZipSearch() {
  if (window.daum?.Postcode) { new daum.Postcode({ oncomplete: d => { document.getElementById('reg-zipcode').value = d.zonecode; document.getElementById('reg-address').value = d.roadAddress || d.jibunAddress; document.getElementById('reg-address-detail').focus(); } }).open(); return; }
  const s = document.createElement('script'); s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  s.onload = () => new daum.Postcode({ oncomplete: d => { document.getElementById('reg-zipcode').value = d.zonecode; document.getElementById('reg-address').value = d.roadAddress || d.jibunAddress; } }).open();
  document.head.appendChild(s);
}

// ===== ENTER APP (역할별 분기) =====
async function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  if (currentUser.role === 'admin') {
    document.getElementById('app-admin').classList.remove('hidden');
    document.getElementById('a-user-name').textContent = currentUser.name || '관리자';
    initAdminNav(); initAdminDashboard(); initAdminSellers(); initAdminRequests(); initAdminSuppliers(); initAdminBulkOrder();
    loadAdminDashboard();
  } else {
    document.getElementById('app-seller').classList.remove('hidden');
    document.getElementById('s-user-name').textContent = currentUser.company || currentUser.loginId;
    document.getElementById('s-user-avatar').textContent = (currentUser.company || currentUser.loginId || 'U')[0].toUpperCase();
    initSellerNav(); initSellerDashboard(); initSellerOrders(); initSellerReview();
    initSellerProducts(); initSellerApi(); initModal(); initImageUpload(); setDates();
    // Load API keys
    try {
      const d = await (await fetch(`${API}/user/load-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid }) })).json();
      if (d.keys) { localStorage.setItem('sellio_api', JSON.stringify(d.keys)); document.getElementById('s-api-vendor').value = d.keys.vendorId || ''; document.getElementById('s-api-access').value = d.keys.accessKey || ''; document.getElementById('s-api-secret').value = d.keys.secretKey || ''; document.getElementById('s-user-sub').textContent = `셀러 #${d.keys.vendorId}`; }
    } catch (e) {}
    await loadTags(); refreshSellerDashboard();
  }
  toast(`${currentUser.company || currentUser.name || currentUser.loginId}님 환영합니다!`);
}

function setDates() {
  const t = new Date().toISOString().split('T')[0], w = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
  const el = id => document.getElementById(id);
  if (el('s-order-to')) el('s-order-to').value = t;
  if (el('s-order-from')) el('s-order-from').value = w;
}

// ===== NAV =====
function initSellerNav() {
  document.querySelectorAll('#app-seller .nav-item').forEach(i => i.onclick = e => { e.preventDefault(); navTo(i.dataset.page); });
  document.querySelectorAll('#app-seller [data-goto]').forEach(b => b.onclick = () => navTo(b.dataset.goto));
}
function initAdminNav() {
  document.querySelectorAll('#app-admin .nav-item').forEach(i => i.onclick = e => { e.preventDefault(); navTo(i.dataset.page); });
}
function navTo(p) {
  const container = currentUser?.role === 'admin' ? '#app-admin' : '#app-seller';
  document.querySelectorAll(`${container} .nav-item`).forEach(n => n.classList.toggle('active', n.dataset.page === p));
  document.querySelectorAll(`${container} .page`).forEach(pg => pg.classList.toggle('active', pg.id === `page-${p}`));
}

// =============================================
//  SELLER FUNCTIONS
// =============================================

// Dashboard
function initSellerDashboard() { document.getElementById('btn-s-dash-refresh').onclick = refreshSellerDashboard; }
async function refreshSellerDashboard() {
  const k = getKeys(); if (!k) { renderSellerDash([]); return; }
  const btn = document.getElementById('btn-s-dash-refresh'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await (await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: 'ALL', createdAtFrom: new Date(Date.now() - 14 * 864e5).toISOString().split('T')[0], createdAtTo: new Date().toISOString().split('T')[0] }) })).json();
    if (d.success) { dashOrders = d.orders; renderSellerDash(d.orders); }
  } catch (e) {}
  btn.disabled = false; btn.textContent = '새로고침';
}
function renderSellerDash(ords) {
  ords = ords || [];
  const accept = ords.filter(o => o.status === 'ACCEPT').length, instruct = ords.filter(o => o.status === 'INSTRUCT'), delivering = ords.filter(o => o.status === 'DELIVERING').length;
  const delayed = instruct.filter(o => o.orderDate && (Date.now() - new Date(o.orderDate).getTime()) > 24 * 3600000);
  document.getElementById('s-accept').innerHTML = `${accept}<small>건</small>`;
  document.getElementById('s-instruct').innerHTML = `${instruct.length}<small>건</small>`;
  document.getElementById('s-delay').innerHTML = `${delayed.length}<small>건</small>`;
  document.getElementById('s-delivering').innerHTML = `${delivering}<small>건</small>`;
  if (delayed.length > 0) document.getElementById('s-delay-card').classList.add('warn'); else document.getElementById('s-delay-card').classList.remove('warn');
  const labels = { ACCEPT: '결제완료', INSTRUCT: '상품준비중', DEPARTURE: '배송지시', DELIVERING: '배송중', FINAL_DELIVERY: '배송완료' };
  const colors = { ACCEPT: 'blue', INSTRUCT: 'orange', DEPARTURE: 'blue', DELIVERING: 'blue', FINAL_DELIVERY: 'green' };
  document.getElementById('s-dash-recent').innerHTML = ords.slice(0, 8).map(o => `<tr><td><code style="font-size:12px">${o.orderId || '-'}</code></td><td style="max-width:200px">${esc(o.productName || '-')}</td><td>${esc(o.receiverName || '-')}</td><td><span class="badge ${colors[o.status] || 'gray'}">${labels[o.status] || o.status}</span></td><td>${o.orderDate ? new Date(o.orderDate).toLocaleDateString('ko') : '-'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty"><p>새로고침을 눌러주세요</p></td></tr>';
}

// Orders
function initSellerOrders() {
  document.getElementById('btn-s-fetch-orders').onclick = fetchSellerOrders;
  document.getElementById('s-order-chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; document.querySelectorAll('#s-order-chips .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); orderTypeFilter = c.dataset.t; renderSellerOrders(); };
}
async function fetchSellerOrders() {
  const k = needKeys(); if (!k) return;
  const btn = document.getElementById('btn-s-fetch-orders'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await (await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: document.getElementById('s-order-status').value, createdAtFrom: document.getElementById('s-order-from').value, createdAtTo: document.getElementById('s-order-to').value }) })).json();
    if (d.success) { orders = d.orders; renderSellerOrders(); toast(`${d.total}건`); } else toast(d.message);
  } catch (e) { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '조회';
}
function renderSellerOrders() {
  let f = orders;
  if (orderTypeFilter === 'review') f = orders.filter(o => reviewTags.has(String(o.orderId)));
  else if (orderTypeFilter === 'real') f = orders.filter(o => !reviewTags.has(String(o.orderId)));
  const labels = { ACCEPT: '결제완료', INSTRUCT: '상품준비중', DEPARTURE: '배송지시', DELIVERING: '배송중', FINAL_DELIVERY: '배송완료' };
  const colors = { ACCEPT: 'blue', INSTRUCT: 'orange', DEPARTURE: 'blue', DELIVERING: 'blue', FINAL_DELIVERY: 'green' };
  document.getElementById('s-orders-body').innerHTML = f.length ? f.map(o => {
    const isR = reviewTags.has(String(o.orderId));
    return `<tr><td><span class="badge ${isR ? 'orange' : 'green'}" style="cursor:pointer;font-size:11px" data-tog="${o.orderId}">${isR ? '체험단' : '실주문'}</span></td><td><code style="font-size:12px">${o.orderId || '-'}</code></td><td style="max-width:220px">${esc(o.productName || '-')}</td><td><span class="badge blue">${esc(o.optionName || '-')}</span></td><td>${o.quantity}</td><td>${esc(o.receiverName || '-')}</td><td>${o.orderDate ? new Date(o.orderDate).toLocaleString('ko') : '-'}</td><td><span class="badge ${colors[o.status] || 'gray'}">${labels[o.status] || o.status}</span></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="empty"><p>조회하세요</p></td></tr>';
  document.querySelectorAll('[data-tog]').forEach(b => b.onclick = async () => { const id = String(b.dataset.tog); if (reviewTags.has(id)) reviewTags.delete(id); else reviewTags.add(id); await saveTags(); renderSellerOrders(); });
}
async function loadTags() { if (!currentUser) return; try { const d = await (await fetch(`${API}/review/get-tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid }) })).json(); reviewTags = new Set((d.orderIds || []).map(String)); } catch (e) { reviewTags = new Set(); } }
async function saveTags() { if (currentUser) try { await fetch(`${API}/review/set-tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid, orderIds: [...reviewTags] }) }); } catch (e) {} }

// Review + Invoice (통합)
function initSellerReview() {
  loadSellerHistory();
  document.getElementById('btn-s-load-accept').onclick = loadAcceptOrders;
  document.getElementById('s-review-excel').onchange = onReviewExcel;
  document.getElementById('btn-s-move-instruct').onclick = moveToInstruct;
  document.getElementById('s-match-all').onchange = e => document.querySelectorAll('.s-match-cb').forEach(cb => cb.checked = e.target.checked);
  document.getElementById('s-invoice-file').onchange = onInvoiceFile;
  document.getElementById('btn-s-apply-invoice').onclick = applyInvoice;
}

async function loadSellerHistory() {
  try { const d = await (await fetch(`${API}/review/list?userId=${currentUser.uid}`)).json(); if (d.success) { document.getElementById('s-review-count').textContent = d.requests.length + '건'; const bc = s => s === '대기중' ? 'orange' : s === '완료' ? 'green' : 'blue'; document.getElementById('s-review-history').innerHTML = d.requests.length ? d.requests.map(h => `<tr><td>${esc(h.productName)}</td><td>${esc(h.keyword)}</td><td>${h.totalCount}</td><td>${h.dailyCount}</td><td><span class="badge ${bc(h.status)}">${esc(h.status)}</span></td><td>${h.createdAt ? new Date(h.createdAt).toLocaleDateString('ko') : '-'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty"><p>신청 내역 없음</p></td></tr>'; } } catch (e) {}
}

async function loadAcceptOrders() {
  const k = needKeys(); if (!k) return;
  const btn = document.getElementById('btn-s-load-accept'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await (await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: 'ACCEPT', createdAtFrom: new Date(Date.now() - 14 * 864e5).toISOString().split('T')[0], createdAtTo: new Date().toISOString().split('T')[0] }) })).json();
    if (d.success) { acceptOrders = d.orders; document.getElementById('s-accept-info').innerHTML = `<span class="badge green">결제완료 ${acceptOrders.length}건 로드됨</span>`; toast(`${acceptOrders.length}건`); }
  } catch (e) { toast('실패'); }
  btn.disabled = false; btn.textContent = '결제완료 불러오기';
}

async function onReviewExcel(e) {
  const file = e.target.files[0]; if (!file) return;
  if (!acceptOrders.length) { toast('먼저 결제완료 불러오기'); e.target.value = ''; return; }
  const fd = new FormData(); fd.append('file', file);
  try {
    const d = await (await fetch(`${API}/invoice/parse-excel`, { method: 'POST', body: fd })).json();
    if (d.success && d.data.length) {
      matchedReviewOrders = d.data.map(row => { let m = null; if (row.orderId) m = acceptOrders.find(o => String(o.orderId) === String(row.orderId)); if (!m && row.receiverName) m = acceptOrders.find(o => o.receiverName === row.receiverName); return { ...row, order: m, matched: !!m }; });
      document.getElementById('s-match-result').classList.remove('hidden');
      const matched = matchedReviewOrders.filter(r => r.matched).length;
      document.getElementById('s-match-summary').innerHTML = `매칭 <strong class="text-green">${matched}</strong>/${matchedReviewOrders.length}`;
      document.getElementById('s-match-body').innerHTML = matchedReviewOrders.map((r, i) => `<tr><td>${r.matched ? `<input type="checkbox" class="s-match-cb" data-i="${i}" checked>` : '-'}</td><td><code>${r.order?.orderId || '-'}</code></td><td>${esc(r.order?.productName || r.productName || '-')}</td><td>${esc(r.order?.receiverName || r.receiverName || '-')}</td><td><span class="badge ${r.matched ? 'green' : 'red'}">${r.matched ? 'O' : 'X'}</span></td></tr>`).join('');
    }
  } catch (e) { toast('파싱 실패'); }
  e.target.value = '';
}

async function moveToInstruct() {
  const k = needKeys(); if (!k) return;
  const checked = [...document.querySelectorAll('.s-match-cb:checked')].map(cb => parseInt(cb.dataset.i));
  const toMove = checked.map(i => matchedReviewOrders[i]).filter(r => r?.matched && r.order);
  if (!toMove.length) { toast('없음'); return; }
  const btn = document.getElementById('btn-s-move-instruct'); btn.disabled = true;
  try {
    const d = await (await fetch(`${API}/coupang/approve-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, shipmentBoxIds: toMove.map(r => r.order.shipmentBoxId) }) })).json();
    if (d.success) { toMove.forEach(r => reviewTags.add(String(r.order.orderId))); await saveTags(); toast(`${d.summary.success}건 이동`); }
  } catch (e) { toast('실패'); }
  btn.disabled = false;
}

async function onInvoiceFile(e) {
  const file = e.target.files[0]; if (!file) return;
  document.getElementById('s-inv-file-name').textContent = file.name;
  const k = needKeys(); if (!k) return;
  let instructOrders = [];
  try { const d = await (await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: 'INSTRUCT', createdAtFrom: new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0], createdAtTo: new Date().toISOString().split('T')[0] }) })).json(); if (d.success) instructOrders = d.orders; } catch (e) {}
  const fd = new FormData(); fd.append('file', file);
  try {
    const d = await (await fetch(`${API}/invoice/parse-excel`, { method: 'POST', body: fd })).json();
    if (d.success) {
      invoiceMatchData = d.data.map(row => { let m = null; if (row.orderId) m = instructOrders.find(o => String(o.orderId) === String(row.orderId)); if (!m && row.receiverName) m = instructOrders.find(o => o.receiverName === row.receiverName); return { ...row, order: m, matched: !!m }; });
      document.getElementById('s-inv-result').classList.remove('hidden');
      const mc = invoiceMatchData.filter(r => r.matched).length;
      document.getElementById('s-inv-summary').innerHTML = `<div class="invoice-summary-bar"><span>매칭 <strong class="text-green">${mc}</strong>/${invoiceMatchData.length}</span></div>`;
      document.getElementById('s-inv-body').innerHTML = invoiceMatchData.map(r => `<tr><td><code>${r.order?.orderId || '-'}</code></td><td>${esc(r.order?.productName || '-')}</td><td>${esc(r.order?.receiverName || '-')}</td><td><code>${esc(r.invoiceNumber || '-')}</code></td><td><span class="badge ${r.matched ? 'green' : 'red'}">${r.matched ? 'O' : 'X'}</span></td></tr>`).join('');
    }
  } catch (e) { toast('실패'); }
  e.target.value = '';
}

async function applyInvoice() {
  const k = needKeys(); if (!k) return;
  const matched = invoiceMatchData.filter(r => r.matched && r.order && r.invoiceNumber);
  if (!matched.length) { toast('없음'); return; }
  const btn = document.getElementById('btn-s-apply-invoice'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await (await fetch(`${API}/coupang/invoice-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, invoices: matched.map(m => ({ shipmentBoxId: m.order.shipmentBoxId, invoiceNumber: m.invoiceNumber, deliveryCompanyCode: document.getElementById('s-courier').value })) }) })).json();
    if (d.success) toast(`성공 ${d.summary.success} / 실패 ${d.summary.fail}`);
  } catch (e) { toast('실패'); }
  btn.disabled = false; btn.textContent = '쿠팡에 송장 일괄 등록';
}

// Products + Margin
function initSellerProducts() {
  document.getElementById('btn-s-fetch-products').onclick = fetchProducts;
  document.getElementById('s-product-search').oninput = renderProducts;
  document.getElementById('s-margin-close').onclick = () => document.getElementById('s-margin-card').classList.add('hidden');
  ['s-mc-sale','s-mc-cost','s-mc-shipping','s-mc-comm','s-mc-review','s-mc-other'].forEach(id => { const el = document.getElementById(id); if (el) el.oninput = calcInlineMargin; });
}
async function fetchProducts() {
  const k = needKeys(); if (!k) return;
  const btn = document.getElementById('btn-s-fetch-products'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await (await fetch(`${API}/coupang/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(k) })).json();
    if (d.success) { products = d.products; renderProducts(); toast(`${products.length}개`); } else toast(d.message);
  } catch (e) { toast('실패'); }
  btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 상품 가져오기';
}
function renderProducts() {
  const q = document.getElementById('s-product-search').value.toLowerCase();
  const f = products.filter(p => !q || p.name.toLowerCase().includes(q));
  document.getElementById('s-product-body').innerHTML = f.length ? f.map((p, i) => {
    const sale = p.salePrice || 0, comm = Math.round(sale * 0.108), est = sale - comm - 3000;
    const rate = sale > 0 ? ((est / sale) * 100).toFixed(1) : '0';
    return `<tr><td style="max-width:250px">${esc(p.name)}</td><td><span class="badge blue">${esc(p.option || '-')}</span></td><td>${sale ? sale.toLocaleString() + '원' : '-'}</td><td><span class="${parseFloat(rate) > 0 ? 'text-green' : 'text-red'}">${rate}%</span></td><td>${est > 0 ? est.toLocaleString() + '원' : '-'}</td><td><button class="btn-outline" style="padding:4px 10px;font-size:11px" data-mc="${i}">마진</button> <button class="btn-primary" style="padding:4px 10px;font-size:11px" data-ri="${i}">체험단</button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty"><p>상품 가져오기</p></td></tr>';
  document.querySelectorAll('[data-ri]').forEach(b => b.onclick = () => openModal(f[parseInt(b.dataset.ri)]));
  document.querySelectorAll('[data-mc]').forEach(b => b.onclick = () => openInlineMargin(f[parseInt(b.dataset.mc)]));
}
function openInlineMargin(p) {
  document.getElementById('s-margin-card').classList.remove('hidden');
  document.getElementById('s-margin-title').textContent = `마진: ${p.name}`;
  document.getElementById('s-mc-sale').value = p.salePrice || 0;
  document.getElementById('s-mc-cost').value = '';
  calcInlineMargin();
}
function calcInlineMargin() {
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  const sale = v('s-mc-sale'), cost = v('s-mc-cost'), ship = v('s-mc-shipping'), cr = v('s-mc-comm') || 10.8, rev = v('s-mc-review'), oth = v('s-mc-other');
  const comm = Math.round(sale * cr / 100), total = cost + ship + comm + rev + oth, profit = sale - total, rate = sale > 0 ? (profit / sale * 100).toFixed(1) : '0';
  document.getElementById('s-mc-profit').textContent = profit.toLocaleString() + '원';
  document.getElementById('s-mc-profit').className = 'mc-value ' + (profit > 0 ? 'positive' : profit < 0 ? 'negative' : '');
  document.getElementById('s-mc-rate').textContent = rate + '%';
  document.getElementById('s-mc-rate').className = 'mc-value ' + (parseFloat(rate) > 0 ? 'positive' : 'negative');
  document.getElementById('s-mc-commission').textContent = comm.toLocaleString() + '원';
  document.getElementById('s-mc-totalcost').textContent = total.toLocaleString() + '원';
}

// API Settings
function initSellerApi() {
  const s = getKeys();
  if (s) { document.getElementById('s-api-vendor').value = s.vendorId || ''; document.getElementById('s-api-access').value = s.accessKey || ''; document.getElementById('s-api-secret').value = s.secretKey || ''; }
  document.getElementById('s-toggle-eye').onclick = () => { const i = document.getElementById('s-api-secret'); i.type = i.type === 'password' ? 'text' : 'password'; };
  document.getElementById('btn-s-test-api').onclick = async () => {
    const v = document.getElementById('s-api-vendor').value.trim(), a = document.getElementById('s-api-access').value.trim(), s = document.getElementById('s-api-secret').value.trim();
    const el = document.getElementById('s-api-status');
    if (!v || !a || !s) { el.className = 'api-status error'; el.textContent = '모든 항목 입력'; el.classList.remove('hidden'); return; }
    el.className = 'api-status'; el.textContent = '테스트 중...'; el.classList.remove('hidden');
    try { const d = await (await fetch(`${API}/coupang/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendorId: v, accessKey: a, secretKey: s }) })).json(); el.className = `api-status ${d.success ? 'success' : 'error'}`; el.textContent = d.success ? '연결 성공!' : d.message; } catch (e) { el.className = 'api-status error'; el.textContent = '실패'; }
  };
  document.getElementById('btn-s-save-api').onclick = async () => {
    const v = document.getElementById('s-api-vendor').value.trim(), a = document.getElementById('s-api-access').value.trim(), s = document.getElementById('s-api-secret').value.trim();
    if (!v || !a || !s) { toast('모든 항목 입력'); return; }
    localStorage.setItem('sellio_api', JSON.stringify({ vendorId: v, accessKey: a, secretKey: s }));
    if (currentUser) try { await fetch(`${API}/user/save-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid, vendorId: v, accessKey: a, secretKey: s }) }); } catch (e) {}
    document.getElementById('s-user-sub').textContent = `셀러 #${v}`;
    toast('저장 완료');
  };
}

// Modal
function initModal() {
  document.getElementById('modal-close').onclick = () => document.getElementById('review-modal').classList.add('hidden');
  document.getElementById('review-modal').onclick = e => { if (e.target === e.currentTarget) document.getElementById('review-modal').classList.add('hidden'); };
  document.getElementById('btn-modal-submit').onclick = submitReview;
}
function openModal(p) {
  document.getElementById('modal-product-info').textContent = `${p.name} - ${p.option || ''}`;
  document.getElementById('modal-option').value = p.option || '';
  document.getElementById('modal-product-url').value = p.sellerProductId ? `https://www.coupang.com/vp/products/${p.sellerProductId}` : '';
  ['modal-keyword','modal-total','modal-daily','modal-guide'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-time').value = '상관없음';
  document.getElementById('modal-image').value = ''; document.getElementById('preview-img').src = '';
  document.getElementById('img-preview').classList.add('hidden'); document.getElementById('img-placeholder').classList.remove('hidden');
  ['modal-photo','modal-payment','modal-delivery','modal-weekend'].forEach(id => document.getElementById(id).checked = true);
  document.getElementById('review-modal').classList.remove('hidden');
}
async function submitReview() {
  const kw = document.getElementById('modal-keyword').value.trim(), tc = document.getElementById('modal-total').value, dc = document.getElementById('modal-daily').value;
  if (!kw || !tc || !dc) { toast('키워드, 총건수, 일건수 입력'); return; }
  const btn = document.getElementById('btn-modal-submit'); btn.disabled = true;
  const fd = new FormData();
  fd.append('userId', currentUser?.uid || ''); fd.append('seller', currentUser?.company || currentUser?.loginId || ''); fd.append('sellerEmail', currentUser?.emailOrder || '');
  fd.append('productName', document.getElementById('modal-product-info').textContent.split(' - ')[0]);
  fd.append('keyword', kw); fd.append('productUrl', document.getElementById('modal-product-url').value);
  fd.append('purchaseOption', document.getElementById('modal-option').value);
  fd.append('totalCount', tc); fd.append('dailyCount', dc);
  fd.append('requestTime', document.getElementById('modal-time').value || '상관없음');
  fd.append('reviewGuide', document.getElementById('modal-guide').value || '');
  fd.append('photoReview', String(document.getElementById('modal-photo').checked));
  fd.append('paymentProxy', String(document.getElementById('modal-payment').checked));
  fd.append('deliveryProxy', String(document.getElementById('modal-delivery').checked));
  fd.append('weekend', String(document.getElementById('modal-weekend').checked));
  const img = document.getElementById('modal-image').files[0]; if (img) fd.append('productImage', img);
  try {
    const d = await (await fetch(`${API}/review/apply`, { method: 'POST', body: fd })).json();
    if (d.success) { toast('신청 완료!'); document.getElementById('review-modal').classList.add('hidden'); loadSellerHistory(); copyToClipboard(formatKakao(d.request)); toast('카톡 양식 복사됨!'); } else toast(d.message);
  } catch (e) { toast('실패'); }
  btn.disabled = false; btn.textContent = '신청하기';
}

function initImageUpload() {
  const area = document.getElementById('img-area'), inp = document.getElementById('modal-image'), ph = document.getElementById('img-placeholder'), pv = document.getElementById('img-preview'), pi = document.getElementById('preview-img'), rm = document.getElementById('img-remove');
  area.onclick = e => { if (e.target !== rm && !rm.contains(e.target)) inp.click(); };
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; if (f.size > 10*1024*1024) { toast('10MB 이하'); inp.value=''; return; } const r = new FileReader(); r.onload = e => { pi.src = e.target.result; ph.classList.add('hidden'); pv.classList.remove('hidden'); }; r.readAsDataURL(f); };
  rm.onclick = e => { e.stopPropagation(); inp.value=''; pi.src=''; pv.classList.add('hidden'); ph.classList.remove('hidden'); };
}

// =============================================
//  ADMIN FUNCTIONS
// =============================================

function initAdminDashboard() { document.getElementById('btn-a-refresh').onclick = loadAdminDashboard; }
async function loadAdminDashboard() {
  try {
    const [uRes, rRes, sRes] = await Promise.all([fetch(`${API}/admin/users`), fetch(`${API}/admin/all-requests`), fetch(`${API}/admin/suppliers`)]);
    const uD = await uRes.json(), rD = await rRes.json();
    let sD = { success: true, suppliers: [] };
    try { sD = await sRes.json(); } catch (e) {}
    allUsers = uD.users || []; allRequests = rD.requests || []; allSuppliers = sD.suppliers || [];
    document.getElementById('a-total-sellers').innerHTML = `${allUsers.length}<small>명</small>`;
    const pending = allRequests.filter(r => r.status === '대기중').length;
    document.getElementById('a-pending-req').innerHTML = `${pending}<small>건</small>`;
    document.getElementById('a-total-suppliers').innerHTML = `${allSuppliers.length}<small>개</small>`;
    const today = new Date().toISOString().split('T')[0];
    const todayReq = allRequests.filter(r => r.createdAt?.startsWith(today)).length;
    document.getElementById('a-today-req').innerHTML = `${todayReq}<small>건</small>`;
  } catch (e) { toast('로드 실패'); }
}

function initAdminSellers() {}

function initAdminRequests() {
  document.getElementById('a-req-chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; document.querySelectorAll('#a-req-chips .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); adminReqFilter = c.dataset.s; renderAdminRequests(); };
  document.getElementById('btn-a-copy-kakao').onclick = async () => {
    try { const d = await (await fetch(`${API}/review/export`)).json(); if (d.success && d.text && d.count) { copyToClipboard(d.text); document.getElementById('a-kakao-preview').classList.remove('hidden'); document.getElementById('a-kakao-preview').innerHTML = `<pre>${esc(d.text)}</pre>`; toast('복사 완료!'); } else toast('대기중 없음'); } catch (e) { toast('실패'); }
  };
  document.getElementById('btn-a-mark-sent').onclick = async () => {
    const pending = allRequests.filter(r => r.status === '대기중');
    for (const rq of pending) try { await fetch(`${API}/review/update-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rq.id, status: '진행중' }) }); } catch (e) {}
    toast(`${pending.length}건 진행중 처리`);
    loadAdminDashboard(); renderAdminRequests();
  };
}

function renderAdminRequests() {
  const f = adminReqFilter === 'all' ? allRequests : allRequests.filter(r => r.status === adminReqFilter);
  const bc = s => s === '대기중' ? 'orange' : s === '완료' ? 'green' : 'blue';
  document.getElementById('a-req-body').innerHTML = f.length ? f.map(r => `<tr><td>${esc(r.seller || '-')}</td><td>${esc(r.productName || '-')}</td><td>${esc(r.keyword || '-')}</td><td>${r.totalCount || 0}</td><td>${r.dailyCount || 0}</td><td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td><td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko') : '-'}</td></tr>`).join('') : '<tr><td colspan="7" class="empty"><p>없음</p></td></tr>';

  // Also render sellers
  document.getElementById('a-sellers-body').innerHTML = allUsers.length ? allUsers.map(u => `<tr><td>${esc(u.loginId)}</td><td>${esc(u.company || '-')}</td><td>${esc(u.ceo || '-')}</td><td>${esc(u.bizNumber || '-')}</td><td>${esc(u.mobile || '-')}</td><td>${esc(u.emailOrder || '-')}</td><td>${u.vendorId || '-'}</td><td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ko') : '-'}</td></tr>`).join('') : '<tr><td colspan="8" class="empty"><p>없음</p></td></tr>';
}

// Suppliers
function initAdminSuppliers() {
  document.getElementById('btn-a-add-supplier').onclick = () => { document.getElementById('a-supplier-form').classList.remove('hidden'); clearSupplierForm(); };
  document.getElementById('a-supplier-close').onclick = () => document.getElementById('a-supplier-form').classList.add('hidden');
  document.getElementById('btn-a-save-supplier').onclick = saveSupplier;
  loadSuppliers();
}

function clearSupplierForm() {
  ['a-sup-name','a-sup-contact','a-sup-phone','a-sup-email','a-sup-account','a-sup-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('btn-a-save-supplier').dataset.editId = '';
}

async function loadSuppliers() {
  try { const d = await (await fetch(`${API}/admin/suppliers`)).json(); if (d.success) { allSuppliers = d.suppliers; renderSuppliers(); } } catch (e) {}
}
function renderSuppliers() {
  document.getElementById('a-suppliers-body').innerHTML = allSuppliers.length ? allSuppliers.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.contact || '-')}</td><td>${esc(s.phone || '-')}</td><td>${esc(s.email || '-')}</td><td style="max-width:200px">${esc(s.note || '-')}</td><td><button class="btn-outline" style="padding:4px 8px;font-size:11px" data-edit-sup="${s.id}">수정</button> <button class="btn-outline" style="padding:4px 8px;font-size:11px;color:var(--red)" data-del-sup="${s.id}">삭제</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty"><p>공급처를 추가하세요</p></td></tr>';
  document.querySelectorAll('[data-edit-sup]').forEach(b => b.onclick = () => editSupplier(b.dataset.editSup));
  document.querySelectorAll('[data-del-sup]').forEach(b => b.onclick = () => deleteSupplier(b.dataset.delSup));
}
async function saveSupplier() {
  const name = document.getElementById('a-sup-name').value.trim();
  if (!name) { toast('공급처명 입력'); return; }
  const data = { name, contact: document.getElementById('a-sup-contact').value.trim(), phone: document.getElementById('a-sup-phone').value.trim(), email: document.getElementById('a-sup-email').value.trim(), account: document.getElementById('a-sup-account').value.trim(), note: document.getElementById('a-sup-note').value.trim() };
  const editId = document.getElementById('btn-a-save-supplier').dataset.editId;
  if (editId) data.id = editId;
  try {
    const d = await (await fetch(`${API}/admin/supplier/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
    if (d.success) { toast('저장 완료'); document.getElementById('a-supplier-form').classList.add('hidden'); loadSuppliers(); loadAdminDashboard(); }
  } catch (e) { toast('실패'); }
}
function editSupplier(id) {
  const s = allSuppliers.find(x => String(x.id) === String(id)); if (!s) return;
  document.getElementById('a-supplier-form').classList.remove('hidden');
  document.getElementById('a-sup-name').value = s.name || '';
  document.getElementById('a-sup-contact').value = s.contact || '';
  document.getElementById('a-sup-phone').value = s.phone || '';
  document.getElementById('a-sup-email').value = s.email || '';
  document.getElementById('a-sup-account').value = s.account || '';
  document.getElementById('a-sup-note').value = s.note || '';
  document.getElementById('btn-a-save-supplier').dataset.editId = id;
}
async function deleteSupplier(id) {
  try { await fetch(`${API}/admin/supplier/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); toast('삭제'); loadSuppliers(); loadAdminDashboard(); } catch (e) {}
}

// Bulk Order
function initAdminBulkOrder() {
  document.getElementById('btn-a-load-pending').onclick = loadBulkPending;
  document.getElementById('btn-a-bulk-kakao').onclick = () => {
    const text = document.getElementById('a-bulk-kakao').innerText;
    if (text && !text.includes('불러오기')) { copyToClipboard(text); toast('복사 완료!'); } else toast('먼저 불러오기');
  };
  document.getElementById('a-bulk-invoice-file').onchange = onBulkInvoice;
  document.getElementById('btn-a-bulk-apply').onclick = applyBulkInvoice;
}

async function loadBulkPending() {
  try {
    const d = await (await fetch(`${API}/admin/all-requests`)).json();
    if (!d.success) return;
    const pending = d.requests.filter(r => r.status === '대기중');
    document.getElementById('a-bulk-pending').innerHTML = pending.length ? pending.map(r => `<tr><td>${esc(r.seller)}</td><td>${esc(r.productName)}</td><td>${esc(r.keyword)}</td><td>${r.totalCount}건</td><td>-</td></tr>`).join('') : '<tr><td colspan="5" class="empty"><p>대기 없음</p></td></tr>';
    // 카톡 양식
    const ed = await (await fetch(`${API}/review/export`)).json();
    if (ed.success && ed.text) { document.getElementById('a-bulk-kakao').innerHTML = `<pre>${esc(ed.text)}</pre>`; }
  } catch (e) { toast('실패'); }
}

async function onBulkInvoice(e) {
  const file = e.target.files[0]; if (!file) return;
  document.getElementById('a-bulk-inv-name').textContent = file.name;
  // TODO: 각 셀러의 API키로 주문 조회 후 매칭
  toast('일괄 송장 기능은 각 셀러의 API 키를 사용하여 매칭합니다.');
  e.target.value = '';
}

async function applyBulkInvoice() {
  toast('일괄 송장 등록 기능 준비 중');
}

// ===== UTILS =====
function formatKakao(r) {
  return `1. 구매진행시 검색할 키워드: ${r.keyword}\n2. 총 구매 건수 : ${r.totalCount}\n3. 일 진행 건수 : ${r.dailyCount}\n4. 진행 요청 시간 : ${r.requestTime}\n5. 상품주소 / 상품 이미지 : ${r.productUrl}\n6. 구매옵션 : ${r.purchaseOption || '-'}\n7. 포토제공 유 무 : ${r.photoReview}\n8. 리뷰내용 가이드 : ${r.reviewGuide || 'X'}\n9. 입금대행 Y/N : ${r.paymentProxy}\n10. 택배대행 Y/N: ${r.deliveryProxy}\n11. 주말 진행 여부 : ${r.weekend}`;
}
function toast(m) { const e = document.getElementById('toast'); document.getElementById('toast-msg').textContent = m; e.classList.remove('hidden'); clearTimeout(window._t); window._t = setTimeout(() => e.classList.add('hidden'), 3000); }
function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function copyToClipboard(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => fbCopy(t)); else fbCopy(t); }
function fbCopy(t) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); document.body.removeChild(a); }
