// ============================================
//  Sellio — Full Working App
// ============================================
const API = location.origin + '/api';

// State
let currentUser = null;
let products = [], orders = [], historyData = [];
let reviewTags = new Set();
let orderTypeFilter = 'all', historyFilter = 'all';
let acceptOrders = [], matchedReviewOrders = [], invoiceMatchData = [];
let googleClientId = null;
let dashOrders = []; // 대시보드용 주문 데이터

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // 서버에서 Google Client ID 로드
  try {
    const cfg = await (await fetch(`${API}/config`)).json();
    if (cfg.firebase?.googleClientId) googleClientId = cfg.firebase.googleClientId;
    if (googleClientId) document.getElementById('cfg-google-client-id').value = googleClientId;
  } catch (e) {}

  initLogin(); initNav(); initDashboard(); initOrders(); initReviewOrders();
  initProducts(); initInvoice(); initKakao(); initHistory(); initApiSettings();
  initModal(); initImageUpload(); initMarginCalc(); initAdmin(); setDates();
});

function setDates() {
  const t = new Date().toISOString().split('T')[0];
  const w = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
  const $ = id => document.getElementById(id);
  if ($('order-to')) $('order-to').value = t;
  if ($('order-from')) $('order-from').value = w;
}

function getKeys() { const s = localStorage.getItem('sellio_api'); return s ? JSON.parse(s) : null; }
function needKeys() {
  const k = getKeys();
  if (!k || !k.vendorId || !k.accessKey || !k.secretKey) { toast('먼저 쿠팡 API를 설정해주세요'); nav('api-settings'); return null; }
  return k;
}

// ===== LOGIN (Google Identity Services + 로컬 폴백) =====
function initLogin() {
  const saved = localStorage.getItem('sellio_user');
  if (saved) { currentUser = JSON.parse(saved); onLogin(); }

  // Google Identity Services 초기화
  if (googleClientId && window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
      auto_select: true,
    });
  }

  document.getElementById('google-login-btn').onclick = async () => {
    // Google GIS가 설정되어 있으면 Google 로그인
    if (googleClientId && window.google?.accounts?.id) {
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // 팝업이 안 뜨면 직접 팝업
          google.accounts.id.prompt();
        }
      });
      return;
    }
    // Google 설정 안 되어있으면 로컬 로그인
    currentUser = { uid: 'local_' + Date.now(), name: 'Guest', email: 'guest@sellio.kr', photo: null };
    localStorage.setItem('sellio_user', JSON.stringify(currentUser));
    onLogin();
  };

  document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('sellio_user');
    currentUser = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    if (googleClientId && window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    toast('로그아웃');
  };
}

async function handleGoogleCredential(response) {
  try {
    const r = await fetch(`${API}/auth/google-verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const d = await r.json();
    if (d.success) {
      currentUser = d.user;
      localStorage.setItem('sellio_user', JSON.stringify(currentUser));
      onLogin();
    } else {
      toast('Google 로그인 실패: ' + d.message);
    }
  } catch (e) {
    toast('서버 연결 실패');
  }
}

async function onLogin() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-avatar-circle').textContent = currentUser.name[0].toUpperCase();
  if (currentUser.photo) {
    const i = document.getElementById('user-avatar-img');
    i.src = currentUser.photo; i.classList.remove('hidden');
    document.getElementById('user-avatar-circle').classList.add('hidden');
  }

  // 서버에서 API키 로드
  try {
    const r = await fetch(`${API}/user/load-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid }) });
    const d = await r.json();
    if (d.keys) {
      localStorage.setItem('sellio_api', JSON.stringify(d.keys));
      document.getElementById('api-vendor-id').value = d.keys.vendorId || '';
      document.getElementById('api-access-key').value = d.keys.accessKey || '';
      document.getElementById('api-secret-key').value = d.keys.secretKey || '';
      document.getElementById('user-sub').textContent = `셀러 #${d.keys.vendorId}`;
    }
  } catch (e) {
    const l = getKeys();
    if (l) {
      document.getElementById('api-vendor-id').value = l.vendorId || '';
      document.getElementById('api-access-key').value = l.accessKey || '';
      document.getElementById('api-secret-key').value = l.secretKey || '';
    }
  }

  await loadTags(); await loadHistory();
  refreshDashboard();
  toast(`${currentUser.name}님 환영합니다!`);
}

// ===== NAV =====
function initNav() {
  document.querySelectorAll('.nav-item').forEach(i => i.onclick = e => { e.preventDefault(); nav(i.dataset.page); });
  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => nav(b.dataset.goto));
}
function nav(p) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === p));
  document.querySelectorAll('.page').forEach(pg => pg.classList.toggle('active', pg.id === `page-${p}`));
}

// ===== DASHBOARD (출고지연 중심) =====
function initDashboard() {
  document.getElementById('btn-dash-refresh').onclick = refreshDashboard;
}

async function refreshDashboard() {
  const k = getKeys();
  if (!k) { renderDash([]); return; }
  const btn = document.getElementById('btn-dash-refresh');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const from = new Date(Date.now() - 14 * 864e5).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    const r = await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: 'ALL', createdAtFrom: from, createdAtTo: to }) });
    const d = await r.json();
    if (d.success) { dashOrders = d.orders; renderDash(d.orders); }
  } catch (e) { console.error('대시보드 새로고침 실패:', e); }
  btn.disabled = false; btn.textContent = '주문 현황 새로고침';
}

function renderDash(allOrders) {
  const ords = allOrders || dashOrders || [];
  const accept = ords.filter(o => o.status === 'ACCEPT').length;
  const instruct = ords.filter(o => o.status === 'INSTRUCT');
  const delivering = ords.filter(o => o.status === 'DELIVERING').length;

  // 출고지연: 상품준비중 상태에서 24시간 이상 경과
  const now = Date.now();
  const delayed = instruct.filter(o => o.orderDate && (now - new Date(o.orderDate).getTime()) > 24 * 60 * 60 * 1000);

  document.getElementById('s-accept').innerHTML = `${accept}<small>건</small>`;
  document.getElementById('s-instruct').innerHTML = `${instruct.length}<small>건</small>`;
  document.getElementById('s-delay').innerHTML = `${delayed.length}<small>건</small>`;
  document.getElementById('s-delivering').innerHTML = `${delivering}<small>건</small>`;

  // 출고지연 카드 경고색
  const delayCard = document.getElementById('s-delay-card');
  if (delayed.length > 0) delayCard.classList.add('warn');
  else delayCard.classList.remove('warn');

  // 최근 주문 테이블
  const labels = { ACCEPT: '결제완료', INSTRUCT: '상품준비중', DEPARTURE: '배송지시', DELIVERING: '배송중', FINAL_DELIVERY: '배송완료' };
  const colors = { ACCEPT: 'blue', INSTRUCT: 'orange', DEPARTURE: 'blue', DELIVERING: 'blue', FINAL_DELIVERY: 'green' };
  document.getElementById('dash-recent').innerHTML = ords.slice(0, 8).map(o =>
    `<tr><td><code style="font-size:12px">${o.orderId || '-'}</code></td><td style="max-width:200px">${esc(o.productName || '-')}</td><td>${esc(o.receiverName || '-')}</td><td><span class="badge ${colors[o.status] || 'gray'}">${labels[o.status] || o.status}</span></td><td>${o.orderDate ? new Date(o.orderDate).toLocaleDateString('ko') : '-'}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="empty"><p>주문 현황 새로고침을 눌러주세요</p></td></tr>';
}

// ===== ORDERS =====
function initOrders() {
  document.getElementById('btn-fetch-orders').onclick = fetchOrders;
  document.getElementById('order-type-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#order-type-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); orderTypeFilter = c.dataset.t; renderOrders();
  };
}

async function fetchOrders() {
  const k = needKeys(); if (!k) return;
  const btn = document.getElementById('btn-fetch-orders'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 조회 중...';
  try {
    const r = await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: document.getElementById('order-status-sel').value, createdAtFrom: document.getElementById('order-from').value, createdAtTo: document.getElementById('order-to').value }) });
    const d = await r.json();
    if (d.success) { orders = d.orders; renderOrders(); toast(`${d.total}건 조회`); } else toast(d.message);
  } catch (e) { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '주문 조회';
}

function renderOrders() {
  let f = orders;
  if (orderTypeFilter === 'review') f = orders.filter(o => reviewTags.has(String(o.orderId)));
  else if (orderTypeFilter === 'real') f = orders.filter(o => !reviewTags.has(String(o.orderId)));
  const labels = { ACCEPT: '결제완료', INSTRUCT: '상품준비중', DEPARTURE: '배송지시', DELIVERING: '배송중', FINAL_DELIVERY: '배송완료' };
  const colors = { ACCEPT: 'blue', INSTRUCT: 'orange', DEPARTURE: 'blue', DELIVERING: 'blue', FINAL_DELIVERY: 'green' };

  document.getElementById('orders-body').innerHTML = f.length ? f.map(o => {
    const isR = reviewTags.has(String(o.orderId));
    return `<tr><td><span class="badge ${isR ? 'orange' : 'green'}" style="cursor:pointer;font-size:11px" data-tog="${o.orderId}">${isR ? '체험단' : '실주문'}</span></td><td><code style="font-size:12px">${o.orderId || '-'}</code></td><td style="max-width:220px">${esc(o.productName || '-')}</td><td><span class="badge blue">${esc(o.optionName || '-')}</span></td><td>${o.quantity}</td><td>${esc(o.receiverName || '-')}</td><td>${o.orderDate ? new Date(o.orderDate).toLocaleString('ko') : '-'}</td><td><span class="badge ${colors[o.status] || 'gray'}">${labels[o.status] || o.status}</span></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="empty"><p>주문 조회를 해주세요</p></td></tr>';

  document.querySelectorAll('[data-tog]').forEach(b => b.onclick = async () => {
    const id = String(b.dataset.tog);
    if (reviewTags.has(id)) reviewTags.delete(id); else reviewTags.add(id);
    await saveTags(); renderOrders();
  });
}

// Tags
async function loadTags() {
  if (!currentUser) return;
  try { const r = await fetch(`${API}/review/get-tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid }) }); const d = await r.json(); reviewTags = new Set((d.orderIds || []).map(String)); } catch (e) { reviewTags = new Set(); }
}
async function saveTags() {
  const a = [...reviewTags];
  if (currentUser) try { await fetch(`${API}/review/set-tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid, orderIds: a }) }); } catch (e) {}
}

// ===== 체험단 주문 관리 =====
function initReviewOrders() {
  document.getElementById('btn-load-accept').onclick = async () => {
    const k = needKeys(); if (!k) return;
    const btn = document.getElementById('btn-load-accept'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 불러오는 중...';
    try {
      const from = new Date(Date.now() - 14 * 864e5).toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];
      const r = await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: 'ACCEPT', createdAtFrom: from, createdAtTo: to }) });
      const d = await r.json();
      if (d.success) {
        acceptOrders = d.orders;
        document.getElementById('accept-info').innerHTML = `<div class="accept-count-bar"><span>결제완료 주문: <strong>${acceptOrders.length}건</strong></span><span class="badge blue">최근 2주</span></div><table class="tbl"><thead><tr><th>주문번호</th><th>상품명</th><th>수령인</th><th>주문일</th></tr></thead><tbody>${acceptOrders.slice(0, 10).map(o => `<tr><td><code>${o.orderId}</code></td><td>${esc(o.productName)}</td><td>${esc(o.receiverName)}</td><td>${new Date(o.orderDate).toLocaleDateString('ko')}</td></tr>`).join('')}${acceptOrders.length > 10 ? `<tr><td colspan="4" style="text-align:center;color:var(--gray-400)">...외 ${acceptOrders.length - 10}건</td></tr>` : ''}</tbody></table>`;
        toast(`결제완료 ${acceptOrders.length}건 불러옴`);
      } else toast(d.message || '실패');
    } catch (e) { toast('서버 연결 실패'); }
    btn.disabled = false; btn.textContent = '결제완료 주문 불러오기';
  };

  document.getElementById('review-excel-file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!acceptOrders.length) { toast('먼저 1단계에서 결제완료 주문을 불러와주세요'); e.target.value = ''; return; }
    const fd = new FormData(); fd.append('file', file);
    try {
      toast('엑셀 파싱 중...');
      const r = await fetch(`${API}/invoice/parse-excel`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.success && d.data.length > 0) {
        matchedReviewOrders = d.data.map(row => {
          let m = null;
          if (row.orderId) m = acceptOrders.find(o => String(o.orderId) === String(row.orderId));
          if (!m && row.receiverName && row.productName) m = acceptOrders.find(o => o.receiverName === row.receiverName && o.productName.includes(row.productName));
          if (!m && row.receiverName) m = acceptOrders.find(o => o.receiverName === row.receiverName);
          return { ...row, order: m, matched: !!m };
        });
        renderMatchResult();
        toast(`${d.data.length}건 중 ${matchedReviewOrders.filter(r => r.matched).length}건 매칭`);
      } else toast(d.message || '데이터 없음');
    } catch (e) { toast('파싱 실패'); }
    e.target.value = '';
  };

  document.getElementById('btn-move-to-instruct').onclick = moveToInstruct;
  document.getElementById('match-check-all').onchange = (e) => { document.querySelectorAll('.match-row-cb').forEach(cb => cb.checked = e.target.checked); };
}

function renderMatchResult() {
  document.getElementById('review-match-result').classList.remove('hidden');
  document.getElementById('review-upload-hint').classList.add('hidden');
  const matched = matchedReviewOrders.filter(r => r.matched).length;
  document.getElementById('match-summary').innerHTML = `매칭: <strong class="text-green">${matched}</strong> / ${matchedReviewOrders.length}건`;
  document.getElementById('match-body').innerHTML = matchedReviewOrders.map((r, i) => `<tr><td>${r.matched ? `<input type="checkbox" class="match-row-cb" data-i="${i}" checked>` : '-'}</td><td><code style="font-size:12px">${r.order?.orderId || r.orderId || '-'}</code></td><td>${esc(r.order?.productName || r.productName || '-')}</td><td>${esc(r.order?.optionName || r.option || '-')}</td><td>${esc(r.order?.receiverName || r.receiverName || '-')}</td><td>${r.order?.orderDate ? new Date(r.order.orderDate).toLocaleDateString('ko') : '-'}</td><td><span class="badge ${r.matched ? 'green' : 'red'}">${r.matched ? '매칭' : '미매칭'}</span></td></tr>`).join('');
}

async function moveToInstruct() {
  const k = needKeys(); if (!k) return;
  const checked = [...document.querySelectorAll('.match-row-cb:checked')].map(cb => parseInt(cb.dataset.i));
  const toMove = checked.map(i => matchedReviewOrders[i]).filter(r => r && r.matched && r.order);
  if (!toMove.length) { toast('이동할 주문이 없습니다'); return; }
  const btn = document.getElementById('btn-move-to-instruct'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 이동 중...';
  try {
    const r = await fetch(`${API}/coupang/approve-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, shipmentBoxIds: toMove.map(r => r.order.shipmentBoxId) }) });
    const d = await r.json();
    if (d.success) {
      const okIds = d.results.filter(x => x.success).map(x => { const m = toMove.find(t => String(t.order.shipmentBoxId) === String(x.shipmentBoxId)); return m ? String(m.order.orderId) : null; }).filter(Boolean);
      okIds.forEach(id => reviewTags.add(id));
      await saveTags();
      toast(`${d.summary.success}건 상품준비중으로 이동 (실패 ${d.summary.fail}건)`);
    } else toast(d.message || '이동 실패');
  } catch (e) { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '체험단 건 → 상품준비중 이동';
}

// ===== PRODUCTS =====
function initProducts() {
  document.getElementById('btn-fetch-products').onclick = async () => {
    const k = needKeys(); if (!k) return;
    const btn = document.getElementById('btn-fetch-products'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 가져오는 중...';
    try {
      const r = await fetch(`${API}/coupang/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(k) });
      const d = await r.json();
      if (d.success) { products = d.products; renderProducts(); toast(`${products.length}개 상품`); } else toast(d.message);
    } catch (e) { toast('서버 연결 실패'); }
    btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 상품 가져오기';
  };
  document.getElementById('product-search').oninput = renderProducts;
}

function renderProducts() {
  const q = document.getElementById('product-search').value.toLowerCase();
  const f = products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.option || '').toLowerCase().includes(q));
  document.getElementById('product-body').innerHTML = f.length ? f.map((p, i) => `<tr><td style="max-width:300px">${esc(p.name)}</td><td><code style="font-size:12px">${p.optionId || p.vendorItemId || '-'}</code></td><td><span class="badge blue">${esc(p.option || '-')}</span></td><td>${p.salePrice ? p.salePrice.toLocaleString() + '원' : '-'}</td><td><button class="btn-primary" style="padding:6px 14px;font-size:12px" data-ri="${i}">체험단 신청</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty"><p>상품 가져오기를 눌러주세요</p></td></tr>';
  document.querySelectorAll('[data-ri]').forEach(b => b.onclick = () => openModal(f[parseInt(b.dataset.ri)]));
}

// ===== INVOICE =====
function initInvoice() {
  document.getElementById('invoice-file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    document.getElementById('inv-file-name').textContent = file.name;
    const k = needKeys(); if (!k) return;
    toast('주문 조회 + 엑셀 파싱 중...');
    let instructOrders = [];
    try {
      const from = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0], to = new Date().toISOString().split('T')[0];
      const r = await fetch(`${API}/coupang/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, status: 'INSTRUCT', createdAtFrom: from, createdAtTo: to }) });
      const d = await r.json(); if (d.success) instructOrders = d.orders;
    } catch (e) {}
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch(`${API}/invoice/parse-excel`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.success) {
        invoiceMatchData = d.data.map(row => { let m = null; if (row.orderId) m = instructOrders.find(o => String(o.orderId) === String(row.orderId)); if (!m && row.receiverName) m = instructOrders.find(o => o.receiverName === row.receiverName); return { ...row, order: m, matched: !!m }; });
        renderInvoiceResult();
        toast(`${invoiceMatchData.filter(r => r.matched).length}/${invoiceMatchData.length}건 매칭`);
      } else toast(d.message || '파싱 실패');
    } catch (e) { toast('파싱 실패'); }
    e.target.value = '';
  };

  document.getElementById('btn-apply-invoice').onclick = async () => {
    const k = needKeys(); if (!k) return;
    const matched = invoiceMatchData.filter(r => r.matched && r.order && r.invoiceNumber);
    if (!matched.length) { toast('매칭된 송장 없음'); return; }
    const courier = document.getElementById('courier-sel').value;
    const btn = document.getElementById('btn-apply-invoice'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 등록 중...';
    try {
      const r = await fetch(`${API}/coupang/invoice-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, invoices: matched.map(m => ({ shipmentBoxId: m.order.shipmentBoxId, invoiceNumber: m.invoiceNumber, deliveryCompanyCode: courier })) }) });
      const d = await r.json();
      if (d.success) toast(`송장 등록 완료! 성공 ${d.summary.success} / 실패 ${d.summary.fail}`);
    } catch (e) { toast('서버 연결 실패'); }
    btn.disabled = false; btn.textContent = '쿠팡에 송장 일괄 등록';
  };
}

function renderInvoiceResult() {
  document.getElementById('inv-upload-zone').classList.add('hidden');
  document.getElementById('inv-result').classList.remove('hidden');
  const m = invoiceMatchData.filter(r => r.matched).length;
  document.getElementById('inv-summary').innerHTML = `<div class="invoice-summary-bar"><span>총 <strong>${invoiceMatchData.length}</strong>건 | 매칭 <strong class="text-green">${m}</strong> | 미매칭 <strong class="text-red">${invoiceMatchData.length - m}</strong></span></div>`;
  document.getElementById('inv-body').innerHTML = invoiceMatchData.map(r => `<tr><td><code style="font-size:12px">${r.order?.orderId || r.orderId || '-'}</code></td><td>${esc(r.order?.productName || r.productName || '-')}</td><td>${esc(r.order?.receiverName || r.receiverName || '-')}</td><td><code>${esc(r.invoiceNumber || '-')}</code></td><td><span class="badge ${r.matched ? 'green' : 'red'}">${r.matched ? '매칭' : '미매칭'}</span></td></tr>`).join('');
}

// ===== KAKAO EXPORT (카톡 양식) =====
let exportText = '', exportReqs = [];
function initKakao() {
  document.getElementById('btn-load-export').onclick = async () => {
    try {
      const url = currentUser ? `${API}/review/export?userId=${currentUser.uid}` : `${API}/review/export`;
      const r = await (await fetch(url)).json();
      if (r.success) {
        exportText = r.text; exportReqs = r.requests;
        document.getElementById('kakao-preview').innerHTML = exportReqs.length ? `<pre class="kakao-text">${esc(exportText)}</pre>` : '<p class="empty-text">대기중 신청 없음</p>';
        toast(`${r.count}건`);
      }
    } catch (e) { toast('서버 연결 실패'); }
  };

  document.getElementById('btn-copy-kakao').onclick = () => {
    if (!exportText) { toast('먼저 불러오기'); return; }
    copyToClipboard(exportText);
    toast('클립보드 복사 완료! 카톡에 붙여넣기 하세요');
  };

  document.getElementById('btn-mark-sent').onclick = async () => {
    if (!exportReqs.length) { toast('없음'); return; }
    for (const rq of exportReqs) try { await fetch(`${API}/review/update-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rq.id, status: '진행중' }) }); } catch (e) {}
    toast(`${exportReqs.length}건 진행중 처리`); exportReqs = []; exportText = '';
    document.getElementById('kakao-preview').innerHTML = '<p class="empty-text">전달 완료</p>';
    await loadHistory();
  };
}

// ===== HISTORY =====
function initHistory() {
  document.getElementById('history-chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; document.querySelectorAll('#history-chips .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); historyFilter = c.dataset.s; renderHistory(); };
}
async function loadHistory() {
  try { const url = currentUser ? `${API}/review/list?userId=${currentUser.uid}` : `${API}/review/list`; const d = await (await fetch(url)).json(); if (d.success) historyData = d.requests; } catch (e) { historyData = []; }
  renderHistory();
}
function renderHistory() {
  const f = historyFilter === 'all' ? historyData : historyData.filter(h => h.status === historyFilter);
  const bc = s => s === '대기중' ? 'orange' : s === '완료' ? 'green' : 'blue';
  document.getElementById('history-body').innerHTML = f.length ? f.map(h => `<tr><td>${esc(h.productName || '-')}</td><td>${esc(h.keyword || '-')}</td><td>${h.totalCount || 0}건</td><td><span class="badge ${bc(h.status)}">${esc(h.status)}</span></td><td>${h.createdAt ? new Date(h.createdAt).toLocaleDateString('ko') : '-'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty"><p>없음</p></td></tr>';
}

// ===== API SETTINGS =====
function initApiSettings() {
  const s = getKeys();
  if (s) { document.getElementById('api-vendor-id').value = s.vendorId || ''; document.getElementById('api-access-key').value = s.accessKey || ''; document.getElementById('api-secret-key').value = s.secretKey || ''; }
  document.getElementById('toggle-eye').onclick = () => { const i = document.getElementById('api-secret-key'); i.type = i.type === 'password' ? 'text' : 'password'; };

  document.getElementById('btn-test-api').onclick = async () => {
    const v = document.getElementById('api-vendor-id').value.trim(), a = document.getElementById('api-access-key').value.trim(), s = document.getElementById('api-secret-key').value.trim();
    const el = document.getElementById('api-status');
    if (!v || !a || !s) { el.className = 'api-status error'; el.textContent = '모든 항목 입력 필요'; el.classList.remove('hidden'); return; }
    el.className = 'api-status'; el.textContent = '테스트 중...'; el.classList.remove('hidden');
    try {
      const r = await fetch(`${API}/coupang/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendorId: v, accessKey: a, secretKey: s }) });
      const d = await r.json();
      el.className = `api-status ${d.success ? 'success' : 'error'}`; el.textContent = d.success ? `연결 성공! Vendor: ${v}` : d.message;
    } catch (e) { el.className = 'api-status error'; el.textContent = '서버 연결 실패'; }
  };

  document.getElementById('btn-save-api').onclick = async () => {
    const v = document.getElementById('api-vendor-id').value.trim(), a = document.getElementById('api-access-key').value.trim(), s = document.getElementById('api-secret-key').value.trim();
    if (!v || !a || !s) { toast('모든 항목 입력'); return; }
    const keys = { vendorId: v, accessKey: a, secretKey: s };
    localStorage.setItem('sellio_api', JSON.stringify(keys));
    if (currentUser) { try { await fetch(`${API}/user/save-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.uid, ...keys }) }); } catch (e) {} document.getElementById('user-sub').textContent = `셀러 #${v}`; }
    toast('API 설정 저장 완료');
  };

  // Google 설정 저장
  document.getElementById('btn-save-google-cfg').onclick = async () => {
    const clientId = document.getElementById('cfg-google-client-id').value.trim();
    const el = document.getElementById('google-cfg-status');
    try {
      await fetch(`${API}/config/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firebase: { googleClientId: clientId } }) });
      el.className = 'api-status success'; el.textContent = clientId ? 'Google 로그인 설정 저장 완료! 새로고침하면 적용됩니다.' : '초기화됨 (로컬 로그인 모드)';
      el.classList.remove('hidden');
      googleClientId = clientId;
    } catch (e) { el.className = 'api-status error'; el.textContent = '저장 실패'; el.classList.remove('hidden'); }
  };
}

// ===== ADMIN (셀러 관리) =====
function initAdmin() {
  document.getElementById('btn-admin-refresh').onclick = loadAdmin;
  document.getElementById('btn-admin-kakao').onclick = async () => {
    try {
      const r = await (await fetch(`${API}/review/export`)).json();
      if (r.success && r.text) { copyToClipboard(r.text); toast('전체 대기 신청 카톡 양식 복사 완료!'); }
      else toast('대기중 신청 없음');
    } catch (e) { toast('서버 연결 실패'); }
  };
}

async function loadAdmin() {
  try {
    const [uRes, rRes] = await Promise.all([fetch(`${API}/admin/users`), fetch(`${API}/admin/all-requests`)]);
    const uData = await uRes.json(), rData = await rRes.json();

    if (uData.success) {
      document.getElementById('admin-user-count').textContent = `${uData.total}명`;
      document.getElementById('admin-users-body').innerHTML = uData.users.length ? uData.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.vendorId || '<span class="badge gray">미등록</span>'}</td><td><span class="badge ${u.hasApiKeys ? 'green' : 'red'}">${u.hasApiKeys ? '연동' : '미연동'}</span></td><td>${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('ko') : '-'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty"><p>등록된 셀러 없음</p></td></tr>';
    }

    if (rData.success) {
      const pending = rData.requests.filter(r => r.status === '대기중').length;
      document.getElementById('admin-req-count').textContent = `대기 ${pending}건 / 전체 ${rData.total}건`;
      const bc = s => s === '대기중' ? 'orange' : s === '완료' ? 'green' : 'blue';
      document.getElementById('admin-req-body').innerHTML = rData.requests.length ? rData.requests.map(r => `<tr><td>${esc(r.seller || '-')}</td><td>${esc(r.productName || '-')}</td><td>${esc(r.keyword || '-')}</td><td>${r.totalCount || 0}건</td><td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td><td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko') : '-'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty"><p>신청 없음</p></td></tr>';
    }
  } catch (e) { toast('데이터 로드 실패'); }
}

// ===== MODAL =====
function initModal() {
  document.getElementById('modal-close').onclick = () => document.getElementById('review-modal').classList.add('hidden');
  document.getElementById('review-modal').onclick = e => { if (e.target === e.currentTarget) document.getElementById('review-modal').classList.add('hidden'); };
  document.getElementById('btn-modal-submit').onclick = submitReview;
}

function openModal(p) {
  document.getElementById('modal-product-info').textContent = `${p.name} - ${p.option || ''}`;
  document.getElementById('modal-option').value = p.option || '';
  document.getElementById('modal-product-url').value = p.sellerProductId ? `https://www.coupang.com/vp/products/${p.sellerProductId}` : '';
  ['modal-keyword', 'modal-total', 'modal-daily', 'modal-guide'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-time').value = '상관없음';
  document.getElementById('modal-image').value = '';
  document.getElementById('preview-img').src = '';
  document.getElementById('img-preview').classList.add('hidden');
  document.getElementById('img-placeholder').classList.remove('hidden');
  ['modal-photo', 'modal-payment', 'modal-delivery', 'modal-weekend'].forEach(id => document.getElementById(id).checked = true);
  document.getElementById('review-modal').classList.remove('hidden');
}

async function submitReview() {
  const kw = document.getElementById('modal-keyword').value.trim(), tc = document.getElementById('modal-total').value, dc = document.getElementById('modal-daily').value;
  if (!kw || !tc || !dc) { toast('필수 항목 입력 (키워드, 총건수, 일건수)'); return; }
  const btn = document.getElementById('btn-modal-submit'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

  const fd = new FormData();
  fd.append('userId', currentUser?.uid || ''); fd.append('seller', currentUser?.name || ''); fd.append('sellerEmail', currentUser?.email || '');
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
    if (d.success) {
      toast('체험단 신청 완료!');
      document.getElementById('review-modal').classList.add('hidden');
      await loadHistory();
      // 카톡 양식 자동 복사
      const kakaoText = formatKakaoSingle(d.request);
      copyToClipboard(kakaoText);
      toast('카톡 양식이 클립보드에 복사되었습니다!');
    } else toast(d.message);
  } catch (e) { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '신청하기';
}

// 개별 신청 카톡 양식 생성
function formatKakaoSingle(r) {
  return `1. 구매진행시 검색할 키워드: ${r.keyword}
2. 총 구매 건수 : ${r.totalCount}
3. 일 진행 건수 : ${r.dailyCount}
4. 진행 요청 시간 : ${r.requestTime}
5. 상품주소 / 상품 이미지 : ${r.productUrl}
6. 구매옵션 : ${r.purchaseOption || '-'}
7. 포토제공 유 무 : ${r.photoReview}
8. 리뷰내용 가이드 : ${r.reviewGuide || 'X'}
9. 입금대행 Y/N : ${r.paymentProxy}
10. 택배대행 Y/N: ${r.deliveryProxy}
11. 주말 진행 여부 : ${r.weekend}`;
}

// ===== IMAGE =====
function initImageUpload() {
  const area = document.getElementById('img-area'), inp = document.getElementById('modal-image'), ph = document.getElementById('img-placeholder'), pv = document.getElementById('img-preview'), pi = document.getElementById('preview-img'), rm = document.getElementById('img-remove');
  area.onclick = e => { if (e.target !== rm && !rm.contains(e.target)) inp.click(); };
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) { toast('10MB 이하만'); inp.value = ''; return; } const r = new FileReader(); r.onload = e => { pi.src = e.target.result; ph.classList.add('hidden'); pv.classList.remove('hidden'); }; r.readAsDataURL(f); };
  rm.onclick = e => { e.stopPropagation(); inp.value = ''; pi.src = ''; pv.classList.add('hidden'); ph.classList.remove('hidden'); };
}

// ===== MARGIN CALCULATOR =====
function initMarginCalc() {
  ['mc-sale', 'mc-cost', 'mc-shipping', 'mc-commission', 'mc-review', 'mc-other', 'mc-qty'].forEach(id => {
    const el = document.getElementById(id); if (el) el.oninput = calcMargin;
  });
  calcMargin();
}

function calcMargin() {
  const val = id => parseFloat(document.getElementById(id)?.value) || 0;
  const sale = val('mc-sale'), cost = val('mc-cost'), shipping = val('mc-shipping');
  const commRate = val('mc-commission') || 10.8, reviewCost = val('mc-review'), other = val('mc-other');
  const qty = parseInt(document.getElementById('mc-qty')?.value) || 1;
  const commission = Math.round(sale * commRate / 100);
  const totalCost = cost + shipping + commission + reviewCost + other;
  const profit = sale - totalCost;
  const marginRate = sale > 0 ? (profit / sale * 100) : 0;

  document.getElementById('mc-r-sale').textContent = sale.toLocaleString() + '원';
  document.getElementById('mc-r-cost').textContent = cost.toLocaleString() + '원';
  document.getElementById('mc-r-shipping').textContent = shipping.toLocaleString() + '원';
  document.getElementById('mc-r-commission').textContent = commission.toLocaleString() + '원 (' + commRate + '%)';
  document.getElementById('mc-r-review').textContent = reviewCost.toLocaleString() + '원';
  document.getElementById('mc-r-other').textContent = other.toLocaleString() + '원';
  document.getElementById('mc-r-totalcost').textContent = totalCost.toLocaleString() + '원';

  const profitEl = document.getElementById('mc-r-profit'), rateEl = document.getElementById('mc-r-rate');
  profitEl.textContent = profit.toLocaleString() + '원';
  rateEl.textContent = marginRate.toFixed(1) + '%';
  profitEl.className = 'mc-value ' + (profit > 0 ? 'positive' : profit < 0 ? 'negative' : '');
  rateEl.className = 'mc-value ' + (marginRate > 0 ? 'positive' : marginRate < 0 ? 'negative' : '');

  document.getElementById('mc-r-qty').textContent = qty + '개';
  document.getElementById('mc-r-total-revenue').textContent = (sale * qty).toLocaleString() + '원';
  document.getElementById('mc-r-total-cost').textContent = (totalCost * qty).toLocaleString() + '원';
  const tpEl = document.getElementById('mc-r-total-profit');
  const totalProfit = profit * qty;
  tpEl.textContent = totalProfit.toLocaleString() + '원';
  tpEl.className = 'mc-value ' + (totalProfit > 0 ? 'positive' : totalProfit < 0 ? 'negative' : '');

  const bar = document.getElementById('mc-bar-fill');
  if (bar) { const w = Math.max(0, Math.min(100, marginRate)); bar.style.width = w + '%'; bar.className = 'mc-bar-fill ' + (marginRate >= 20 ? 'high' : marginRate >= 10 ? 'mid' : 'low'); }
}

// ===== UTILS =====
function toast(m) { const e = document.getElementById('toast'); document.getElementById('toast-msg').textContent = m; e.classList.remove('hidden'); clearTimeout(window._t); window._t = setTimeout(() => e.classList.add('hidden'), 3000); }
function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function copyToClipboard(text) {
  if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); }
  else fallbackCopy(text);
}
function fallbackCopy(text) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
