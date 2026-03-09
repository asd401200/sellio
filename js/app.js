// ============================================
//  Sellio — 대봉 스타일 + 체험단 자동화
// ============================================
const API = location.origin + '/api';

let currentUser = null;
let products = [], orders = [], reviewTags = new Set();
let orderTypeFilter = 'all';
let suppliers = [], mappings = [];
// Admin
let allRequests = [], allUsers = [], allSuppliers = [], allMappings = [];
let adminReqFilter = 'all';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => initAuth());

function getKeys() { const s = localStorage.getItem('sellio_api'); return s ? JSON.parse(s) : null; }
function needKeys() {
  const k = getKeys();
  if (!k?.vendorId || !k?.accessKey || !k?.secretKey) { toast('먼저 API를 설정해주세요'); navTo('s-api'); return null; }
  return k;
}

// ===== AUTH =====
function initAuth() {
  const saved = localStorage.getItem('sellio_user');
  if (saved) { currentUser = JSON.parse(saved); enterApp(); }
  $('goto-register').onclick = e => { e.preventDefault(); $('login-card').classList.add('hidden'); $('register-card').classList.remove('hidden'); };
  $('goto-login').onclick = e => { e.preventDefault(); $('register-card').classList.add('hidden'); $('login-card').classList.remove('hidden'); };
  $('btn-login').onclick = doLogin;
  $('login-pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  $('login-id').onkeydown = e => { if (e.key === 'Enter') $('login-pw').focus(); };
  $('btn-register').onclick = doRegister;
  document.querySelectorAll('.logout-btn').forEach(b => b.onclick = doLogout);
}

async function doLogin() {
  const id = $('login-id').value.trim(), pw = $('login-pw').value;
  if (!id || !pw) return toast('아이디와 비밀번호를 입력하세요');
  const btn = $('btn-login'); btn.disabled = true; btn.textContent = '로그인 중...';
  try {
    const d = await post('/auth/login', { loginId: id, password: pw });
    if (d.success) { currentUser = d.user; localStorage.setItem('sellio_user', JSON.stringify(currentUser)); enterApp(); }
    else toast(d.message || '로그인 실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '로그인';
}

async function doRegister() {
  const v = id => $(id).value.trim();
  const role = document.querySelector('input[name="reg-role"]:checked')?.value || 'seller';
  const data = { loginId: v('reg-id'), password: v('reg-pw'), password2: v('reg-pw2'), company: v('reg-company'), ceo: v('reg-ceo'), mobile: v('reg-mobile'), email: v('reg-email'), role };
  for (const [cond, msg] of [
    [!data.loginId || data.loginId.length < 4, '아이디 4자 이상'],
    [!data.password || data.password.length < 8, '비밀번호 8자 이상'],
    [data.password !== data.password2, '비밀번호 불일치'],
    [!data.company, '회사명/이름 입력'], [!data.mobile, '휴대폰 입력'], [!data.email, '이메일 입력'],
  ]) if (cond) return toast(msg);
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

// ===== ENTER APP =====
async function enterApp() {
  $('login-screen').classList.add('hidden');
  if (currentUser.role === 'admin') {
    $('app-admin').classList.remove('hidden');
    $('a-name').textContent = currentUser.company || '관리자';
    initAdminNav(); initAdminDash(); initAdminSellers(); initAdminPO(); initAdminInvoice(); initAdminReview(); initAdminRvInvoice();
    loadAdminDash();
  } else {
    $('app-seller').classList.remove('hidden');
    $('s-name').textContent = currentUser.company || currentUser.loginId;
    $('s-avatar').textContent = (currentUser.company || currentUser.loginId || 'U')[0].toUpperCase();
    $('s-sub').textContent = '셀러';
    initSellerNav(); initMapping(); initSupplierReq(); initReviewApply(); initReviewInvoice(); initReviewHistory(); initOrders(); initApi();
    setDates();
    try {
      const d = await post('/user/load-keys', { userId: currentUser.uid });
      if (d.keys) { localStorage.setItem('sellio_api', JSON.stringify(d.keys)); $('s-vid').value = d.keys.vendorId || ''; $('s-ak').value = d.keys.accessKey || ''; $('s-sk').value = d.keys.secretKey || ''; $('s-sub').textContent = `셀러 #${d.keys.vendorId}`; }
    } catch {}
    await loadTags();
    await loadSuppliers();
    await loadMappings();
  }
  toast(`${currentUser.company || currentUser.loginId}님 환영합니다!`);
}

function setDates() {
  const t = new Date().toISOString().split('T')[0], w = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
  if ($('s-to')) $('s-to').value = t;
  if ($('s-from')) $('s-from').value = w;
  if ($('s-rvinv-date')) $('s-rvinv-date').value = t;
}

// ===== NAV =====
function initSellerNav() { document.querySelectorAll('#app-seller .nav-item').forEach(i => i.onclick = e => { e.preventDefault(); navTo(i.dataset.page); }); }
function initAdminNav() { document.querySelectorAll('#app-admin .nav-item').forEach(i => i.onclick = e => { e.preventDefault(); navTo(i.dataset.page); }); }
function navTo(p) {
  const c = currentUser?.role === 'admin' ? '#app-admin' : '#app-seller';
  document.querySelectorAll(`${c} .nav-item`).forEach(n => n.classList.toggle('active', n.dataset.page === p));
  document.querySelectorAll(`${c} .page`).forEach(pg => pg.classList.toggle('active', pg.id === `page-${p}`));
}

// =============================================
//  SELLER: 상품 매핑 관리 (대봉 스타일)
// =============================================
function initMapping() {
  $('btn-s-fetch').onclick = fetchProducts;
  $('btn-s-collect-accept').onclick = collectAcceptOrders;
  $('s-mapping-search').oninput = renderMapping;
}

async function fetchProducts() {
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-fetch'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 가져오는 중...';
  try {
    const d = await post('/coupang/products', k);
    if (d.success) { products = d.products; renderMapping(); toast(`${products.length}개 상품 로드`); }
    else toast(d.message);
  } catch { toast('실패'); }
  btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 상품 가져오기';
}

async function collectAcceptOrders() {
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-collect-accept'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await post('/coupang/orders', { ...k, status: 'ACCEPT', createdAtFrom: new Date(Date.now() - 14 * 864e5).toISOString().split('T')[0], createdAtTo: new Date().toISOString().split('T')[0] });
    if (d.success && d.orders.length) {
      $('s-accept-card').classList.remove('hidden');
      $('s-accept-count').textContent = `${d.orders.length}건`;
      $('s-accept-body').innerHTML = d.orders.map(o => `<tr><td><code>${o.orderId}</code></td><td>${esc(o.productName)}</td><td>${esc(o.optionName||'-')}</td><td>${o.quantity}</td><td>${esc(o.receiverName)}</td><td>${o.orderDate ? new Date(o.orderDate).toLocaleDateString('ko') : '-'}</td></tr>`).join('');
      toast(`결제완료 ${d.orders.length}건`);
    } else { toast('결제완료 주문 없음'); $('s-accept-card').classList.add('hidden'); }
  } catch { toast('실패'); }
  btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 결제완료주문 수합하기';
}

function renderMapping() {
  const q = ($('s-mapping-search').value || '').toLowerCase();
  const f = products.filter(p => !q || (p.name||'').toLowerCase().includes(q) || (p.option||'').toLowerCase().includes(q));
  $('s-prod-count').textContent = `${f.length}개 상품`;

  const supOpts = suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  $('s-mapping-body').innerHTML = f.length ? f.map((p, i) => {
    const pid = String(p.vendorItemId || p.sellerProductId);
    const map = mappings.find(m => m.productId === pid);
    const isActive = map ? map.active !== false : false;
    return `<tr>
      <td style="text-align:center;color:var(--gray-500)">${i + 1}</td>
      <td style="max-width:280px">${esc(p.name)}</td>
      <td><code style="font-size:12px;color:var(--blue)">${p.vendorItemId || p.optionId || '-'}</code></td>
      <td><span class="badge blue">${esc(p.option || '-')}</span></td>
      <td style="text-align:center">
        <label class="switch"><input type="checkbox" ${isActive ? 'checked' : ''} data-toggle="${pid}" data-pname="${esc(p.name)}" data-opt="${esc(p.option||'')}" data-oid="${p.optionId||''}" data-sale="${p.salePrice||0}"><span class="switch-slider"></span></label>
      </td>
      <td>
        <select class="input-sm mapping-select" data-map-pid="${pid}" style="width:100%">
          <option value="">공급처 선택</option>${supOpts}
        </select>
      </td>
      <td><input type="number" class="input-sm mapping-cost" data-cost-pid="${pid}" placeholder="원가" style="width:80px" value="${map?.costPrice || ''}"></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty"><p>상품 가져오기를 눌러주세요</p></td></tr>';

  // 기존 매핑 값 세팅
  f.forEach(p => {
    const pid = String(p.vendorItemId || p.sellerProductId);
    const map = mappings.find(m => m.productId === pid);
    if (map?.supplierId) {
      const sel = document.querySelector(`[data-map-pid="${pid}"]`);
      if (sel) sel.value = String(map.supplierId);
    }
  });

  // Toggle 이벤트
  document.querySelectorAll('[data-toggle]').forEach(cb => {
    cb.onchange = async () => {
      const pid = cb.dataset.toggle;
      const map = mappings.find(m => m.productId === pid);
      if (map) {
        await post('/mapping/toggle', { userId: currentUser.uid, productId: pid, active: cb.checked });
        map.active = cb.checked;
      } else {
        // 새 매핑 생성 (활성화만)
        await post('/mapping/save', {
          userId: currentUser.uid, productId: pid, productName: cb.dataset.pname,
          optionId: cb.dataset.oid, option: cb.dataset.opt, salePrice: cb.dataset.sale,
          supplierId: '', supplierName: '', costPrice: 0, active: cb.checked
        });
        await loadMappings();
      }
      refreshReviewProductSelect();
    };
  });

  // 매핑 드롭다운 변경
  document.querySelectorAll('.mapping-select').forEach(sel => {
    sel.onchange = async () => {
      const pid = sel.dataset.mapPid;
      const p = products.find(p => String(p.vendorItemId || p.sellerProductId) === pid);
      if (!p) return;
      const sup = suppliers.find(s => String(s.id) === sel.value);
      const costEl = document.querySelector(`[data-cost-pid="${pid}"]`);
      await post('/mapping/save', {
        userId: currentUser.uid, productId: pid, productName: p.name,
        optionId: p.optionId || '', option: p.option || '', salePrice: p.salePrice || 0,
        supplierId: sel.value, supplierName: sup?.name || '', costPrice: costEl?.value || 0, active: true
      });
      await loadMappings();
      toast('매핑 저장');
    };
  });

  // 원가 변경
  document.querySelectorAll('.mapping-cost').forEach(inp => {
    inp.onblur = async () => {
      const pid = inp.dataset.costPid;
      const map = mappings.find(m => m.productId === pid);
      if (map) {
        await post('/mapping/save', { ...map, userId: currentUser.uid, costPrice: inp.value });
        await loadMappings();
      }
    };
  });

  $('s-mapping-footer').innerHTML = f.length ? `<span>총 ${f.length}개 중 ${mappings.filter(m => m.active !== false && m.supplierId).length}개 매핑됨</span>` : '';
}

async function loadSuppliers() {
  try { const d = await get('/suppliers'); if (d.success) suppliers = d.suppliers || []; } catch {}
}
async function loadMappings() {
  if (!currentUser) return;
  try { const d = await get(`/mappings?userId=${currentUser.uid}`); if (d.success) mappings = d.mappings || []; } catch {}
}

// =============================================
//  SELLER: 상품 등록 요청
// =============================================
function initSupplierReq() {
  $('btn-s-req-submit').onclick = submitSupplierReq;
  loadSupplierReqs();
}

async function submitSupplierReq() {
  const name = $('s-req-name').value.trim(), url = $('s-req-url').value.trim();
  if (!name) return toast('공급처명을 입력하세요');
  if (!url) return toast('사이트 주소를 입력하세요');
  try {
    const d = await post('/supplier-request/save', { userId: currentUser.uid, seller: currentUser.company || currentUser.loginId, name, url });
    if (d.success) { toast('요청 완료'); $('s-req-name').value = ''; $('s-req-url').value = ''; loadSupplierReqs(); }
  } catch { toast('실패'); }
}

async function loadSupplierReqs() {
  if (!currentUser) return;
  try {
    const d = await get(`/supplier-request/list?userId=${currentUser.uid}`);
    if (d.success) {
      const list = d.requests || [];
      const bc = s => s === '대기중' ? 'orange' : s === '처리완료' ? 'green' : 'blue';
      $('s-req-body').innerHTML = list.length ? list.map(r => `<tr>
        <td>${esc(r.name)}</td>
        <td><a href="${esc(r.url)}" target="_blank" style="color:var(--blue);text-decoration:underline;word-break:break-all">${esc(r.url).substring(0,50)}${r.url.length>50?'...':''}</a></td>
        <td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td>
        <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko') : '-'}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="empty"><p>요청 내역이 없습니다</p></td></tr>';
    }
  } catch {}
}

// =============================================
//  SELLER: 체험단 신청
// =============================================
function initReviewApply() {
  $('s-rv-product').onchange = onProductSelect;
  $('btn-s-rv-submit').onclick = submitReview;
  refreshReviewProductSelect();
  loadRecentReviews();
}

function refreshReviewProductSelect() {
  const activeProducts = [];
  products.forEach(p => {
    const pid = String(p.vendorItemId || p.sellerProductId);
    const map = mappings.find(m => m.productId === pid);
    if (map && map.active !== false) activeProducts.push(p);
  });
  // 매핑 안된 상품도 표시 (전체)
  const allProds = products.length ? products : [];
  const sel = $('s-rv-product');
  const cur = sel.value;
  sel.innerHTML = '<option value="">상품을 선택하세요</option>';
  if (activeProducts.length) {
    sel.innerHTML += '<optgroup label="활성화된 상품">' + activeProducts.map(p => `<option value="${p.vendorItemId||p.sellerProductId}">${esc(p.name)} - ${esc(p.option||'')}</option>`).join('') + '</optgroup>';
  }
  if (allProds.length > activeProducts.length) {
    const inactive = allProds.filter(p => !activeProducts.includes(p));
    if (inactive.length) {
      sel.innerHTML += '<optgroup label="전체 상품">' + inactive.map(p => `<option value="${p.vendorItemId||p.sellerProductId}">${esc(p.name)} - ${esc(p.option||'')}</option>`).join('') + '</optgroup>';
    }
  }
  if (cur) sel.value = cur;
}

function onProductSelect() {
  const val = $('s-rv-product').value;
  if (val) {
    const p = products.find(x => String(x.vendorItemId || x.sellerProductId) === val);
    if (p) {
      $('s-rv-opt').value = p.option || '';
      $('s-rv-url').value = p.sellerProductId ? `https://www.coupang.com/vp/products/${p.sellerProductId}` : '';
    }
    $('s-rv-form').classList.remove('hidden');
  } else {
    $('s-rv-form').classList.add('hidden');
  }
}

async function submitReview() {
  const kw = $('s-rv-keyword').value.trim(), tc = $('s-rv-total').value, dc = $('s-rv-daily').value;
  if (!kw) return toast('키워드를 입력하세요');
  if (!tc || !dc) return toast('건수를 입력하세요');
  const pid = $('s-rv-product').value;
  const p = products.find(x => String(x.vendorItemId || x.sellerProductId) === pid);

  const btn = $('btn-s-rv-submit'); btn.disabled = true; btn.textContent = '신청 중...';
  const fd = new FormData();
  fd.append('userId', currentUser.uid);
  fd.append('seller', currentUser.company || currentUser.loginId);
  fd.append('sellerEmail', currentUser.email || '');
  fd.append('productName', p?.name || '');
  fd.append('keyword', kw);
  fd.append('productUrl', $('s-rv-url').value);
  fd.append('purchaseOption', $('s-rv-opt').value);
  fd.append('totalCount', tc);
  fd.append('dailyCount', dc);
  fd.append('requestTime', $('s-rv-time').value || '상관없음');
  fd.append('reviewGuide', $('s-rv-guide').value || '');
  fd.append('photoReview', String($('s-rv-photo').checked));
  fd.append('paymentProxy', String($('s-rv-pay').checked));
  fd.append('deliveryProxy', String($('s-rv-deliv').checked));
  fd.append('weekend', String($('s-rv-wknd').checked));

  try {
    const d = await fetchRaw(`${API}/review/apply`, { method: 'POST', body: fd });
    if (d.success) { toast('체험단 신청 완료!'); $('s-rv-keyword').value = ''; $('s-rv-total').value = ''; $('s-rv-daily').value = ''; loadRecentReviews(); }
    else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '체험단 신청하기';
}

async function loadRecentReviews() {
  if (!currentUser) return;
  try {
    const d = await get(`/review/list?userId=${currentUser.uid}`);
    if (d.success) {
      const list = (d.requests || []).slice(0, 5);
      renderReviewTable(list, 's-rv-recent-body');
    }
  } catch {}
}

function renderReviewTable(list, bodyId) {
  const bc = s => s === '대기중' ? 'orange' : s === '완료' ? 'green' : 'blue';
  $(bodyId).innerHTML = list.length ? list.map(r => `<tr>
    <td>${esc(r.productName)}</td><td>${esc(r.keyword)}</td><td>${r.totalCount||0}</td><td>${r.dailyCount||0}</td>
    <td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td>
    <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko') : '-'}</td>
  </tr>`).join('') : '<tr><td colspan="6" class="empty"><p>신청 내역이 없습니다</p></td></tr>';
}

// =============================================
//  SELLER: 체험단 송장 업데이트
// =============================================
function initReviewInvoice() {
  $('s-rvinv-file').onchange = onRvInvFile;
  $('btn-s-rvinv-match').onclick = matchRvInvoices;
  $('btn-s-rvinv-apply').onclick = applyRvInvoices;
  $('btn-s-rvinv-template').onclick = downloadTemplate;
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['주문번호', '품명', '주문자이름', '연락가능한번호', '배송지주소', '송장번호'],
    ['6100175341443', '광부사과5kg', '권영철', '010-8167-8040', '울산북구수동1길2cafe2112', '8026030432606']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '송장');
  XLSX.writeFile(wb, `체험단_송장_템플릿_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('템플릿 다운로드 완료');
}

let rvInvParsed = [];
function onRvInvFile(e) {
  const file = e.target.files[0]; if (!file) return;
  $('s-rvinv-fname').textContent = file.name;
  $('btn-s-rvinv-match').disabled = false;

  // 클라이언트 사이드 파싱 (XLSX CDN 사용)
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      rvInvParsed = rows.map(row => {
        const keys = Object.keys(row);
        const find = (...pats) => { const k = keys.find(k => pats.some(p => k.includes(p))); return k ? String(row[k]).trim() : ''; };
        return {
          orderId: find('주문번호','주문','orderId'),
          productName: find('품명','상품명','상품'),
          receiverName: find('주문자이름','수령인','수취인','이름'),
          phone: find('연락가능한번호','연락처','전화'),
          address: find('배송지주소','주소'),
          invoiceNumber: find('송장번호','운송장','송장','tracking'),
        };
      }).filter(r => r.orderId || r.receiverName);
      toast(`${rvInvParsed.length}건 파싱 완료`);
    } catch (err) { toast('파일 파싱 실패'); }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

async function matchRvInvoices() {
  if (!rvInvParsed.length) return toast('먼저 파일을 업로드하세요');
  const k = needKeys(); if (!k) return;

  const btn = $('btn-s-rvinv-match'); btn.disabled = true; btn.textContent = '매칭 중...';

  // 쿠팡에서 상품준비중 주문 가져와서 매칭
  try {
    const d = await post('/coupang/orders', { ...k, status: 'INSTRUCT', createdAtFrom: new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0], createdAtTo: new Date().toISOString().split('T')[0] });
    const coupangOrders = d.success ? d.orders : [];

    const matched = rvInvParsed.map(row => {
      let order = null;
      if (row.orderId) order = coupangOrders.find(o => String(o.orderId) === row.orderId || String(o.shipmentBoxId) === row.orderId);
      if (!order && row.receiverName) order = coupangOrders.find(o => o.receiverName === row.receiverName);
      return { ...row, order, matched: !!order };
    });

    $('s-rvinv-placeholder').classList.add('hidden');
    $('s-rvinv-result').classList.remove('hidden');
    $('s-rvinv-result').dataset.matched = JSON.stringify(matched);

    const mc = matched.filter(r => r.matched).length;
    $('s-rvinv-body').innerHTML = matched.map(r => `<tr>
      <td><code>${r.order?.orderId || r.orderId || '-'}</code></td>
      <td>${esc(r.order?.productName || r.productName || '-')}</td>
      <td>${esc(r.order?.receiverName || r.receiverName || '-')}</td>
      <td><code>${esc(r.invoiceNumber || '-')}</code></td>
      <td><span class="badge ${r.matched ? 'green' : 'red'}">${r.matched ? 'O' : 'X'}</span></td>
    </tr>`).join('');
    toast(`매칭: ${mc}/${matched.length}건`);
  } catch { toast('주문 조회 실패'); }
  btn.disabled = false; btn.textContent = '송장 매칭';
}

async function applyRvInvoices() {
  const matchedStr = $('s-rvinv-result').dataset.matched;
  if (!matchedStr) return toast('먼저 매칭을 실행하세요');
  const matched = JSON.parse(matchedStr).filter(r => r.matched && r.invoiceNumber && r.order);
  if (!matched.length) return toast('매칭된 송장이 없습니다');

  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-rvinv-apply'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 등록 중...';
  const courier = $('s-rvinv-courier').value;

  try {
    const d = await post('/coupang/invoice-batch', {
      ...k,
      invoices: matched.map(m => ({ shipmentBoxId: m.order.shipmentBoxId, invoiceNumber: m.invoiceNumber, deliveryCompanyCode: courier }))
    });
    if (d.success) toast(`송장 등록: 성공 ${d.summary.success} / 실패 ${d.summary.fail}`);
  } catch { toast('실패'); }
  btn.disabled = false; btn.textContent = '송장 일괄 등록';
}

// =============================================
//  SELLER: 체험단 신청 내역
// =============================================
function initReviewHistory() {
  $('s-rvh-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#s-rvh-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    loadReviewHistory(c.dataset.s);
  };
  loadReviewHistory('all');
}

async function loadReviewHistory(filter) {
  if (!currentUser) return;
  try {
    const d = await get(`/review/list?userId=${currentUser.uid}`);
    if (d.success) {
      let list = d.requests || [];
      if (filter && filter !== 'all') list = list.filter(r => r.status === filter);
      renderReviewTable(list, 's-rvh-body');
    }
  } catch {}
}

// =============================================
//  SELLER: 쿠팡 주문 내역
// =============================================
function initOrders() {
  $('btn-s-orders').onclick = fetchOrders;
  $('s-order-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#s-order-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    orderTypeFilter = c.dataset.t;
    renderOrders();
  };
}

async function fetchOrders() {
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-orders'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await post('/coupang/orders', { ...k, status: $('s-status').value, createdAtFrom: $('s-from').value, createdAtTo: $('s-to').value });
    if (d.success) { orders = d.orders; renderOrders(); toast(`${d.total}건`); } else toast(d.message);
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '조회';
}

function renderOrders() {
  let f = orders;
  if (orderTypeFilter === 'review') f = orders.filter(o => reviewTags.has(String(o.orderId)));
  else if (orderTypeFilter === 'real') f = orders.filter(o => !reviewTags.has(String(o.orderId)));
  const labels = { ACCEPT: '결제완료', INSTRUCT: '상품준비중', DEPARTURE: '배송지시', DELIVERING: '배송중', FINAL_DELIVERY: '배송완료' };
  const colors = { ACCEPT: 'blue', INSTRUCT: 'orange', DELIVERING: 'blue', FINAL_DELIVERY: 'green' };
  $('s-orders-body').innerHTML = f.length ? f.map(o => {
    const isR = reviewTags.has(String(o.orderId));
    return `<tr>
      <td><span class="badge ${isR?'orange':'green'}" style="cursor:pointer;font-size:11px" data-tog="${o.orderId}">${isR?'체험단':'실주문'}</span></td>
      <td><code style="font-size:12px">${o.orderId||'-'}</code></td>
      <td style="max-width:220px">${esc(o.productName||'-')}</td>
      <td><span class="badge blue">${esc(o.optionName||'-')}</span></td>
      <td>${o.quantity}</td><td>${esc(o.receiverName||'-')}</td>
      <td>${o.orderDate ? new Date(o.orderDate).toLocaleString('ko') : '-'}</td>
      <td><span class="badge ${colors[o.status]||'gray'}">${labels[o.status]||o.status}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty"><p>조회 버튼을 눌러주세요</p></td></tr>';
  document.querySelectorAll('[data-tog]').forEach(b => b.onclick = async () => {
    const id = String(b.dataset.tog);
    if (reviewTags.has(id)) reviewTags.delete(id); else reviewTags.add(id);
    await saveTags(); renderOrders();
  });
}

async function loadTags() { if (!currentUser) return; try { const d = await post('/review/get-tags', { userId: currentUser.uid }); reviewTags = new Set((d.orderIds||[]).map(String)); } catch { reviewTags = new Set(); } }
async function saveTags() { if (currentUser) try { await post('/review/set-tags', { userId: currentUser.uid, orderIds: [...reviewTags] }); } catch {} }

// =============================================
//  SELLER: API 설정
// =============================================
function initApi() {
  const keys = getKeys();
  if (keys) { $('s-vid').value = keys.vendorId||''; $('s-ak').value = keys.accessKey||''; $('s-sk').value = keys.secretKey||''; }
  $('btn-s-test').onclick = async () => {
    const v = $('s-vid').value.trim(), a = $('s-ak').value.trim(), s = $('s-sk').value.trim();
    const msg = $('s-api-msg');
    if (!v||!a||!s) { msg.className = 'api-status error'; msg.textContent = '모든 항목을 입력하세요'; msg.classList.remove('hidden'); return; }
    msg.className = 'api-status'; msg.textContent = '테스트 중...'; msg.classList.remove('hidden');
    try {
      const d = await post('/coupang/test', { vendorId: v, accessKey: a, secretKey: s });
      msg.className = `api-status ${d.success?'success':'error'}`; msg.textContent = d.success ? '연결 성공!' : (d.message||'연결 실패');
    } catch { msg.className = 'api-status error'; msg.textContent = '서버 연결 실패'; }
  };
  $('btn-s-save-api').onclick = async () => {
    const v = $('s-vid').value.trim(), a = $('s-ak').value.trim(), s = $('s-sk').value.trim();
    if (!v||!a||!s) return toast('모든 항목 입력');
    localStorage.setItem('sellio_api', JSON.stringify({ vendorId: v, accessKey: a, secretKey: s }));
    if (currentUser) try { await post('/user/save-keys', { userId: currentUser.uid, vendorId: v, accessKey: a, secretKey: s }); } catch {}
    $('s-sub').textContent = `셀러 #${v}`;
    toast('API 키 저장 완료');
  };
}

// =============================================
//  ADMIN: 대시보드
// =============================================
function initAdminDash() { $('btn-a-refresh').onclick = loadAdminDash; }
async function loadAdminDash() {
  try {
    const [uRes, rRes, sRes, mRes] = await Promise.all([get('/admin/users'), get('/admin/all-requests'), get('/suppliers'), get('/admin/all-mappings')]);
    allUsers = (uRes.users||[]).filter(u => u.role === 'seller');
    allRequests = rRes.requests||[];
    allSuppliers = sRes.suppliers||[];
    allMappings = mRes.mappings||[];
    $('ad-sellers').innerHTML = `${allUsers.length}<small>명</small>`;
    $('ad-pending').innerHTML = `${allRequests.filter(r => r.status==='대기중').length}<small>건</small>`;
    $('ad-suppliers').innerHTML = `${allSuppliers.length}<small>개</small>`;
    $('ad-mappings').innerHTML = `${allMappings.length}<small>건</small>`;
    renderAdminSellers(); renderAdminReview();
  } catch (e) { console.error(e); }
}

// =============================================
//  ADMIN: 셀러 관리
// =============================================
function initAdminSellers() {}
function renderAdminSellers() {
  $('a-sellers-body').innerHTML = allUsers.length ? allUsers.map(u => `<tr>
    <td>${esc(u.loginId)}</td><td>${esc(u.company||'-')}</td><td>${esc(u.ceo||'-')}</td>
    <td>${esc(u.mobile||'-')}</td><td>${esc(u.email||'-')}</td><td>${u.vendorId||'-'}</td>
    <td><span class="badge ${u.hasApiKeys?'green':'red'}">${u.hasApiKeys?'연결':'미연결'}</span></td>
    <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ko') : '-'}</td>
  </tr>`).join('') : '<tr><td colspan="8" class="empty"><p>등록된 셀러 없음</p></td></tr>';
}

// =============================================
//  ADMIN: 통합 발주서
// =============================================
function initAdminPO() { $('btn-a-load-po').onclick = loadPO; }
async function loadPO() {
  const btn = $('btn-a-load-po'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await get('/admin/purchase-order');
    if (d.success) {
      const po = d.purchaseOrder||{};
      const keys = Object.keys(po);
      $('a-po-content').innerHTML = keys.length ? keys.map(sid => {
        const g = po[sid]; const sup = g.supplier;
        return `<div class="card" style="margin-top:16px"><div class="card-header"><h3>${esc(sup?.name||'알 수 없음')}</h3><span class="badge blue">${g.items.length}개</span></div>
          <table class="tbl"><thead><tr><th>셀러</th><th>상품명</th><th>옵션</th><th>판매가</th><th>원가</th></tr></thead>
          <tbody>${g.items.map(it => `<tr><td>${esc(it.userId||'-')}</td><td>${esc(it.productName)}</td><td>${esc(it.option||'-')}</td><td>${it.salePrice?it.salePrice.toLocaleString()+'원':'-'}</td><td>${it.costPrice?it.costPrice.toLocaleString()+'원':'-'}</td></tr>`).join('')}</tbody></table></div>`;
      }).join('') : '<div class="card" style="margin-top:16px;padding:40px;text-align:center;color:#999">매핑된 상품이 없습니다.</div>';
    }
  } catch { toast('실패'); }
  btn.disabled = false; btn.textContent = '발주서 생성';
}

// =============================================
//  ADMIN: 송장 일괄 등록
// =============================================
function initAdminInvoice() {
  $('a-inv-file').onchange = onAdminInvFile;
  $('btn-a-apply-inv').onclick = applyAdminInv;
}
async function onAdminInvFile(e) {
  const file = e.target.files[0]; if (!file) return;
  $('a-inv-fname').textContent = file.name;
  const fd = new FormData(); fd.append('file', file);
  try {
    const d = await fetchRaw(`${API}/invoice/parse-excel`, { method: 'POST', body: fd });
    if (d.success && d.data.length) {
      $('a-inv-result').classList.remove('hidden');
      $('a-inv-result').dataset.parsed = JSON.stringify(d.data);
      $('a-inv-body').innerHTML = d.data.map(row => `<tr>
        <td>${esc(row.receiverName||'-')}</td><td><code>${esc(row.orderId||'-')}</code></td>
        <td>${esc(row.productName||'-')}</td><td><code>${esc(row.invoiceNumber||'-')}</code></td>
        <td><span class="badge ${row.invoiceNumber?'green':'orange'}">${row.invoiceNumber?'준비':'없음'}</span></td>
      </tr>`).join('');
      toast(`${d.data.length}건 파싱`);
    } else toast('데이터 없음');
  } catch { toast('파싱 실패'); }
  e.target.value = '';
}
async function applyAdminInv() {
  const ps = $('a-inv-result').dataset.parsed;
  if (!ps) return toast('먼저 엑셀 업로드');
  const parsed = JSON.parse(ps).filter(r => r.invoiceNumber && r.orderId);
  if (!parsed.length) return toast('송장 데이터 없음');
  const btn = $('btn-a-apply-inv'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  const courier = $('a-inv-courier').value;
  const users = await get('/admin/users');
  const sellers = (users.users||[]).filter(u => u.role === 'seller' && u.hasApiKeys);
  let ts = 0, tf = 0;
  for (const seller of sellers) {
    try {
      const d = await post('/admin/invoice-for-seller', { sellerUid: seller.uid, invoices: parsed.map(r => ({ shipmentBoxId: r.orderId, invoiceNumber: r.invoiceNumber, deliveryCompanyCode: courier })), deliveryCompanyCode: courier });
      if (d.success) { ts += d.summary.success; tf += d.summary.fail; }
    } catch { tf += parsed.length; }
  }
  toast(`성공: ${ts}, 실패: ${tf}`);
  btn.disabled = false; btn.textContent = '전체 송장 등록 실행';
}

// =============================================
//  ADMIN: 체험단 취합 / 카톡
// =============================================
function initAdminReview() {
  $('btn-a-kakao').onclick = copyKakao;
  $('btn-a-sent').onclick = markSent;
  $('a-rv-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#a-rv-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); adminReqFilter = c.dataset.s; renderAdminReview();
  };
}
function renderAdminReview() {
  const f = adminReqFilter === 'all' ? allRequests : allRequests.filter(r => r.status === adminReqFilter);
  const bc = s => s === '대기중' ? 'orange' : s === '완료' ? 'green' : 'blue';
  $('a-rv-body').innerHTML = f.length ? f.map(r => `<tr>
    <td>${esc(r.seller||'-')}</td><td>${esc(r.productName||'-')}</td><td>${esc(r.keyword||'-')}</td>
    <td>${r.totalCount||0}</td><td>${r.dailyCount||0}</td>
    <td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td>
    <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko') : '-'}</td>
  </tr>`).join('') : '<tr><td colspan="7" class="empty"><p>체험단 신청이 없습니다</p></td></tr>';
}
async function copyKakao() {
  try {
    const d = await get('/review/export');
    if (d.success && d.text && d.count) {
      copyToClipboard(d.text);
      $('a-kakao-box').classList.remove('hidden');
      $('a-kakao-box').innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.8">${esc(d.text)}</pre>`;
      toast(`${d.count}건 카톡 양식 복사 완료!`);
    } else toast('대기중인 요청 없음');
  } catch { toast('실패'); }
}
async function markSent() {
  const pending = allRequests.filter(r => r.status === '대기중');
  if (!pending.length) return toast('대기중 없음');
  for (const rq of pending) try { await post('/review/update-status', { id: rq.id, status: '진행중' }); } catch {}
  toast(`${pending.length}건 진행중 처리`); await loadAdminDash();
}

// =============================================
//  ADMIN: 체험단 송장
// =============================================
function initAdminRvInvoice() {
  $('a-rvinv-file').onchange = onAdminRvInvFile;
  $('btn-a-apply-rvinv').onclick = applyAdminRvInv;
}
async function onAdminRvInvFile(e) {
  const file = e.target.files[0]; if (!file) return;
  $('a-rvinv-fname').textContent = file.name;
  const fd = new FormData(); fd.append('file', file);
  try {
    const d = await fetchRaw(`${API}/invoice/parse-excel`, { method: 'POST', body: fd });
    if (d.success && d.data.length) {
      $('a-rvinv-result').classList.remove('hidden');
      $('a-rvinv-result').dataset.parsed = JSON.stringify(d.data);
      $('a-rvinv-body').innerHTML = d.data.map(row => `<tr>
        <td>${esc(row.receiverName||'-')}</td><td><code>${esc(row.orderId||'-')}</code></td>
        <td><code>${esc(row.invoiceNumber||'-')}</code></td>
        <td><span class="badge ${row.invoiceNumber?'green':'orange'}">${row.invoiceNumber?'준비':'없음'}</span></td>
      </tr>`).join('');
      toast(`${d.data.length}건 파싱`);
    }
  } catch { toast('파싱 실패'); }
  e.target.value = '';
}
async function applyAdminRvInv() {
  const ps = $('a-rvinv-result').dataset.parsed;
  if (!ps) return toast('먼저 엑셀 업로드');
  const parsed = JSON.parse(ps).filter(r => r.invoiceNumber && r.orderId);
  if (!parsed.length) return toast('송장 데이터 없음');
  const btn = $('btn-a-apply-rvinv'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  const courier = $('a-rvinv-courier').value;
  const users = await get('/admin/users');
  const sellers = (users.users||[]).filter(u => u.role === 'seller' && u.hasApiKeys);
  let ts = 0, tf = 0;
  for (const seller of sellers) {
    try {
      const d = await post('/admin/invoice-for-seller', { sellerUid: seller.uid, invoices: parsed.map(r => ({ shipmentBoxId: r.orderId, invoiceNumber: r.invoiceNumber, deliveryCompanyCode: courier })), deliveryCompanyCode: courier });
      if (d.success) { ts += d.summary.success; tf += d.summary.fail; }
    } catch { tf += parsed.length; }
  }
  toast(`체험단 송장: 성공 ${ts}, 실패 ${tf}`);
  btn.disabled = false; btn.textContent = '체험단 송장 등록 실행';
}

// =============================================
//  UTILS
// =============================================
function $(id) { return document.getElementById(id); }
async function post(path, body) { return (await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
async function get(path) { return (await fetch(`${API}${path}`)).json(); }
async function fetchRaw(url, opts) { return (await fetch(url, opts)).json(); }
function toast(m) { const e = $('toast'); $('toast-msg').textContent = m; e.classList.remove('hidden'); clearTimeout(window._t); window._t = setTimeout(() => e.classList.add('hidden'), 3000); }
function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function copyToClipboard(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => fbCopy(t)); else fbCopy(t); }
function fbCopy(t) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); document.body.removeChild(a); }
