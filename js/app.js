// ============================================
//  Sellio — 최종 통합 버전
// ============================================
const API = location.origin + '/api';
let currentUser = null, products = [], orders = [], reviewTags = new Set();
let orderTypeFilter = 'all', suppliers = [], mappings = [];
let allRequests = [], allUsers = [], allSuppliers = [], allMappings = [];
let adminReqFilter = 'all', modalProduct = null;

document.addEventListener('DOMContentLoaded', () => initAuth());

function getKeys() { const s = localStorage.getItem('sellio_api'); return s ? JSON.parse(s) : null; }
function needKeys() { const k = getKeys(); if (!k?.vendorId || !k?.accessKey || !k?.secretKey) { toast('먼저 API를 설정해주세요'); navTo('s-settings'); return null; } return k; }

// ========================================
//  AUTH
// ========================================
function initAuth() {
  const saved = localStorage.getItem('sellio_user');
  if (saved) { currentUser = JSON.parse(saved); enterApp(); }
  // 로그인 탭
  document.querySelectorAll('.login-tab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $('login-role').value = tab.dataset.role;
  });
  $('goto-register').onclick = e => { e.preventDefault(); $('login-card').classList.add('hidden'); $('register-card').classList.remove('hidden'); };
  $('goto-login').onclick = e => { e.preventDefault(); $('register-card').classList.add('hidden'); $('login-card').classList.remove('hidden'); };
  $('btn-login').onclick = doLogin;
  $('login-pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  $('login-id').onkeydown = e => { if (e.key === 'Enter') $('login-pw').focus(); };
  $('btn-register').onclick = doRegister;
  document.querySelectorAll('.logout-btn').forEach(b => b.onclick = doLogout);
}

async function doLogin() {
  const id = $('login-id').value.trim(), pw = $('login-pw').value, role = $('login-role').value;
  if (!id || !pw) return toast('아이디와 비밀번호를 입력하세요');
  const btn = $('btn-login'); btn.disabled = true; btn.textContent = '로그인 중...';
  try {
    const d = await post('/auth/login', { loginId: id, password: pw, role });
    if (d.success) { currentUser = d.user; localStorage.setItem('sellio_user', JSON.stringify(currentUser)); enterApp(); }
    else toast(d.message || '로그인 실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '로그인';
}

async function doRegister() {
  const v = id => $(id).value.trim();
  const role = document.querySelector('input[name="reg-role"]:checked')?.value || 'seller';
  const data = { loginId: v('reg-id'), password: v('reg-pw'), password2: v('reg-pw2'), company: v('reg-company'), ceo: v('reg-ceo'), mobile: v('reg-mobile'), email: v('reg-email'), role };
  if (!data.loginId) return toast('아이디 입력');
  if (!data.password) return toast('비밀번호 입력');
  if (data.password !== data.password2) return toast('비밀번호 불일치');
  if (!data.company) return toast('회사명 입력');
  if (!data.mobile) return toast('휴대폰 입력');
  if (!data.email) return toast('이메일 입력');
  const btn = $('btn-register'); btn.disabled = true; btn.textContent = '가입 중...';
  try {
    const d = await post('/auth/register', data);
    if (d.success) { toast('회원가입 완료!'); $('register-card').classList.add('hidden'); $('login-card').classList.remove('hidden'); $('login-id').value = data.loginId; }
    else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '가입하기';
}

function doLogout() {
  localStorage.removeItem('sellio_user'); localStorage.removeItem('sellio_api'); currentUser = null;
  $('login-screen').classList.remove('hidden'); $('app-seller').classList.add('hidden'); $('app-admin').classList.add('hidden');
  $('login-card').classList.remove('hidden'); $('register-card').classList.add('hidden');
  toast('로그아웃');
}

// ========================================
//  ENTER APP
// ========================================
async function enterApp() {
  $('login-screen').classList.add('hidden');
  if (currentUser.role === 'admin') {
    $('app-admin').classList.remove('hidden');
    $('a-name').textContent = currentUser.company || '관리자';
    initAdminNav(); initAdminDash(); initAdminPO(); initAdminInvoice(); initAdminReview(); initAdminRvInvoice();
    loadAdminDash();
  } else {
    $('app-seller').classList.remove('hidden');
    $('s-name').textContent = currentUser.company || currentUser.loginId;
    $('s-avatar').textContent = (currentUser.company || currentUser.loginId || 'U')[0].toUpperCase();
    $('s-sub').textContent = '셀러';
    initSellerNav(); initProducts(); initReview(); initOrders(); initSettings(); initModal();
    setDates();
    try {
      const d = await post('/user/load-keys', { userId: currentUser.uid });
      if (d.keys) { localStorage.setItem('sellio_api', JSON.stringify(d.keys)); $('s-vid').value = d.keys.vendorId||''; $('s-ak').value = d.keys.accessKey||''; $('s-sk').value = d.keys.secretKey||''; $('s-sub').textContent = `셀러 #${d.keys.vendorId}`; }
    } catch {}
    await loadTags(); await loadSuppliers(); await loadMappings();
  }
  toast(`${currentUser.company || currentUser.loginId}님 환영합니다!`);
}

function setDates() {
  const t = new Date().toISOString().split('T')[0], w = new Date(Date.now()-7*864e5).toISOString().split('T')[0];
  if ($('s-to')) $('s-to').value = t;
  if ($('s-from')) $('s-from').value = w;
  if ($('s-rvinv-date')) $('s-rvinv-date').value = t;
}

// ========================================
//  NAV + TABS
// ========================================
function initSellerNav() {
  document.querySelectorAll('#app-seller .nav-item').forEach(i => i.onclick = e => { e.preventDefault(); navTo(i.dataset.page); });
  // 서브탭 이벤트
  document.querySelectorAll('.sub-tab').forEach(tab => tab.onclick = () => {
    const parent = tab.closest('section');
    parent.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const tabId = tab.dataset.tab;
    parent.querySelectorAll('[id^="tab-"]').forEach(div => div.classList.toggle('hidden', div.id !== `tab-${tabId}`));
  });
}
function initAdminNav() { document.querySelectorAll('#app-admin .nav-item').forEach(i => i.onclick = e => { e.preventDefault(); navTo(i.dataset.page); }); }
function navTo(p) {
  const c = currentUser?.role === 'admin' ? '#app-admin' : '#app-seller';
  document.querySelectorAll(`${c} .nav-item`).forEach(n => n.classList.toggle('active', n.dataset.page === p));
  document.querySelectorAll(`${c} .page`).forEach(pg => pg.classList.toggle('active', pg.id === `page-${p}`));
}

// ========================================
//  SELLER: 상품관리 (매핑 + 체험단 버튼)
// ========================================
function initProducts() {
  $('btn-s-fetch').onclick = fetchProducts;
  $('btn-s-collect').onclick = collectAccept;
  $('s-search').oninput = renderProducts;
}

async function fetchProducts() {
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-fetch'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 로딩...';
  try {
    const d = await post('/coupang/products', k);
    if (d.success) { products = d.products; renderProducts(); toast(`${products.length}개 상품`); } else toast(d.message);
  } catch { toast('실패'); }
  btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 상품 가져오기';
}

async function collectAccept() {
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-collect'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await post('/coupang/orders', { ...k, status: 'ACCEPT', createdAtFrom: new Date(Date.now()-14*864e5).toISOString().split('T')[0], createdAtTo: new Date().toISOString().split('T')[0] });
    if (d.success && d.orders.length) {
      $('s-accept-card').classList.remove('hidden');
      $('s-accept-count').textContent = `${d.orders.length}건`;
      $('s-accept-body').innerHTML = d.orders.map(o => `<tr><td><code>${o.orderId}</code></td><td>${esc(o.productName)}</td><td>${esc(o.optionName||'-')}</td><td>${o.quantity}</td><td>${esc(o.receiverName)}</td><td>${o.orderDate?new Date(o.orderDate).toLocaleDateString('ko'):'-'}</td></tr>`).join('');
      toast(`결제완료 ${d.orders.length}건`);
    } else { toast('결제완료 주문 없음'); }
  } catch { toast('실패'); }
  btn.disabled = false; btn.textContent = '결제완료주문 수합';
}

function renderProducts() {
  const q = ($('s-search').value||'').toLowerCase();
  const f = products.filter(p => !q || (p.name||'').toLowerCase().includes(q) || (p.option||'').toLowerCase().includes(q));
  $('s-prod-count').textContent = `${f.length}개`;
  const supOpts = suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('s-prod-body').innerHTML = f.length ? f.map((p,i) => {
    const pid = String(p.vendorItemId||p.sellerProductId);
    const map = mappings.find(m => m.productId === pid);
    const isActive = map ? map.active !== false : false;
    return `<tr>
      <td style="text-align:center;color:var(--gray-500)">${i+1}</td>
      <td style="max-width:260px">${esc(p.name)}</td>
      <td><code style="font-size:12px;color:var(--blue)">${p.vendorItemId||p.optionId||'-'}</code></td>
      <td><span class="badge blue">${esc(p.option||'-')}</span></td>
      <td style="text-align:center"><label class="switch"><input type="checkbox" ${isActive?'checked':''} data-toggle="${pid}" data-pname="${esc(p.name)}" data-opt="${esc(p.option||'')}" data-oid="${p.optionId||''}" data-sale="${p.salePrice||0}"><span class="switch-slider"></span></label></td>
      <td><select class="input-sm mapping-select" data-map="${pid}" style="width:100%"><option value="">선택</option>${supOpts}</select></td>
      <td><input type="number" class="input-sm mapping-cost" data-cost="${pid}" placeholder="원가" style="width:80px" value="${map?.costPrice||''}"></td>
      <td style="text-align:center"><button class="btn-primary" style="padding:4px 10px;font-size:11px" data-rv="${i}">체험단</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty"><p>상품 가져오기를 눌러주세요</p></td></tr>';

  // 기존 매핑값 세팅
  f.forEach(p => { const pid = String(p.vendorItemId||p.sellerProductId); const map = mappings.find(m => m.productId===pid); if (map?.supplierId) { const sel = document.querySelector(`[data-map="${pid}"]`); if (sel) sel.value = String(map.supplierId); } });

  // 이벤트 바인딩
  document.querySelectorAll('[data-toggle]').forEach(cb => cb.onchange = async () => {
    const pid = cb.dataset.toggle, map = mappings.find(m => m.productId===pid);
    if (map) { await post('/mapping/toggle', { userId: currentUser.uid, productId: pid, active: cb.checked }); map.active = cb.checked; }
    else { await post('/mapping/save', { userId: currentUser.uid, productId: pid, productName: cb.dataset.pname, optionId: cb.dataset.oid, option: cb.dataset.opt, salePrice: cb.dataset.sale, active: cb.checked }); await loadMappings(); }
  });
  document.querySelectorAll('.mapping-select').forEach(sel => sel.onchange = async () => {
    const pid = sel.dataset.map, p = products.find(x => String(x.vendorItemId||x.sellerProductId)===pid);
    if (!p) return;
    const sup = suppliers.find(s => String(s.id)===sel.value), costEl = document.querySelector(`[data-cost="${pid}"]`);
    await post('/mapping/save', { userId: currentUser.uid, productId: pid, productName: p.name, optionId: p.optionId||'', option: p.option||'', salePrice: p.salePrice||0, supplierId: sel.value, supplierName: sup?.name||'', costPrice: costEl?.value||0, active: true });
    await loadMappings(); toast('매핑 저장');
  });
  document.querySelectorAll('.mapping-cost').forEach(inp => inp.onblur = async () => {
    const pid = inp.dataset.cost, map = mappings.find(m => m.productId===pid);
    if (map) { await post('/mapping/save', { ...map, userId: currentUser.uid, costPrice: inp.value }); await loadMappings(); }
  });
  // 체험단 버튼
  document.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => openModal(f[parseInt(b.dataset.rv)]));
  $('s-prod-footer').innerHTML = f.length ? `<span>총 ${f.length}개 / 활성 ${mappings.filter(m=>m.active!==false).length}개 / 매핑 ${mappings.filter(m=>m.active!==false&&m.supplierId).length}개</span>` : '';
}

async function loadSuppliers() { try { const d = await get('/suppliers'); if (d.success) suppliers = d.suppliers||[]; } catch {} }
async function loadMappings() { if (!currentUser) return; try { const d = await get(`/mappings?userId=${currentUser.uid}`); if (d.success) mappings = d.mappings||[]; } catch {} }

// ========================================
//  SELLER: 체험단 모달
// ========================================
function initModal() {
  $('rv-close').onclick = () => $('rv-modal').classList.add('hidden');
  $('rv-modal').onclick = e => { if (e.target===e.currentTarget) $('rv-modal').classList.add('hidden'); };
  $('btn-rv-submit').onclick = submitReview;
}
function openModal(p) {
  modalProduct = p;
  $('rv-info').textContent = `${p.name} ${p.option?'- '+p.option:''}`;
  $('rv-opt').value = p.option||'';
  $('rv-url').value = p.sellerProductId ? `https://www.coupang.com/vp/products/${p.sellerProductId}` : '';
  $('rv-kw').value = ''; $('rv-total').value = ''; $('rv-daily').value = '';
  $('rv-time').value = '상관없음'; $('rv-guide').value = '';
  ['rv-photo','rv-pay','rv-deliv','rv-wknd'].forEach(id => $(id).checked = true);
  $('rv-modal').classList.remove('hidden');
}
async function submitReview() {
  const kw = $('rv-kw').value.trim(), tc = $('rv-total').value, dc = $('rv-daily').value;
  if (!kw) return toast('키워드 입력'); if (!tc||!dc) return toast('건수 입력');
  const btn = $('btn-rv-submit'); btn.disabled = true; btn.textContent = '신청 중...';
  const body = {
    userId: currentUser.uid, seller: currentUser.company||currentUser.loginId,
    sellerEmail: currentUser.email||'', productName: modalProduct?.name||'',
    keyword: kw, productUrl: $('rv-url').value, purchaseOption: $('rv-opt').value,
    totalCount: tc, dailyCount: dc, requestTime: $('rv-time').value||'상관없음',
    reviewGuide: $('rv-guide').value||'', photoReview: $('rv-photo').checked,
    paymentProxy: $('rv-pay').checked, deliveryProxy: $('rv-deliv').checked,
    weekend: $('rv-wknd').checked
  };
  try {
    const d = await post('/review/apply', body);
    if (d.success) { toast('체험단 신청 완료!'); $('rv-modal').classList.add('hidden'); loadReviewHistory('all'); }
    else toast(d.message||'실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '신청하기';
}

// ========================================
//  SELLER: 체험단 (통합: 내역 + 송장)
// ========================================
function initReview() {
  $('s-rvh-chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; document.querySelectorAll('#s-rvh-chips .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); loadReviewHistory(c.dataset.s); };
  loadReviewHistory('all');
  // 송장 업데이트
  $('s-rvinv-file').onchange = onRvInvFile;
  $('btn-s-rvinv-match').onclick = matchRvInv;
  $('btn-s-rvinv-apply').onclick = applyRvInv;
  $('btn-s-rvinv-template').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet([['주문번호','품명','주문자이름','연락가능한번호','배송지주소','송장번호'],['6100175341443','광부사과5kg','권영철','010-8167-8040','울산북구수동1길2','8026030432606']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '송장');
    XLSX.writeFile(wb, `체험단_송장_템플릿_${new Date().toISOString().split('T')[0]}.xlsx`); toast('템플릿 다운로드');
  };
}
async function loadReviewHistory(filter) {
  if (!currentUser) return;
  try {
    const d = await get(`/review/list?userId=${currentUser.uid}`);
    if (d.success) {
      let list = d.requests||[];
      if (filter && filter !== 'all') list = list.filter(r => r.status === filter);
      const bc = s => s === '대기중' ? 'orange' : s === '완료' ? 'green' : 'blue';
      $('s-rvh-body').innerHTML = list.length ? list.map(r => `<tr><td>${esc(r.productName)}</td><td>${esc(r.keyword)}</td><td>${r.totalCount||0}</td><td>${r.dailyCount||0}</td><td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td><td>${r.createdAt?new Date(r.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty"><p>신청 내역 없음</p></td></tr>';
    }
  } catch {}
}

let rvInvParsed = [];
function onRvInvFile(e) {
  const file = e.target.files[0]; if (!file) return;
  $('s-rvinv-fname').textContent = file.name; $('btn-s-rvinv-match').disabled = false;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      rvInvParsed = rows.map(row => { const keys = Object.keys(row); const find = (...pats) => { const k = keys.find(k => pats.some(p => k.includes(p))); return k ? String(row[k]).trim() : ''; }; return { orderId: find('주문번호','주문'), productName: find('품명','상품명'), receiverName: find('주문자이름','수령인','이름'), phone: find('연락가능한번호','연락처'), address: find('배송지주소','주소'), invoiceNumber: find('송장번호','운송장','송장') }; }).filter(r => r.orderId || r.receiverName);
      toast(`${rvInvParsed.length}건 파싱`);
    } catch { toast('파싱 실패'); }
  };
  reader.readAsArrayBuffer(file); e.target.value = '';
}
async function matchRvInv() {
  if (!rvInvParsed.length) return toast('파일 먼저 업로드');
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-rvinv-match'); btn.disabled = true; btn.textContent = '매칭 중...';
  try {
    const d = await post('/coupang/orders', { ...k, status: 'INSTRUCT', createdAtFrom: new Date(Date.now()-30*864e5).toISOString().split('T')[0], createdAtTo: new Date().toISOString().split('T')[0] });
    const co = d.success ? d.orders : [];
    const matched = rvInvParsed.map(row => { let o = null; if (row.orderId) o = co.find(x => String(x.orderId)===row.orderId||String(x.shipmentBoxId)===row.orderId); if (!o && row.receiverName) o = co.find(x => x.receiverName===row.receiverName); return { ...row, order: o, matched: !!o }; });
    $('s-rvinv-placeholder').classList.add('hidden'); $('s-rvinv-result').classList.remove('hidden');
    $('s-rvinv-result').dataset.matched = JSON.stringify(matched);
    $('s-rvinv-body').innerHTML = matched.map(r => `<tr><td><code>${r.order?.orderId||r.orderId||'-'}</code></td><td>${esc(r.order?.productName||r.productName||'-')}</td><td>${esc(r.order?.receiverName||r.receiverName||'-')}</td><td><code>${esc(r.invoiceNumber||'-')}</code></td><td><span class="badge ${r.matched?'green':'red'}">${r.matched?'O':'X'}</span></td></tr>`).join('');
    toast(`매칭: ${matched.filter(r=>r.matched).length}/${matched.length}건`);
  } catch { toast('주문 조회 실패'); }
  btn.disabled = false; btn.textContent = '송장 매칭';
}
async function applyRvInv() {
  const ms = $('s-rvinv-result').dataset.matched; if (!ms) return toast('먼저 매칭 실행');
  const matched = JSON.parse(ms).filter(r => r.matched && r.invoiceNumber && r.order);
  if (!matched.length) return toast('매칭된 송장 없음');
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-rvinv-apply'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await post('/coupang/invoice-batch', { ...k, invoices: matched.map(m => ({ shipmentBoxId: m.order.shipmentBoxId, invoiceNumber: m.invoiceNumber, deliveryCompanyCode: $('s-rvinv-courier').value })) });
    if (d.success) toast(`성공 ${d.summary.success} / 실패 ${d.summary.fail}`);
  } catch { toast('실패'); }
  btn.disabled = false; btn.textContent = '송장 일괄 등록';
}

// ========================================
//  SELLER: 쿠팡 주문
// ========================================
function initOrders() {
  $('btn-s-orders').onclick = fetchOrders;
  $('s-order-chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; document.querySelectorAll('#s-order-chips .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); orderTypeFilter = c.dataset.t; renderOrders(); };
}
async function fetchOrders() {
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-orders'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { const d = await post('/coupang/orders', { ...k, status: $('s-status').value, createdAtFrom: $('s-from').value, createdAtTo: $('s-to').value }); if (d.success) { orders = d.orders; renderOrders(); toast(`${d.total}건`); } else toast(d.message); } catch { toast('실패'); }
  btn.disabled = false; btn.textContent = '조회';
}
function renderOrders() {
  let f = orders;
  if (orderTypeFilter==='review') f = orders.filter(o => reviewTags.has(String(o.orderId)));
  else if (orderTypeFilter==='real') f = orders.filter(o => !reviewTags.has(String(o.orderId)));
  const L = { ACCEPT:'결제완료', INSTRUCT:'상품준비중', DEPARTURE:'배송지시', DELIVERING:'배송중', FINAL_DELIVERY:'배송완료' };
  const C = { ACCEPT:'blue', INSTRUCT:'orange', DELIVERING:'blue', FINAL_DELIVERY:'green' };
  $('s-orders-body').innerHTML = f.length ? f.map(o => {
    const isR = reviewTags.has(String(o.orderId));
    return `<tr><td><span class="badge ${isR?'orange':'green'}" style="cursor:pointer;font-size:11px" data-tog="${o.orderId}">${isR?'체험단':'실주문'}</span></td><td><code style="font-size:12px">${o.orderId||'-'}</code></td><td style="max-width:220px">${esc(o.productName||'-')}</td><td><span class="badge blue">${esc(o.optionName||'-')}</span></td><td>${o.quantity}</td><td>${esc(o.receiverName||'-')}</td><td>${o.orderDate?new Date(o.orderDate).toLocaleString('ko'):'-'}</td><td><span class="badge ${C[o.status]||'gray'}">${L[o.status]||o.status}</span></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="empty"><p>조회 버튼을 눌러주세요</p></td></tr>';
  document.querySelectorAll('[data-tog]').forEach(b => b.onclick = async () => { const id = String(b.dataset.tog); if (reviewTags.has(id)) reviewTags.delete(id); else reviewTags.add(id); await saveTags(); renderOrders(); });
}
async function loadTags() { if (!currentUser) return; try { const d = await post('/review/get-tags', { userId: currentUser.uid }); reviewTags = new Set((d.orderIds||[]).map(String)); } catch { reviewTags = new Set(); } }
async function saveTags() { if (currentUser) try { await post('/review/set-tags', { userId: currentUser.uid, orderIds: [...reviewTags] }); } catch {} }

// ========================================
//  SELLER: 설정 (API + 공급처 통합)
// ========================================
function initSettings() {
  // API
  const keys = getKeys();
  if (keys) { $('s-vid').value = keys.vendorId||''; $('s-ak').value = keys.accessKey||''; $('s-sk').value = keys.secretKey||''; }
  $('btn-s-test').onclick = async () => {
    const v = $('s-vid').value.trim(), a = $('s-ak').value.trim(), s = $('s-sk').value.trim(), msg = $('s-api-msg');
    if (!v||!a||!s) { msg.className='api-status error'; msg.textContent='모든 항목 입력'; msg.classList.remove('hidden'); return; }
    msg.className='api-status'; msg.textContent='테스트 중...'; msg.classList.remove('hidden');
    try { const d = await post('/coupang/test', { vendorId: v, accessKey: a, secretKey: s }); msg.className=`api-status ${d.success?'success':'error'}`; msg.textContent=d.success?'연결 성공!':(d.message||'실패'); } catch { msg.className='api-status error'; msg.textContent='서버 연결 실패'; }
  };
  $('btn-s-save-api').onclick = async () => {
    const v = $('s-vid').value.trim(), a = $('s-ak').value.trim(), s = $('s-sk').value.trim();
    if (!v||!a||!s) return toast('모든 항목 입력');
    localStorage.setItem('sellio_api', JSON.stringify({ vendorId: v, accessKey: a, secretKey: s }));
    if (currentUser) try { await post('/user/save-keys', { userId: currentUser.uid, vendorId: v, accessKey: a, secretKey: s }); } catch {}
    $('s-sub').textContent = `셀러 #${v}`; toast('API 키 저장 완료');
  };
  // 공급처 등록 요청
  $('btn-s-req-submit').onclick = submitSupReq;
  loadSupReqs();
}
async function submitSupReq() {
  const name = $('s-req-name').value.trim(), url = $('s-req-url').value.trim();
  if (!name) return toast('공급처명 입력'); if (!url) return toast('URL 입력');
  try { const d = await post('/supplier-request/save', { userId: currentUser.uid, seller: currentUser.company||currentUser.loginId, name, url }); if (d.success) { toast('요청 완료'); $('s-req-name').value=''; $('s-req-url').value=''; loadSupReqs(); } } catch { toast('실패'); }
}
async function loadSupReqs() {
  if (!currentUser) return;
  try { const d = await get(`/supplier-request/list?userId=${currentUser.uid}`); if (d.success) { const list = d.requests||[]; const bc = s => s==='대기중'?'orange':s==='처리완료'?'green':'blue'; $('s-req-body').innerHTML = list.length ? list.map(r => `<tr><td>${esc(r.name)}</td><td><a href="${esc(r.url)}" target="_blank" style="color:var(--blue)">${esc(r.url).substring(0,40)}${r.url.length>40?'...':''}</a></td><td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td><td>${r.createdAt?new Date(r.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="4" class="empty"><p>요청 내역 없음</p></td></tr>'; } } catch {}
}

// ========================================
//  ADMIN
// ========================================
function initAdminDash() { $('btn-a-refresh').onclick = loadAdminDash; }
async function loadAdminDash() {
  try {
    const [uR, rR, sR, mR] = await Promise.all([get('/admin/users'), get('/admin/all-requests'), get('/suppliers'), get('/admin/all-mappings')]);
    allUsers = (uR.users||[]).filter(u => u.role === 'seller'); allRequests = rR.requests||[]; allSuppliers = sR.suppliers||[]; allMappings = mR.mappings||[];
    $('ad-sellers').innerHTML = `${allUsers.length}<small>명</small>`; $('ad-pending').innerHTML = `${allRequests.filter(r=>r.status==='대기중').length}<small>건</small>`;
    $('ad-suppliers').innerHTML = `${allSuppliers.length}<small>개</small>`; $('ad-mappings').innerHTML = `${allMappings.length}<small>건</small>`;
    renderAdminSellers(); renderAdminReview();
  } catch (e) { console.error(e); }
}
function renderAdminSellers() {
  $('a-sellers-body').innerHTML = allUsers.length ? allUsers.map(u => `<tr><td>${esc(u.loginId)}</td><td>${esc(u.company||'-')}</td><td>${esc(u.ceo||'-')}</td><td>${esc(u.mobile||'-')}</td><td>${esc(u.email||'-')}</td><td>${u.vendorId||'-'}</td><td><span class="badge ${u.hasApiKeys?'green':'red'}">${u.hasApiKeys?'연결':'미연결'}</span></td><td>${u.createdAt?new Date(u.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="8" class="empty"><p>셀러 없음</p></td></tr>';
}
function initAdminPO() { $('btn-a-load-po').onclick = async () => {
  const btn = $('btn-a-load-po'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { const d = await get('/admin/purchase-order'); if (d.success) { const po = d.purchaseOrder||{}, keys = Object.keys(po); $('a-po-content').innerHTML = keys.length ? keys.map(sid => { const g = po[sid]; return `<div class="card" style="margin-top:16px"><div class="card-header"><h3>${esc(g.supplier?.name||'?')}</h3><span class="badge blue">${g.items.length}개</span></div><table class="tbl"><thead><tr><th>셀러</th><th>상품명</th><th>옵션</th><th>판매가</th><th>원가</th></tr></thead><tbody>${g.items.map(it=>`<tr><td>${esc(it.userId||'-')}</td><td>${esc(it.productName)}</td><td>${esc(it.option||'-')}</td><td>${it.salePrice?it.salePrice.toLocaleString()+'원':'-'}</td><td>${it.costPrice?it.costPrice.toLocaleString()+'원':'-'}</td></tr>`).join('')}</tbody></table></div>`; }).join('') : '<div class="card" style="margin-top:16px;padding:40px;text-align:center;color:#999">매핑 없음</div>'; } } catch { toast('실패'); }
  btn.disabled = false; btn.textContent = '발주서 생성';
}; }
function initAdminInvoice() { $('a-inv-file').onchange = async e => { const file = e.target.files[0]; if (!file) return; $('a-inv-fname').textContent = file.name; const fd = new FormData(); fd.append('file', file); try { const d = await fetchRaw(`${API}/invoice/parse-excel`, { method: 'POST', body: fd }); if (d.success&&d.data.length) { $('a-inv-result').classList.remove('hidden'); $('a-inv-result').dataset.parsed = JSON.stringify(d.data); $('a-inv-body').innerHTML = d.data.map(r=>`<tr><td>${esc(r.receiverName||'-')}</td><td><code>${esc(r.orderId||'-')}</code></td><td>${esc(r.productName||'-')}</td><td><code>${esc(r.invoiceNumber||'-')}</code></td><td><span class="badge ${r.invoiceNumber?'green':'orange'}">${r.invoiceNumber?'준비':'없음'}</span></td></tr>`).join(''); toast(`${d.data.length}건`); } } catch { toast('파싱 실패'); } e.target.value = ''; };
  $('btn-a-apply-inv').onclick = async () => { const ps=$('a-inv-result').dataset.parsed; if (!ps) return toast('엑셀 먼저'); const parsed=JSON.parse(ps).filter(r=>r.invoiceNumber&&r.orderId); if (!parsed.length) return toast('송장 없음'); const btn=$('btn-a-apply-inv'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; const courier=$('a-inv-courier').value, users=await get('/admin/users'), sellers=(users.users||[]).filter(u=>u.role==='seller'&&u.hasApiKeys); let ts=0,tf=0; for (const s of sellers) { try { const d=await post('/admin/invoice-for-seller',{sellerUid:s.uid,invoices:parsed.map(r=>({shipmentBoxId:r.orderId,invoiceNumber:r.invoiceNumber,deliveryCompanyCode:courier})),deliveryCompanyCode:courier}); if(d.success){ts+=d.summary.success;tf+=d.summary.fail;} } catch{tf+=parsed.length;} } toast(`성공:${ts} 실패:${tf}`); btn.disabled=false; btn.textContent='전체 송장 등록 실행'; }; }
function initAdminReview() {
  $('btn-a-kakao').onclick = async () => { try { const d = await get('/review/export'); if (d.success&&d.text&&d.count) { copyToClipboard(d.text); $('a-kakao-box').classList.remove('hidden'); $('a-kakao-box').innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.8">${esc(d.text)}</pre>`; toast(`${d.count}건 카톡 복사!`); } else toast('대기중 없음'); } catch { toast('실패'); } };
  $('btn-a-sent').onclick = async () => { const p = allRequests.filter(r=>r.status==='대기중'); if (!p.length) return toast('대기중 없음'); for (const rq of p) try { await post('/review/update-status', { id: rq.id, status: '진행중' }); } catch {} toast(`${p.length}건 진행중`); await loadAdminDash(); };
  $('a-rv-chips').onclick = e => { const c=e.target.closest('.chip'); if (!c) return; document.querySelectorAll('#a-rv-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); adminReqFilter=c.dataset.s; renderAdminReview(); };
}
function renderAdminReview() {
  const f = adminReqFilter==='all' ? allRequests : allRequests.filter(r=>r.status===adminReqFilter);
  const bc = s => s==='대기중'?'orange':s==='완료'?'green':'blue';
  $('a-rv-body').innerHTML = f.length ? f.map(r=>`<tr><td>${esc(r.seller||'-')}</td><td>${esc(r.productName||'-')}</td><td>${esc(r.keyword||'-')}</td><td>${r.totalCount||0}</td><td>${r.dailyCount||0}</td><td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td><td>${r.createdAt?new Date(r.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="7" class="empty"><p>체험단 없음</p></td></tr>';
}
function initAdminRvInvoice() {
  $('a-rvinv-file').onchange = async e => { const file=e.target.files[0]; if (!file) return; $('a-rvinv-fname').textContent=file.name; const fd=new FormData(); fd.append('file',file); try { const d=await fetchRaw(`${API}/invoice/parse-excel`,{method:'POST',body:fd}); if(d.success&&d.data.length){$('a-rvinv-result').classList.remove('hidden');$('a-rvinv-result').dataset.parsed=JSON.stringify(d.data);$('a-rvinv-body').innerHTML=d.data.map(r=>`<tr><td>${esc(r.receiverName||'-')}</td><td><code>${esc(r.orderId||'-')}</code></td><td><code>${esc(r.invoiceNumber||'-')}</code></td><td><span class="badge ${r.invoiceNumber?'green':'orange'}">${r.invoiceNumber?'준비':'없음'}</span></td></tr>`).join('');toast(`${d.data.length}건`);} }catch{toast('파싱 실패');} e.target.value=''; };
  $('btn-a-apply-rvinv').onclick = async () => { const ps=$('a-rvinv-result').dataset.parsed; if(!ps) return toast('엑셀 먼저'); const parsed=JSON.parse(ps).filter(r=>r.invoiceNumber&&r.orderId); if(!parsed.length) return toast('송장 없음'); const btn=$('btn-a-apply-rvinv'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; const courier=$('a-rvinv-courier').value,users=await get('/admin/users'),sellers=(users.users||[]).filter(u=>u.role==='seller'&&u.hasApiKeys); let ts=0,tf=0; for(const s of sellers){try{const d=await post('/admin/invoice-for-seller',{sellerUid:s.uid,invoices:parsed.map(r=>({shipmentBoxId:r.orderId,invoiceNumber:r.invoiceNumber,deliveryCompanyCode:courier})),deliveryCompanyCode:courier});if(d.success){ts+=d.summary.success;tf+=d.summary.fail;}}catch{tf+=parsed.length;}} toast(`체험단 송장: 성공${ts} 실패${tf}`); btn.disabled=false; btn.textContent='체험단 송장 등록 실행'; };
}

// ========================================
//  UTILS
// ========================================
function $(id) { return document.getElementById(id); }
async function post(path, body) { return (await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
async function get(path) { return (await fetch(`${API}${path}`)).json(); }
async function fetchRaw(url, opts) { return (await fetch(url, opts)).json(); }
function toast(m) { const e=$('toast'); $('toast-msg').textContent=m; e.classList.remove('hidden'); clearTimeout(window._t); window._t=setTimeout(()=>e.classList.add('hidden'),3000); }
function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function copyToClipboard(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(()=>fbCopy(t)); else fbCopy(t); }
function fbCopy(t) { const a=document.createElement('textarea'); a.value=t; document.body.appendChild(a); a.select(); document.execCommand('copy'); document.body.removeChild(a); }
