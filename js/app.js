// ============================================
//  Sellio — 최종 통합 버전
// ============================================
const API = location.origin + '/api';
let currentUser = null, products = [], orders = [], reviewTags = new Set();
let orderTypeFilter = 'all', suppliers = [], mappings = [], supplierProducts = {};
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
  // 회원가입 역할 탭
  document.querySelectorAll('.reg-role-tab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.reg-role-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $('reg-role-val').value = tab.dataset.role;
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
  const role = $('reg-role-val').value || 'seller';
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
    initAdminNav(); initAdminDash(); initAdminPO(); initAdminInvoice(); initAdminReview(); initAdminRvInvoice(); initAdminSettings();
    initAdminDeposits(); initAdminOrderTracking();
    loadAdminDash(); loadSolapiConfig();
  } else {
    $('app-seller').classList.remove('hidden');
    $('s-name').textContent = currentUser.company || currentUser.loginId;
    $('s-avatar').textContent = (currentUser.company || currentUser.loginId || 'U')[0].toUpperCase();
    $('s-sub').textContent = '셀러';
    initSellerNav(); initProducts(); initReview(); initRvClassify(); initSettings(); initModal();
    initSellerWsCatalog(); initSellerOrders(); initSellerDeposit();
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
}

// ========================================
//  NAV + TABS
// ========================================
function initSellerNav() {
  document.querySelectorAll('#app-seller .nav-item').forEach(i => i.onclick = e => { e.preventDefault(); navTo(i.dataset.page); });
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
//  SELLER: 대시보드
// ========================================
function initSellerDash() {
  $('btn-s-dash-refresh').onclick = loadSellerDash;
}
async function loadSellerDash() {
  const k = getKeys();
  if (!k?.vendorId) {
    ['sd-accept','sd-instruct','sd-delivering','sd-delivered'].forEach(id => $(id).textContent = '-');
    $('sd-review').textContent = '-'; $('sd-mapped').textContent = '-';
    return;
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
    const d = await post('/coupang/orders', { ...k, status: 'ALL', createdAtFrom: from, createdAtTo: today });
    if (d.success) {
      const o = d.orders || [];
      const cnt = s => o.filter(x => x.status === s).length;
      $('sd-accept').innerHTML = `${cnt('ACCEPT')}<small>건</small>`;
      $('sd-instruct').innerHTML = `${cnt('INSTRUCT')}<small>건</small>`;
      $('sd-delivering').innerHTML = `${cnt('DELIVERING')}<small>건</small>`;
      $('sd-delivered').innerHTML = `${cnt('FINAL_DELIVERY')}<small>건</small>`;
    }
  } catch {}
  try {
    const r = await get(`/review/list?userId=${currentUser.uid}`);
    $('sd-review').innerHTML = `${(r.requests||[]).length}<small>건</small>`;
  } catch {}
  try {
    const m = await get(`/mappings?userId=${currentUser.uid}`);
    $('sd-mapped').innerHTML = `${(m.mappings||[]).filter(x=>x.active!==false).length}<small>개</small>`;
  } catch {}
}

// ========================================
//  SELLER: 상품관리 (매핑 + 신청 버튼)
// ========================================
function initProducts() {
  $('btn-s-fetch').onclick = fetchProducts;
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

function renderProducts() {
  const q = ($('s-search').value||'').toLowerCase();
  const f = products.filter(p => !q || (p.name||'').toLowerCase().includes(q) || (p.option||'').toLowerCase().includes(q));
  $('s-prod-count').textContent = `${f.length}개`;
  // 공급처_옵션 형태의 select 생성
  let supOptHtml = '<option value="">공급처 옵션 선택</option>';
  suppliers.forEach(s => {
    if (s.products?.length) {
      supOptHtml += `<optgroup label="${esc(s.name)}">`;
      s.products.forEach((sp, idx) => {
        const val = `${s.id}__${idx}`;
        const label = `${s.name}_${sp.option}`;
        const priceStr = sp.price ? ` (₩${sp.price.toLocaleString()})` : '';
        supOptHtml += `<option value="${val}">${esc(label)}${priceStr}</option>`;
      });
      supOptHtml += '</optgroup>';
    } else {
      supOptHtml += `<option value="${s.id}__none">${esc(s.name)} (상품없음)</option>`;
    }
  });

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
      <td><select class="input-sm mapping-select" data-map="${pid}" style="width:100%">${supOptHtml}</select></td>
      <td style="text-align:center"><button class="btn-primary" style="padding:4px 12px;font-size:12px" data-rv="${i}">신청</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty"><p>상품 가져오기를 눌러주세요</p></td></tr>';

  // 기존 매핑값 세팅 (supplierOptionKey = "supplierId__optIdx")
  f.forEach(p => {
    const pid = String(p.vendorItemId||p.sellerProductId);
    const map = mappings.find(m => m.productId===pid);
    if (map?.supplierOptionKey) {
      const sel = document.querySelector(`[data-map="${pid}"]`);
      if (sel) sel.value = map.supplierOptionKey;
    }
  });

  // 이벤트 바인딩
  document.querySelectorAll('[data-toggle]').forEach(cb => cb.onchange = async () => {
    const pid = cb.dataset.toggle, map = mappings.find(m => m.productId===pid);
    if (map) { await post('/mapping/toggle', { userId: currentUser.uid, productId: pid, active: cb.checked }); map.active = cb.checked; }
    else { await post('/mapping/save', { userId: currentUser.uid, productId: pid, productName: cb.dataset.pname, optionId: cb.dataset.oid, option: cb.dataset.opt, salePrice: cb.dataset.sale, active: cb.checked }); await loadMappings(); }
  });
  document.querySelectorAll('.mapping-select').forEach(sel => sel.onchange = async () => {
    const pid = sel.dataset.map, p = products.find(x => String(x.vendorItemId||x.sellerProductId)===pid);
    if (!p) return;
    const val = sel.value; // "supplierId__optIdx"
    if (!val) return;
    const [supId, optIdx] = val.split('__');
    const sup = suppliers.find(s => String(s.id) === supId);
    const supProduct = sup?.products?.[parseInt(optIdx)];
    const supplierLabel = sup && supProduct ? `${sup.name}_${supProduct.option}` : sup?.name || '';
    await post('/mapping/save', {
      userId: currentUser.uid, productId: pid, productName: p.name, optionId: p.optionId||'', option: p.option||'',
      salePrice: p.salePrice||0, supplierId: supId, supplierName: supplierLabel,
      supplierOptionKey: val, costPrice: supProduct?.price||0, active: true
    });
    await loadMappings(); toast('매핑 저장: ' + supplierLabel);
  });
  // 신청 버튼
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
  // 오전 9시 이전 경고 (매핑 완료 상품은 실주문으로 처리될 수 있음)
  const nowH = new Date().getHours();
  if (nowH < 9) {
    if (!confirm(`⚠️ 주의: 현재 오전 ${nowH}시입니다.\n매핑 완료 상품의 경우 오전 9시 이전 체험단 주문은 실제 발주로 처리될 수 있습니다.\n계속 진행하시겠습니까?`)) return;
  }
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

// ========================================
//  SELLER: 주문분류 (체험단 주문정보 → 결제완료 매칭 → 상품준비중 승인)
// ========================================
let rvClassParsed = [];
function initRvClassify() {
  $('s-rvclass-file').onchange = onRvClassFile;
  $('btn-s-rvclass-match').onclick = doRvClassMatch;
}
function onRvClassFile(e) {
  const file = e.target.files[0]; if (!file) return;
  $('s-rvclass-fname').textContent = file.name;
  $('btn-s-rvclass-match').disabled = false;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      rvClassParsed = rows.map(row => {
        const keys = Object.keys(row);
        const find = (...pats) => { const k = keys.find(k => pats.some(p => k.includes(p))); return k ? String(row[k]).trim() : ''; };
        let orderId = find('주문번호', '주문');
        // 주문번호 앞의 "/" 제거
        if (orderId.startsWith('/')) orderId = orderId.substring(1);
        return {
          orderId,
          productName: find('품명', '상품명'),
          buyerName: find('주문자이름', '주문자', '이름'),
          phone: find('연락가능한번호', '연락처'),
          address: find('배송지주소', '주소'),
        };
      }).filter(r => r.orderId || r.buyerName);
      toast(`${rvClassParsed.length}건 파싱`);
    } catch { toast('파싱 실패'); }
  };
  reader.readAsArrayBuffer(file); e.target.value = '';
}
async function doRvClassMatch() {
  if (!rvClassParsed.length) return toast('파일 먼저 업로드');
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-rvclass-match'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 매칭 중...';
  try {
    // 결제완료 주문 조회
    const from = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    const d = await post('/coupang/orders', { ...k, status: 'ACCEPT', createdAtFrom: from, createdAtTo: to });
    const acceptOrders = d.success ? d.orders : [];

    // 매칭
    const matched = rvClassParsed.map(row => {
      let o = null;
      if (row.orderId) o = acceptOrders.find(x => String(x.orderId) === row.orderId || String(x.shipmentBoxId) === row.orderId);
      if (!o && row.buyerName) o = acceptOrders.find(x => x.receiverName === row.buyerName);
      return { ...row, order: o, matched: !!o };
    });

    // 결과 표시
    $('s-rvclass-placeholder').classList.add('hidden');
    $('s-rvclass-result').classList.remove('hidden');

    const matchedList = matched.filter(r => r.matched);
    $('s-rvclass-body').innerHTML = matched.map(r => `<tr>
      <td><code>${r.order?.orderId || r.orderId || '-'}</code></td>
      <td>${esc(r.productName || r.order?.productName || '-')}</td>
      <td>${esc(r.buyerName || r.order?.receiverName || '-')}</td>
      <td><span class="badge ${r.matched ? 'green' : 'red'}">${r.matched ? 'O' : 'X'}</span></td>
      <td>-</td>
    </tr>`).join('');
    $('s-rvclass-summary').innerHTML = `<span>매칭: ${matchedList.length}/${matched.length}건</span>`;

    // 매칭된 건 자동 승인 (결제완료 → 상품준비중)
    if (matchedList.length > 0) {
      const boxIds = matchedList.map(r => String(r.order.shipmentBoxId)).filter(Boolean);
      if (boxIds.length) {
        const approveRes = await post('/coupang/approve-orders', { ...k, shipmentBoxIds: boxIds });
        if (approveRes.success) {
          // 승인 결과 반영
          $('s-rvclass-body').innerHTML = matched.map(r => {
            const ar = r.matched && approveRes.results ? approveRes.results.find(x => String(x.shipmentBoxId) === String(r.order?.shipmentBoxId)) : null;
            return `<tr>
              <td><code>${r.order?.orderId || r.orderId || '-'}</code></td>
              <td>${esc(r.productName || r.order?.productName || '-')}</td>
              <td>${esc(r.buyerName || r.order?.receiverName || '-')}</td>
              <td><span class="badge ${r.matched ? 'green' : 'red'}">${r.matched ? 'O' : 'X'}</span></td>
              <td><span class="badge ${ar?.success ? 'green' : r.matched ? 'red' : 'gray'}">${ar?.success ? '승인' : r.matched ? '실패' : '-'}</span></td>
            </tr>`;
          }).join('');
          $('s-rvclass-summary').innerHTML = `<span>매칭: ${matchedList.length}/${matched.length}건 | 승인 성공: ${approveRes.summary.success} / 실패: ${approveRes.summary.fail}</span>`;
          // 승인된 주문을 체험단 태그에 추가
          matchedList.forEach(r => { if (r.order?.orderId) reviewTags.add(String(r.order.orderId)); });
          await saveTags();
          toast(`승인 완료: 성공 ${approveRes.summary.success}건`);
        } else {
          toast('승인 API 실패');
        }
      }
    } else {
      toast('매칭된 주문이 없습니다');
    }
  } catch (e) { console.error(e); toast('주문 조회 실패'); }
  btn.disabled = false; btn.innerHTML = '매칭 + 승인';
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
  $('btn-s-req-submit').onclick = submitSupReq;
  loadSupReqs();
}
async function submitSupReq() {
  const name = $('s-req-name').value.trim(), url = $('s-req-url').value.trim();
  if (!name) return toast('공급처명 입력'); if (!url) return toast('스프레드시트 URL 입력');
  try { const d = await post('/supplier-request/save', { userId: currentUser.uid, seller: currentUser.company||currentUser.loginId, name, url }); if (d.success) { toast('요청 완료'); $('s-req-name').value=''; $('s-req-url').value=''; loadSupReqs(); } } catch { toast('실패'); }
}
async function loadSupReqs() {
  if (!currentUser) return;
  try {
    const d = await get(`/supplier-request/list?userId=${currentUser.uid}`);
    if (d.success) {
      const list = d.requests||[];
      const bc = s => s==='대기중'?'orange':s==='승인'?'green':'blue';
      $('s-req-body').innerHTML = list.length ? list.map(r => `<tr><td>${esc(r.name)}</td><td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td><td>${r.productCount||'-'}</td><td>${r.createdAt?new Date(r.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="4" class="empty"><p>등록된 공급처 없음</p></td></tr>';
    }
  } catch {}
}

// ========================================
//  ADMIN
// ========================================
function initAdminDash() { $('btn-a-refresh').onclick = loadAdminDash; }
let allSupReqs = [];
async function loadAdminDash() {
  try {
    const [uR, rR, sR, mR, srR] = await Promise.all([get('/admin/users'), get('/admin/all-requests'), get('/suppliers'), get('/admin/all-mappings'), get('/admin/supplier-requests')]);
    allUsers = (uR.users||[]).filter(u => u.role === 'seller'); allRequests = rR.requests||[]; allSuppliers = sR.suppliers||[]; allMappings = mR.mappings||[]; allSupReqs = srR.requests||[];
    $('ad-sellers').innerHTML = `${allUsers.length}<small>명</small>`;
    $('ad-sup-req').innerHTML = `${allSupReqs.filter(r=>r.status==='대기중').length}<small>건</small>`;
    $('ad-suppliers').innerHTML = `${allSuppliers.length}<small>개</small>`;
    $('ad-pending').innerHTML = `${allRequests.filter(r=>r.status==='대기중').length}<small>건</small>`;
    $('ad-mappings').innerHTML = `${allMappings.length}<small>건</small>`;
    renderAdminSellers(); renderAdminReview(); renderAdminSupReqs();
  } catch (e) { console.error(e); }
}
function renderAdminSellers() {
  $('a-sellers-body').innerHTML = allUsers.length ? allUsers.map(u => `<tr><td>${esc(u.loginId)}</td><td>${esc(u.company||'-')}</td><td>${esc(u.ceo||'-')}</td><td>${esc(u.mobile||'-')}</td><td>${esc(u.email||'-')}</td><td>${u.vendorId||'-'}</td><td><span class="badge ${u.hasApiKeys?'green':'red'}">${u.hasApiKeys?'연결':'미연결'}</span></td><td>${u.createdAt?new Date(u.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="8" class="empty"><p>셀러 없음</p></td></tr>';
}
// ===== 통합 발주서 =====
let poStatusFilter = 'all';
let poChecked = new Set();

function initAdminPO() {
  initCoupangExcelUpload();
  // 상태 필터 칩
  document.querySelectorAll('#a-po-status-chips .chip').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#a-po-status-chips .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      poStatusFilter = btn.dataset.s;
      loadPoOrders();
    };
  });

  // 검색 버튼
  $('btn-a-po-filter').onclick = () => loadPoOrders();

  // 주문 불러오기 (쿠팡 API 호출)
  $('btn-a-po-refresh').onclick = async () => {
    const btn = $('btn-a-po-refresh');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 불러오는 중...';
    try {
      const d = await post('/admin/fetch-mapped-orders', {});
      if (d.success) {
        toast(`${d.saved}건 새로 수집 (총 ${d.total}건)${d.errors?.length ? ' / 오류:' + d.errors.length : ''}`);
        await loadPoOrders();
      } else { toast(d.message || '실패'); }
    } catch (e) { toast('오류: ' + e.message); }
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> 주문 불러오기';
  };

  // 선택 엑셀 다운로드
  $('btn-a-po-excel-all').onclick = () => downloadPoExcel([...poChecked]);

  loadPoOrders();
}

async function loadPoOrders() {
  const content = $('a-po-content');
  content.innerHTML = '<div style="padding:40px;text-align:center"><span class="spinner"></span></div>';
  poChecked.clear();
  try {
    const qs = new URLSearchParams();
    if (poStatusFilter !== 'all') qs.set('supplyStatus', poStatusFilter);
    const from = $('a-po-from').value, to = $('a-po-to').value;
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const d = await fetchRaw(`${API}/admin/normalized-orders?${qs}`);
    if (!d.success) { content.innerHTML = '<div class="card" style="padding:40px;text-align:center;color:#999">불러오기 실패</div>'; return; }
    const orders = d.orders || [];
    if (!orders.length) { content.innerHTML = '<div class="card" style="margin-top:4px;padding:40px;text-align:center;color:#999">주문 없음 — "주문 불러오기"를 눌러주세요</div>'; $('btn-a-po-excel-all').classList.add('hidden'); return; }

    // 거래처별 그룹핑
    const grouped = {};
    orders.forEach(o => {
      const key = o.supplierId || 'unknown';
      if (!grouped[key]) grouped[key] = { name: o.supplierName || '거래처 미지정', items: [] };
      grouped[key].items.push(o);
    });

    content.innerHTML = Object.entries(grouped).map(([sid, g]) => `
      <div class="card" style="margin-top:16px">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:10px">
            <h3>${esc(g.name)}</h3>
            <span class="badge blue">${g.items.length}건</span>
          </div>
          <div class="btn-row" style="gap:8px">
            <button class="btn-outline btn-sm" onclick="markPoStatus('${sid}', '발주완료')">발주완료 처리</button>
            <button class="btn-primary btn-sm" onclick="downloadPoExcelBySupplier('${sid}', '${esc(g.name)}')">엑셀 다운로드</button>
          </div>
        </div>
        <table class="tbl">
          <thead><tr>
            <th><input type="checkbox" onchange="togglePoGroup('${sid}', this.checked)"></th>
            <th>상태</th><th>주문자명</th><th>상품명(옵션포함)</th><th>수량</th>
            <th>받는분</th><th>받는분 전화</th><th>받는분 주소</th><th>배송메시지</th><th>주문일</th>
          </tr></thead>
          <tbody>${g.items.map(o => `
            <tr data-id="${o.id}" data-sid="${sid}">
              <td><input type="checkbox" class="po-chk" data-id="${o.id}" onchange="onPoChk(this)"></td>
              <td><span class="badge ${o.supplyStatus==='발주완료'?'green':'red'}">${esc(o.supplyStatus)}</span></td>
              <td>${esc(o.ordererName||'-')}</td>
              <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(o.productName)}">${esc(o.productName)}</td>
              <td style="text-align:center">${o.quantity}</td>
              <td>${esc(o.receiverName||'-')}</td>
              <td>${esc(o.receiverPhone||'-')}</td>
              <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(o.receiverAddress)}">${esc(o.receiverAddress||'-')}</td>
              <td>${esc(o.deliveryMessage||'-')}</td>
              <td>${o.orderDate?o.orderDate.slice(0,10):'-'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`).join('');

    $('btn-a-po-excel-all').classList.remove('hidden');
  } catch (e) { content.innerHTML = '<div class="card" style="padding:40px;text-align:center;color:#999">오류</div>'; console.error(e); }
}

function onPoChk(el) {
  if (el.checked) poChecked.add(el.dataset.id);
  else poChecked.delete(el.dataset.id);
  $('btn-a-po-excel-all').textContent = poChecked.size ? `선택(${poChecked.size}) 엑셀 다운로드` : '선택 엑셀 다운로드';
}

function togglePoGroup(sid, checked) {
  document.querySelectorAll(`.po-chk`).forEach(el => {
    const row = el.closest('tr');
    if (row && row.dataset.sid === sid) {
      el.checked = checked;
      if (checked) poChecked.add(el.dataset.id);
      else poChecked.delete(el.dataset.id);
    }
  });
  $('btn-a-po-excel-all').textContent = poChecked.size ? `선택(${poChecked.size}) 엑셀 다운로드` : '선택 엑셀 다운로드';
}

async function markPoStatus(sid, status) {
  const rows = document.querySelectorAll(`tr[data-sid="${sid}"]`);
  const ids = [...rows].map(r => r.dataset.id);
  if (!ids.length) return;
  try {
    const d = await post('/admin/normalized-orders/update-status', { ids, supplyStatus: status });
    if (d.success) { toast(`${ids.length}건 ${status} 처리`); await loadPoOrders(); }
  } catch { toast('실패'); }
}

async function downloadPoExcel(ids) {
  if (!ids.length) return toast('선택 없음');
  try {
    const res = await fetch(`${API}/admin/normalized-orders/export-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, supplierName: '선택' })
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `발주서_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  } catch { toast('다운로드 실패'); }
}

async function downloadPoExcelBySupplier(sid, name) {
  const rows = document.querySelectorAll(`tr[data-sid="${sid}"]`);
  const ids = [...rows].map(r => r.dataset.id);
  if (!ids.length) return toast('주문 없음');
  try {
    const res = await fetch(`${API}/admin/normalized-orders/export-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, supplierName: name })
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `발주서_${name}_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  } catch { toast('다운로드 실패'); }
}
// ===== 쿠팡 주문서 엑셀 업로드 테스트 =====
let parsedCoupangOrders = [];

function initCoupangExcelUpload() {
  $('a-po-excel-input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    $('a-po-excel-fname').textContent = file.name;
    $('btn-a-po-excel-download').classList.add('hidden');
    $('a-po-excel-preview').innerHTML = '<span class="spinner"></span> 파싱 중...';

    const fd = new FormData();
    fd.append('file', file);
    try {
      const d = await fetchRaw(`${API}/admin/parse-coupang-excel`, { method: 'POST', body: fd });
      if (!d.success) { toast(d.message || '파싱 실패'); $('a-po-excel-preview').innerHTML = ''; return; }
      parsedCoupangOrders = d.orders || [];
      toast(`${d.total}건 파싱 완료`);

      $('a-po-excel-preview').innerHTML = `
        <p style="font-size:13px;color:#666;margin-bottom:10px">총 <strong>${d.total}건</strong> 파싱됨 — 미리보기 (최대 5건)</p>
        <div style="overflow-x:auto">
        <table class="tbl" style="font-size:12px">
          <thead><tr>
            <th>주문자명</th><th>상품명(옵션포함)</th><th>수량</th>
            <th>받는분</th><th>받는분 전화</th><th>받는분 주소</th><th>배송메시지</th><th>주문번호</th>
          </tr></thead>
          <tbody>${parsedCoupangOrders.slice(0,5).map(o => `
            <tr>
              <td>${esc(o.ordererName||'-')}</td>
              <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(o.productName)}">${esc(o.productName||'-')}</td>
              <td style="text-align:center">${o.quantity}</td>
              <td>${esc(o.receiverName||'-')}</td>
              <td>${esc(o.receiverPhone||'-')}</td>
              <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(o.receiverAddress)}">${esc(o.receiverAddress||'-')}</td>
              <td>${esc(o.deliveryMessage||'-')}</td>
              <td style="font-size:11px"><code>${esc(o.orderId||'-')}</code></td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>`;
      $('btn-a-po-excel-download').classList.remove('hidden');
    } catch(err) { toast('오류: ' + err.message); $('a-po-excel-preview').innerHTML = ''; }
    e.target.value = '';
  };

  $('btn-a-po-excel-download').onclick = async () => {
    if (!parsedCoupangOrders.length) return toast('먼저 파일을 업로드하세요');
    try {
      const res = await fetch(`${API}/admin/excel-to-purchase-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: parsedCoupangOrders, supplierName: '거래처' })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `발주서_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast('발주서 다운로드 완료');
    } catch { toast('다운로드 실패'); }
  };
}

function initAdminInvoice() { $('a-inv-file').onchange = async e => { const file = e.target.files[0]; if (!file) return; $('a-inv-fname').textContent = file.name; const fd = new FormData(); fd.append('file', file); try { const d = await fetchRaw(`${API}/invoice/parse-excel`, { method: 'POST', body: fd }); if (d.success&&d.data.length) { $('a-inv-result').classList.remove('hidden'); $('a-inv-result').dataset.parsed = JSON.stringify(d.data); $('a-inv-body').innerHTML = d.data.map(r=>`<tr><td>${esc(r.receiverName||'-')}</td><td><code>${esc(r.orderId||'-')}</code></td><td>${esc(r.productName||'-')}</td><td><code>${esc(r.invoiceNumber||'-')}</code></td><td><span class="badge ${r.invoiceNumber?'green':'orange'}">${r.invoiceNumber?'준비':'없음'}</span></td></tr>`).join(''); toast(`${d.data.length}건`); } } catch { toast('파싱 실패'); } e.target.value = ''; };
  $('btn-a-apply-inv').onclick = async () => { const ps=$('a-inv-result').dataset.parsed; if (!ps) return toast('엑셀 먼저'); const parsed=JSON.parse(ps).filter(r=>r.invoiceNumber&&r.orderId); if (!parsed.length) return toast('송장 없음'); const btn=$('btn-a-apply-inv'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; const courier=$('a-inv-courier').value, users=await get('/admin/users'), sellers=(users.users||[]).filter(u=>u.role==='seller'&&u.hasApiKeys); let ts=0,tf=0; for (const s of sellers) { try { const d=await post('/admin/invoice-for-seller',{sellerUid:s.uid,invoices:parsed.map(r=>({shipmentBoxId:r.orderId,invoiceNumber:r.invoiceNumber,deliveryCompanyCode:courier})),deliveryCompanyCode:courier}); if(d.success){ts+=d.summary.success;tf+=d.summary.fail;} } catch{tf+=parsed.length;} } toast(`성공:${ts} 실패:${tf}`); btn.disabled=false; btn.textContent='전체 송장 등록 실행'; }; }
let kakaoText = '';
function initAdminReview() {
  // 양식 복사
  $('btn-a-kakao').onclick = async () => {
    try {
      const d = await get('/review/export');
      if (d.success && d.text && d.count) {
        kakaoText = d.text;
        copyToClipboard(d.text);
        $('a-kakao-box').classList.remove('hidden');
        $('a-kakao-box').innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.8">${esc(d.text)}</pre>`;
        toast(`${d.count}건 카톡 복사!`);
      } else toast('대기중 없음');
    } catch { toast('실패'); }
  };
  // 카톡 발송 패널 열기
  $('btn-a-kakao-send').onclick = async () => {
    try {
      const d = await get('/review/export');
      if (!d.success || !d.text || !d.count) return toast('대기중인 체험단 신청이 없습니다');
      kakaoText = d.text;
      $('a-kakao-text').value = d.text;
      $('a-kakao-send-panel').classList.remove('hidden');
    } catch { toast('실패'); }
  };
  // 닫기
  $('btn-a-kakao-cancel').onclick = () => $('a-kakao-send-panel').classList.add('hidden');
  // 발송 실행
  $('btn-a-kakao-confirm').onclick = async () => {
    const to = $('a-kakao-to').value.trim();
    const text = $('a-kakao-text').value.trim();
    const type = $('a-kakao-type').value;
    if (!to) return toast('수신번호를 입력해주세요');
    if (!text) return toast('발송 내용이 없습니다');
    const btn = $('btn-a-kakao-confirm');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 발송 중...';
    try {
      const d = await post('/admin/solapi/send', { to, text, type });
      if (d.success) {
        toast('발송 완료!');
        $('a-kakao-send-panel').classList.add('hidden');
      } else {
        toast('발송 실패: ' + (d.message || ''));
      }
    } catch { toast('서버 연결 실패'); }
    btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg> 발송하기';
  };
  // 전달완료 처리
  $('btn-a-sent').onclick = async () => {
    const p = allRequests.filter(r => r.status === '대기중');
    if (!p.length) return toast('대기중 없음');
    for (const rq of p) try { await post('/review/update-status', { id: rq.id, status: '진행중' }); } catch {}
    toast(`${p.length}건 진행중`);
    await loadAdminDash();
  };
  // 필터
  $('a-rv-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#a-rv-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); adminReqFilter = c.dataset.s; renderAdminReview();
  };
}
function renderAdminReview() {
  const f = adminReqFilter==='all' ? allRequests : allRequests.filter(r=>r.status===adminReqFilter);
  const bc = s => s==='대기중'?'orange':s==='완료'?'green':'blue';
  $('a-rv-body').innerHTML = f.length ? f.map(r=>`<tr><td>${esc(r.seller||'-')}</td><td>${esc(r.productName||'-')}</td><td>${esc(r.keyword||'-')}</td><td>${r.totalCount||0}</td><td>${r.dailyCount||0}</td><td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td><td>${r.createdAt?new Date(r.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="7" class="empty"><p>체험단 없음</p></td></tr>';
}
function initAdminRvInvoice() {
  const today = new Date().toISOString().split('T')[0];
  const from30 = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
  $('a-cls-from').value = from30; $('a-cls-to').value = today;
  $('a-inv-from').value = from30; $('a-inv-to').value = today;
  loadAdminRvSellerOptions();
  $('btn-a-cls-fetch').onclick = fetchAdminClsOrders;
  $('a-cls-check-all').onclick = e => document.querySelectorAll('#a-cls-body input[type=checkbox]').forEach(c => c.checked = e.target.checked);
  $('btn-a-cls-approve').onclick = approveAdminClsOrders;
  $('btn-a-inv-fetch').onclick = fetchAdminInvOrders;
  $('btn-a-inv-apply').onclick = applyAdminInvoices;
}
async function loadAdminRvSellerOptions() {
  try {
    const d = await get('/admin/users');
    const sellers = (d.users || []).filter(u => u.role === 'seller' && u.hasApiKeys);
    const opts = '<option value="">셀러를 선택하세요</option>' + sellers.map(u => `<option value="${u.uid}">${esc(u.company || u.loginId)}</option>`).join('');
    $('a-cls-seller').innerHTML = opts;
    $('a-inv-seller').innerHTML = opts;
  } catch {}
}
async function fetchAdminClsOrders() {
  const sellerUid = $('a-cls-seller').value;
  if (!sellerUid) return toast('셀러를 선택하세요');
  const btn = $('btn-a-cls-fetch'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 조회 중...';
  try {
    const d = await post('/admin/orders-for-seller', { sellerUid, status: 'ACCEPT', createdAtFrom: $('a-cls-from').value, createdAtTo: $('a-cls-to').value });
    $('a-cls-result').classList.remove('hidden');
    $('a-cls-summary').textContent = `${d.total || 0}건`;
    $('a-cls-body').innerHTML = d.orders?.length
      ? d.orders.map(o => `<tr>
          <td style="text-align:center"><input type="checkbox" data-boxid="${o.shipmentBoxId}"></td>
          <td><code style="font-size:12px">${o.orderId || '-'}</code></td>
          <td style="max-width:220px">${esc(o.productName || '-')}</td>
          <td>${esc(o.receiverName || '-')}</td>
          <td>${o.orderDate ? new Date(o.orderDate).toLocaleString('ko') : '-'}</td>
          <td id="cls-result-${o.shipmentBoxId}">-</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="empty"><p>결제완료 주문 없음</p></td></tr>';
    toast(d.orders?.length ? `${d.orders.length}건 조회` : '결제완료 주문 없음');
  } catch { toast('조회 실패'); }
  btn.disabled = false; btn.textContent = '결제완료 주문 조회';
}
async function approveAdminClsOrders() {
  const sellerUid = $('a-cls-seller').value;
  if (!sellerUid) return toast('셀러를 선택하세요');
  const checked = [...document.querySelectorAll('#a-cls-body input[type=checkbox]:checked')];
  if (!checked.length) return toast('승인할 주문을 선택하세요');
  if (!confirm(`${checked.length}건을 체험단 주문으로 승인하시겠습니까?`)) return;
  const btn = $('btn-a-cls-approve'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await post('/admin/approve-orders-for-seller', { sellerUid, shipmentBoxIds: checked.map(c => c.dataset.boxid) });
    if (d.success) {
      d.results.forEach(r => { const cell = $(`cls-result-${r.shipmentBoxId}`); if (cell) cell.innerHTML = `<span class="badge ${r.success ? 'green' : 'red'}">${r.success ? '승인' : '실패'}</span>`; });
      toast(`승인 완료: 성공 ${d.summary.success} / 실패 ${d.summary.fail}`);
    }
  } catch { toast('승인 실패'); }
  btn.disabled = false; btn.textContent = '선택 승인 (체험단)';
}
async function fetchAdminInvOrders() {
  const sellerUid = $('a-inv-seller').value;
  if (!sellerUid) return toast('셀러를 선택하세요');
  const btn = $('btn-a-inv-fetch'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 조회 중...';
  try {
    const d = await post('/admin/orders-for-seller', { sellerUid, status: 'INSTRUCT', createdAtFrom: $('a-inv-from').value, createdAtTo: $('a-inv-to').value });
    $('a-inv-result').classList.remove('hidden');
    $('a-inv-summary').textContent = `${d.total || 0}건 (송장번호 입력 후 등록하세요)`;
    $('a-inv-body').innerHTML = d.orders?.length
      ? d.orders.map(o => `<tr>
          <td><code style="font-size:12px">${o.orderId || '-'}</code></td>
          <td style="max-width:200px">${esc(o.productName || '-')}</td>
          <td>${esc(o.receiverName || '-')}</td>
          <td>${o.orderDate ? new Date(o.orderDate).toLocaleString('ko') : '-'}</td>
          <td><input type="text" placeholder="송장번호" data-boxid="${o.shipmentBoxId}" class="a-inv-input" style="width:100%;padding:6px 10px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font)"></td>
          <td id="inv-result-${o.shipmentBoxId}">-</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="empty"><p>상품준비중 주문 없음</p></td></tr>';
    toast(d.orders?.length ? `${d.orders.length}건 조회` : '상품준비중 주문 없음');
  } catch { toast('조회 실패'); }
  btn.disabled = false; btn.textContent = '상품준비중 주문 조회';
}
async function applyAdminInvoices() {
  const sellerUid = $('a-inv-seller').value;
  if (!sellerUid) return toast('셀러를 선택하세요');
  const courier = $('a-inv-courier').value;
  const invoices = [...document.querySelectorAll('#a-inv-body .a-inv-input')]
    .filter(i => i.value.trim())
    .map(i => ({ shipmentBoxId: i.dataset.boxid, invoiceNumber: i.value.trim(), deliveryCompanyCode: courier }));
  if (!invoices.length) return toast('송장번호를 입력하세요');
  const btn = $('btn-a-inv-apply'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await post('/admin/invoice-for-seller', { sellerUid, invoices, deliveryCompanyCode: courier });
    if (d.success) {
      d.results.forEach(r => { const cell = $(`inv-result-${r.shipmentBoxId}`); if (cell) cell.innerHTML = `<span class="badge ${r.success ? 'green' : 'red'}">${r.success ? '등록' : '실패'}</span>`; });
      toast(`송장 등록: 성공 ${d.summary.success} / 실패 ${d.summary.fail}`);
    }
  } catch { toast('실패'); }
  btn.disabled = false; btn.textContent = '송장 일괄 등록';
}

// ========================================
//  ADMIN: 설정 (솔라피)
// ========================================
function initAdminSettings() {
  $('btn-a-sol-save').onclick = async () => {
    const apiKey = $('a-sol-key').value.trim();
    const apiSecret = $('a-sol-secret').value.trim();
    const senderNumber = $('a-sol-sender').value.trim();
    const pfId = $('a-sol-pfid').value.trim();
    if (!apiKey || !apiSecret) return toast('API Key, API Secret 필요');
    if (!senderNumber) return toast('발신번호 필요');
    const btn = $('btn-a-sol-save'); btn.disabled = true; btn.textContent = '저장 중...';
    try {
      const d = await post('/admin/solapi/save-config', { apiKey, apiSecret, senderNumber, pfId });
      const msg = $('a-sol-msg');
      if (d.success) {
        msg.className = 'api-status success'; msg.textContent = '솔라피 설정 저장 완료!';
      } else {
        msg.className = 'api-status error'; msg.textContent = d.message || '저장 실패';
      }
      msg.classList.remove('hidden');
    } catch { toast('서버 연결 실패'); }
    btn.disabled = false; btn.textContent = '저장';
  };
  $('btn-a-sol-test').onclick = async () => {
    const sender = $('a-sol-sender').value.trim();
    if (!sender) return toast('발신번호를 먼저 입력해주세요');
    const to = prompt('테스트 수신번호를 입력하세요:', sender);
    if (!to) return;
    const btn = $('btn-a-sol-test'); btn.disabled = true; btn.textContent = '발송 중...';
    try {
      const d = await post('/admin/solapi/send', { to, text: '[Sellio] 솔라피 연동 테스트 메시지입니다.', type: 'LMS' });
      const msg = $('a-sol-msg');
      if (d.success) {
        msg.className = 'api-status success'; msg.textContent = '테스트 발송 성공!';
      } else {
        msg.className = 'api-status error'; msg.textContent = '발송 실패: ' + (d.message || '');
      }
      msg.classList.remove('hidden');
    } catch { toast('서버 연결 실패'); }
    btn.disabled = false; btn.textContent = '테스트 발송';
  };
}
async function loadSolapiConfig() {
  try {
    const d = await get('/admin/solapi/config');
    if (d.success && d.config) {
      if (d.config.apiKey) $('a-sol-key').value = d.config.apiKey;
      if (d.config.senderNumber) $('a-sol-sender').value = d.config.senderNumber;
      if (d.config.pfId) $('a-sol-pfid').value = d.config.pfId;
      if (d.config.configured) {
        $('a-sol-secret').placeholder = '설정됨 (변경 시 재입력)';
      }
    }
  } catch {}
}

// ========================================
//  ADMIN: 공급처 등록요청
// ========================================
let supReqFilter = 'all';
function initAdminSupReq() {
  $('btn-a-sup-refresh').onclick = async () => { await loadAdminDash(); toast('새로고침 완료'); };
  $('a-sup-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#a-sup-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); supReqFilter = c.dataset.s; renderAdminSupReqs();
  };
}
function renderAdminSupReqs() {
  const f = supReqFilter === 'all' ? allSupReqs : allSupReqs.filter(r => r.status === supReqFilter);
  const bc = s => s === '대기중' ? 'orange' : s === '승인' ? 'green' : s === '거절' ? 'red' : 'blue';
  $('a-sup-body').innerHTML = f.length ? f.map(r => `<tr>
    <td>${esc(r.seller || '-')}</td>
    <td><strong>${esc(r.name)}</strong></td>
    <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="${esc(r.url)}" target="_blank" style="color:var(--blue);text-decoration:none;font-size:13px">${esc(r.url||'-')}</a></td>
    <td style="text-align:center">${r.productCount || '-'}</td>
    <td><span class="badge ${bc(r.status)}">${esc(r.status)}</span></td>
    <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko') : '-'}</td>
    <td>${r.status === '대기중' ? `<div class="btn-row"><button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="approveSupReq(${r.id})">승인</button><button class="btn-danger-sm" onclick="rejectSupReq(${r.id})">거절</button></div>` : ''}</td>
  </tr>`).join('') : '<tr><td colspan="7" class="empty"><p>공급처 등록요청이 없습니다</p></td></tr>';
}
async function approveSupReq(id) {
  if (!confirm('이 공급처를 승인하시겠습니까?\n승인하면 스프레드시트에서 상품을 가져옵니다.')) return;
  try {
    const d = await post('/admin/supplier-request/approve', { id });
    if (d.success) { toast(`승인 완료! 상품 ${d.productCount}개 등록`); await loadAdminDash(); }
    else toast(d.message || '승인 실패');
  } catch { toast('서버 오류'); }
}
async function rejectSupReq(id) {
  if (!confirm('이 공급처 요청을 거절하시겠습니까?')) return;
  try {
    const d = await post('/admin/supplier-request/update', { id, status: '거절' });
    if (d.success) { toast('거절 처리 완료'); await loadAdminDash(); }
  } catch { toast('서버 오류'); }
}

// ========================================
//  공급처: 상품 리스트
// ========================================
let wsProducts = [], wsCatFilter = 'all', wsEditId = null;

function initWsProducts() {
  $('btn-ws-add-product').onclick = () => openWsProdModal();
  $('ws-prod-close').onclick = () => $('ws-prod-modal').classList.add('hidden');
  $('ws-prod-modal').onclick = e => { if (e.target === e.currentTarget) $('ws-prod-modal').classList.add('hidden'); };
  $('btn-ws-prod-save').onclick = saveWsProduct;
  $('ws-prod-search').oninput = renderWsProducts;
  $('ws-cat-tabs').onclick = e => {
    const tab = e.target.closest('.ws-cat-tab'); if (!tab) return;
    document.querySelectorAll('.ws-cat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active'); wsCatFilter = tab.dataset.cat; renderWsProducts();
  };
  $('ws-p-img-file').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      $('ws-p-img-preview').innerHTML = `<div class="image-preview"><img src="${ev.target.result}" alt=""><button type="button" class="image-remove-btn" onclick="clearWsProdImg()">&times;</button></div>`;
    };
    reader.readAsDataURL(file);
  };
  $('btn-ws-add-option').onclick = () => addWsOptionRow();
  $('btn-ws-excel-down').onclick = downloadWsExcel;
  $('btn-ws-excel-template').onclick = downloadWsTemplate;
  $('ws-excel-upload').onchange = uploadWsExcel;
  loadWsProducts();
}

function addWsOptionRow(name = '', price = '') {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;align-items:center';
  div.innerHTML = `<input type="text" placeholder="옵션명 (예: 3kg)" value="${esc(name)}" class="ws-opt-name" style="flex:1;padding:10px 12px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px;font-family:var(--font)"><input type="number" placeholder="가격 (원)" value="${price}" class="ws-opt-price" style="width:130px;padding:10px 12px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:14px;font-family:var(--font)"><button type="button" style="padding:6px 10px;background:var(--red-light);color:var(--red);border:none;border-radius:var(--radius-sm);cursor:pointer;font-size:16px">&times;</button>`;
  div.querySelector('button').onclick = () => div.remove();
  $('ws-p-options-list').appendChild(div);
}

function clearWsProdImg() {
  $('ws-p-img-file').value = '';
  $('ws-p-img-preview').innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg><span>이미지 업로드 (클릭)</span>';
}

async function loadWsProducts() {
  try {
    const d = await get('/ws/products');
    if (d.success) { wsProducts = d.products || []; renderWsCats(); renderWsProducts(); }
  } catch {}
}

function renderWsCats() {
  const cats = [...new Set(wsProducts.map(p => p.category).filter(Boolean))];
  const tabsHtml = '<button class="ws-cat-tab active" data-cat="all">전체보기</button>' +
    cats.map(c => `<button class="ws-cat-tab" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('ws-cat-tabs').innerHTML = tabsHtml;
}

function renderWsProducts() {
  const q = ($('ws-prod-search').value || '').toLowerCase();
  let f = wsProducts;
  if (wsCatFilter !== 'all') f = f.filter(p => p.category === wsCatFilter);
  if (q) f = f.filter(p => (p.name || '').toLowerCase().includes(q));
  $('ws-prod-total').textContent = `전체상품수 : ${f.length}개`;

  const getMinPrice = p => {
    if (Array.isArray(p.options) && p.options.length) return Math.min(...p.options.map(o => o.price || 0));
    return p.price || 0;
  };
  const getOptsText = p => {
    if (Array.isArray(p.options) && p.options.length) return p.options.map(o => `${o.name}: ₩${(o.price||0).toLocaleString()}`).join(' / ');
    return '';
  };

  $('ws-prod-grid').innerHTML = f.length ? f.map(p => `
    <div class="ws-prod-card" data-wsid="${p.id}">
      ${p.tax === '비과세' ? '<span class="ws-tax-badge">비과세</span>' : '<span class="ws-tax-badge" style="background:var(--blue)">과세</span>'}
      ${p.image ? `<img class="ws-prod-img" src="${esc(p.image)}" alt="${esc(p.name)}">` : '<div class="ws-prod-img-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg></div>'}
      <div class="ws-prod-info">
        <div class="ws-prod-name">${esc(p.name)}</div>
        <div class="ws-prod-price">공급가: <strong>₩${getMinPrice(p).toLocaleString()}~</strong></div>
        <div class="ws-prod-ship" style="font-size:12px;color:var(--gray-500)">${esc(getOptsText(p))}</div>
        <div class="ws-prod-ship">배송비: <strong>${esc(p.shipping || '수량별배송비')}</strong></div>
        <div class="ws-prod-ship">${esc(p.delivery || '')}</div>
      </div>
    </div>
  `).join('') : '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray-400)">등록된 상품이 없습니다. 상품을 등록해주세요.</div>';

  document.querySelectorAll('.ws-prod-card').forEach(c => c.onclick = () => {
    const id = parseInt(c.dataset.wsid);
    const p = wsProducts.find(x => x.id === id);
    if (p) openWsProdModal(p);
  });
}

function openWsProdModal(product) {
  wsEditId = product ? product.id : null;
  $('ws-prod-modal-title').textContent = product ? '상품 수정' : '상품 등록';
  $('btn-ws-prod-save').textContent = product ? '수정하기' : '등록하기';
  $('ws-p-name').value = product?.name || '';
  $('ws-p-cat').value = product?.category || '과일';
  $('ws-p-tax').value = product?.tax || '비과세';
  $('ws-p-ship').value = product?.shipping || '수량별배송비';
  $('ws-p-delivery').value = product?.delivery || '';
  $('ws-p-origin').value = product?.origin || '';
  $('ws-p-note').value = product?.note || '';
  $('ws-p-img-file').value = '';
  // 옵션 목록
  $('ws-p-options-list').innerHTML = '';
  if (Array.isArray(product?.options) && product.options.length) {
    product.options.forEach(o => addWsOptionRow(o.name || '', o.price || ''));
  } else if (product?.price) {
    addWsOptionRow('기본', product.price);
  } else {
    addWsOptionRow();
  }
  if (product?.image) {
    $('ws-p-img-preview').innerHTML = `<div class="image-preview"><img src="${esc(product.image)}" alt=""><button type="button" class="image-remove-btn" onclick="event.stopPropagation();clearWsProdImg()">&times;</button></div>`;
  } else { clearWsProdImg(); }
  $('ws-prod-modal').classList.remove('hidden');
}

async function saveWsProduct() {
  const name = $('ws-p-name').value.trim();
  if (!name) return toast('상품명 입력');

  // 옵션 수집
  const optRows = $('ws-p-options-list').querySelectorAll('div');
  const optionsArr = [];
  for (const row of optRows) {
    const oName = row.querySelector('.ws-opt-name')?.value?.trim();
    const oPrice = parseInt(row.querySelector('.ws-opt-price')?.value) || 0;
    if (oName && oPrice > 0) optionsArr.push({ name: oName, price: oPrice });
  }
  if (!optionsArr.length) return toast('옵션을 1개 이상 추가하세요 (옵션명 + 가격)');

  const btn = $('btn-ws-prod-save'); btn.disabled = true; btn.textContent = '저장 중...';
  const fd = new FormData();
  if (wsEditId) fd.append('id', wsEditId);
  fd.append('name', name);
  fd.append('category', $('ws-p-cat').value);
  fd.append('tax', $('ws-p-tax').value);
  fd.append('shipping', $('ws-p-ship').value);
  fd.append('options', JSON.stringify(optionsArr));
  fd.append('delivery', $('ws-p-delivery').value);
  fd.append('origin', $('ws-p-origin').value);
  fd.append('note', $('ws-p-note').value);

  const imgFile = $('ws-p-img-file').files[0];
  if (imgFile) {
    fd.append('image', imgFile);
  } else if (wsEditId) {
    const existing = wsProducts.find(p => p.id === wsEditId);
    if (existing?.image) fd.append('existingImage', existing.image);
  }

  try {
    const d = await fetchRaw(`${API}/ws/product/save`, { method: 'POST', body: fd });
    if (d.success) {
      toast(wsEditId ? '상품 수정 완료' : '상품 등록 완료');
      $('ws-prod-modal').classList.add('hidden');
      await loadWsProducts();
    } else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = wsEditId ? '수정하기' : '등록하기';
}

function downloadWsExcel() {
  if (!wsProducts.length) return toast('상품 없음');
  const data = wsProducts.map(p => {
    const opts = Array.isArray(p.options) ? p.options.map(o => `${o.name}:${o.price}`).join(', ') : '';
    return { '상품명': p.name, '카테고리': p.category, '과세구분': p.tax, '옵션(옵션명:가격)': opts, '배송비': p.shipping, '배송방법': p.delivery, '원산지': p.origin, '비고': p.note };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '상품');
  XLSX.writeFile(wb, `공급처_상품_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('엑셀 다운로드');
}

function downloadWsTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['상품명', '카테고리', '과세구분', '옵션(옵션명:가격)', '배송비', '배송방법', '원산지', '비고'],
    ['제주 한라봉', '과일', '비과세', '3kg:15000, 5kg:25000, 10kg:45000', '수량별배송비', '롯데택배 / 제주산간 불가', '국내산(제주)', '산지직송'],
    ['프리미엄 사과', '과일', '비과세', '5kg:30000, 10kg:55000', '무료배송', 'CJ대한통운', '국내산(경북)', ''],
  ]);
  ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 35 }, { wch: 14 }, { wch: 25 }, { wch: 15 }, { wch: 15 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '상품템플릿');
  XLSX.writeFile(wb, '공급처_상품_템플릿.xlsx');
  toast('템플릿 다운로드');
}

async function uploadWsExcel(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) return toast('빈 엑셀 파일');

      const products = rows.map(row => {
        const keys = Object.keys(row);
        const find = (...pats) => { const k = keys.find(k => pats.some(p => k.includes(p))); return k ? String(row[k]).trim() : ''; };
        const name = find('상품명', '이름', '제품명');
        if (!name) return null;

        // 옵션 파싱: "3kg:15000, 5kg:25000" → [{name:"3kg", price:15000}, ...]
        const optStr = find('옵션', 'option');
        let options = [];
        if (optStr) {
          options = optStr.split(',').map(s => s.trim()).filter(Boolean).map(s => {
            const [oName, oPrice] = s.split(':').map(x => x.trim());
            return { name: oName || '기본', price: parseInt(oPrice) || 0 };
          }).filter(o => o.name && o.price > 0);
        }
        if (!options.length) {
          const price = parseInt(find('가격', '공급가', 'price')) || 0;
          if (price > 0) options = [{ name: '기본', price }];
        }
        if (!options.length) return null;

        return {
          name,
          category: find('카테고리', '분류') || '기타',
          tax: find('과세', '세금') || '비과세',
          options,
          shipping: find('배송비') || '수량별배송비',
          delivery: find('배송방법', '택배'),
          origin: find('원산지'),
          note: find('비고', '메모'),
        };
      }).filter(Boolean);

      if (!products.length) return toast('유효한 상품이 없습니다');

      if (!confirm(`${products.length}개 상품을 등록하시겠습니까?`)) return;

      let ok = 0, fail = 0;
      for (const p of products) {
        try {
          const fd = new FormData();
          fd.append('name', p.name);
          fd.append('category', p.category);
          fd.append('tax', p.tax);
          fd.append('options', JSON.stringify(p.options));
          fd.append('shipping', p.shipping);
          fd.append('delivery', p.delivery);
          fd.append('origin', p.origin);
          fd.append('note', p.note);
          const d = await fetchRaw(`${API}/ws/product/save`, { method: 'POST', body: fd });
          if (d.success) ok++; else fail++;
        } catch { fail++; }
      }
      toast(`등록 완료: 성공 ${ok}개 / 실패 ${fail}개`);
      await loadWsProducts();
    } catch { toast('엑셀 파싱 실패'); }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

// ========================================
//  공급처: 주문입력
// ========================================
function getWsOrderPrice() {
  const val = $('ws-ord-product').value;
  if (!val) return 0;
  const [pid, optIdx] = val.split('__');
  const p = wsProducts.find(x => String(x.id) === pid);
  if (!p) return 0;
  if (optIdx !== undefined && Array.isArray(p.options)) return p.options[parseInt(optIdx)]?.price || 0;
  return p.price || 0;
}

function initWsOrderNew() {
  const calcAmt = () => {
    const price = getWsOrderPrice();
    const qty = parseInt($('ws-ord-qty').value) || 1;
    $('ws-ord-amount').value = price ? (price * qty).toLocaleString() + '원' : '';
  };
  $('ws-ord-product').onchange = calcAmt;
  $('ws-ord-qty').oninput = calcAmt;
  $('btn-ws-ord-submit').onclick = submitWsOrder;
}

function populateWsOrderProducts() {
  const sel = $('ws-ord-product');
  const curVal = sel.value;
  let html = '<option value="">상품을 선택하세요</option>';
  wsProducts.forEach(p => {
    if (Array.isArray(p.options) && p.options.length) {
      p.options.forEach((o, i) => {
        html += `<option value="${p.id}__${i}">${esc(p.name)} - ${esc(o.name)} (₩${(o.price||0).toLocaleString()})</option>`;
      });
    } else {
      html += `<option value="${p.id}">${esc(p.name)} - ₩${(p.price||0).toLocaleString()}</option>`;
    }
  });
  sel.innerHTML = html;
  if (curVal) sel.value = curVal;
}

async function submitWsOrder() {
  const name = $('ws-ord-name').value.trim();
  const val = $('ws-ord-product').value;
  if (!name) return toast('주문자명 입력');
  if (!val) return toast('상품 선택');
  if (!$('ws-ord-addr').value.trim()) return toast('배송지 입력');

  const [pid, optIdx] = val.split('__');
  const p = wsProducts.find(x => String(x.id) === pid);
  const opt = (optIdx !== undefined && Array.isArray(p?.options)) ? p.options[parseInt(optIdx)] : null;
  const price = opt?.price || p?.price || 0;
  const productName = opt ? `${p.name} - ${opt.name}` : p?.name || '';
  const qty = parseInt($('ws-ord-qty').value) || 1;
  const btn = $('btn-ws-ord-submit'); btn.disabled = true; btn.textContent = '등록 중...';
  try {
    const d = await post('/ws/order/save', {
      name, phone: $('ws-ord-phone').value, email: $('ws-ord-email').value,
      address: $('ws-ord-addr').value, productId: pid, productName,
      quantity: qty, amount: price * qty, memo: $('ws-ord-memo').value
    });
    if (d.success) {
      toast(`주문 등록 완료: ${d.orderNo}`);
      ['ws-ord-name','ws-ord-phone','ws-ord-email','ws-ord-addr','ws-ord-memo'].forEach(id => $(id).value = '');
      $('ws-ord-product').value = ''; $('ws-ord-qty').value = '1'; $('ws-ord-amount').value = '';
    } else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '주문 등록';
}

// ========================================
//  공급처: 주문리스트
// ========================================
let wsOrders = [], wsOrdFilter = 'all';

function initWsOrders() {
  $('btn-ws-ord-refresh').onclick = loadWsOrders;
  $('ws-ord-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#ws-ord-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); wsOrdFilter = c.dataset.s; renderWsOrders();
  };
  $('btn-ws-ord-excel').onclick = downloadWsOrderExcel;
  loadWsOrders();
}

async function loadWsOrders() {
  try {
    const d = await get('/ws/orders');
    if (d.success) { wsOrders = d.orders || []; renderWsOrders(); }
  } catch {}
  populateWsOrderProducts();
}

function renderWsOrders() {
  const f = wsOrdFilter === 'all' ? wsOrders : wsOrders.filter(o => o.status === wsOrdFilter);
  const bc = s => s === '신규' ? 'blue' : s === '확인' ? 'orange' : s === '배송중' ? 'blue' : s === '완료' ? 'green' : 'red';
  const statusOpts = ['신규','확인','배송중','완료','취소'];
  $('ws-ord-body').innerHTML = f.length ? f.map(o => `<tr>
    <td><code style="font-size:12px">${esc(o.orderNo || '-')}</code></td>
    <td>${esc(o.sellerName || '-')}</td>
    <td>${esc(o.name)}</td>
    <td style="max-width:200px">${esc(o.productName || '-')}</td>
    <td style="text-align:center">${o.quantity || 1}</td>
    <td style="text-align:right">₩${(o.amount || 0).toLocaleString()}</td>
    <td><span class="badge ${bc(o.status)}">${esc(o.status)}</span></td>
    <td>${o.createdAt ? new Date(o.createdAt).toLocaleDateString('ko') : '-'}</td>
    <td>
      <select class="input-sm" style="padding:6px 10px;font-size:12px" onchange="updateWsOrdStatus(${o.id},this.value)">
        ${statusOpts.map(s => `<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
  </tr>`).join('') : '<tr><td colspan="9" class="empty"><p>주문이 없습니다</p></td></tr>';
}

async function updateWsOrdStatus(id, status) {
  try {
    await post('/ws/order/update-status', { id, status });
    const o = wsOrders.find(x => x.id === id);
    if (o) o.status = status;
    toast(`주문 상태: ${status}`);
  } catch { toast('실패'); }
}

function downloadWsOrderExcel() {
  if (!wsOrders.length) return toast('주문 없음');
  const data = wsOrders.map(o => ({ '주문번호': o.orderNo, '주문자': o.name, '연락처': o.phone, '이메일': o.email, '배송지': o.address, '상품명': o.productName, '수량': o.quantity, '금액': o.amount, '상태': o.status, '배송메모': o.memo, '주문일': o.createdAt }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '주문');
  XLSX.writeFile(wb, `공급처_주문_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('엑셀 다운로드');
}

// ========================================
//  셀러: 공급처 상품 카탈로그 (열람 전용)
// ========================================
let sWsProducts = [], sWsCatFilter = 'all';

function initSellerWsCatalog() {
  $('s-ws-search').oninput = renderSellerWsCatalog;
  $('s-ws-cat-tabs').onclick = e => {
    const tab = e.target.closest('.ws-cat-tab'); if (!tab) return;
    document.querySelectorAll('#s-ws-cat-tabs .ws-cat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active'); sWsCatFilter = tab.dataset.cat; renderSellerWsCatalog();
  };
  loadSellerWsCatalog();
}

async function loadSellerWsCatalog() {
  try {
    const d = await get('/ws/products');
    if (d.success) { sWsProducts = d.products || []; renderSellerWsCats(); renderSellerWsCatalog(); }
  } catch {}
}

function renderSellerWsCats() {
  const cats = [...new Set(sWsProducts.map(p => p.category).filter(Boolean))];
  $('s-ws-cat-tabs').innerHTML = '<button class="ws-cat-tab active" data-cat="all">전체보기</button>' +
    cats.map(c => `<button class="ws-cat-tab" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}

function renderSellerWsCatalog() {
  const q = ($('s-ws-search').value || '').toLowerCase();
  let f = sWsProducts;
  if (sWsCatFilter !== 'all') f = f.filter(p => p.category === sWsCatFilter);
  if (q) f = f.filter(p => (p.name || '').toLowerCase().includes(q));
  $('s-ws-total').textContent = `전체상품수 : ${f.length}개`;

  const getMinPrice = p => {
    if (Array.isArray(p.options) && p.options.length) return Math.min(...p.options.map(o => o.price || 0));
    return p.price || 0;
  };
  const getOptsText = p => {
    if (Array.isArray(p.options) && p.options.length) return p.options.map(o => `${o.name}: ₩${(o.price||0).toLocaleString()}`).join(' / ');
    return '';
  };

  $('s-ws-grid').innerHTML = f.length ? f.map(p => `
    <div class="ws-prod-card">
      ${p.tax === '비과세' ? '<span class="ws-tax-badge">비과세</span>' : '<span class="ws-tax-badge" style="background:var(--blue)">과세</span>'}
      ${p.image ? `<img class="ws-prod-img" src="${esc(p.image)}" alt="${esc(p.name)}">` : '<div class="ws-prod-img-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg></div>'}
      <div class="ws-prod-info">
        <div class="ws-prod-name">${esc(p.name)}</div>
        <div class="ws-prod-price">공급가: <strong>₩${getMinPrice(p).toLocaleString()}~</strong></div>
        <div class="ws-prod-ship" style="font-size:12px;color:var(--gray-500)">${esc(getOptsText(p))}</div>
        <div class="ws-prod-ship">배송비: <strong>${esc(p.shipping || '수량별배송비')}</strong></div>
        <div class="ws-prod-ship">${esc(p.delivery || '')}</div>
        ${p.origin ? `<div class="ws-prod-ship">원산지: ${esc(p.origin)}</div>` : ''}
      </div>
    </div>
  `).join('') : '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray-400)">등록된 상품이 없습니다.</div>';
}

// ========================================
//  셀러: 주문 관리 (재발주 시스템 포함)
// ========================================
let sellerOrders = [], sellerOrdFilter = 'all', sellerSupplyFilter = 'all';
let sellerTracking = {}; // orderId → tracking record
let reorderTargets = []; // selected cancelled trackIds

function initSellerOrders() {
  $('btn-s-ord-fetch').onclick = fetchSellerOrders;
  $('s-ord-search').oninput = renderSellerOrders;
  $('s-ord-check-all').onchange = function() {
    document.querySelectorAll('.s-ord-cb').forEach(cb => {
      if (!cb.disabled) cb.checked = this.checked;
    });
    updateBulkReorderBtn();
  };
  $('s-ord-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#s-ord-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); sellerOrdFilter = c.dataset.s; renderSellerOrders();
  };
  $('s-supply-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#s-supply-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); sellerSupplyFilter = c.dataset.s; renderSellerOrders();
  };
  $('btn-s-ord-bulk-reorder').onclick = () => {
    const ids = [...document.querySelectorAll('.s-ord-cb:checked')].map(cb => cb.dataset.trackid).filter(Boolean);
    if (!ids.length) return toast('공급취소 주문을 선택하세요');
    openReorderModal(ids);
  };
  // 재발주 모달
  $('reorder-modal-close').onclick = closeReorderModal;
  $('btn-reorder-cancel').onclick = closeReorderModal;
  $('reorder-modal').onclick = e => { if (e.target === e.currentTarget) closeReorderModal(); };
  $('btn-reorder-confirm').onclick = submitReorder;
}

function updateBulkReorderBtn() {
  const checked = document.querySelectorAll('.s-ord-cb:checked').length;
  const btn = $('btn-s-ord-bulk-reorder');
  if (checked > 0) { btn.classList.remove('hidden'); $('s-ord-checked-count').textContent = checked; }
  else btn.classList.add('hidden');
}

async function fetchSellerOrders() {
  const k = needKeys(); if (!k) return;
  const btn = $('btn-s-ord-fetch');
  btn.disabled = true; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 불러오는 중...';
  try {
    const from = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    const [ordRes, trackRes] = await Promise.all([
      post('/coupang/orders', { ...k, status: 'ALL', createdAtFrom: from, createdAtTo: to }),
      get(`/order-tracking/${currentUser.uid}`)
    ]);
    if (ordRes.success) sellerOrders = ordRes.orders || [];
    if (trackRes.success) {
      sellerTracking = {};
      (trackRes.tracking || []).forEach(t => { sellerTracking[t.orderId] = t; });
    }
    renderSellerOrders();
    toast(`${sellerOrders.length}건 조회`);
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 주문 불러오기';
}

function getSupplyStatus(orderId) {
  const t = sellerTracking[String(orderId)];
  return t ? t.supplyStatus : '미발주';
}

function renderSellerOrders() {
  const q = ($('s-ord-search')?.value || '').toLowerCase();
  let f = sellerOrders;
  if (sellerOrdFilter !== 'all') f = f.filter(o => o.status === sellerOrdFilter);
  if (sellerSupplyFilter !== 'all') f = f.filter(o => getSupplyStatus(o.orderId) === sellerSupplyFilter);
  if (q) f = f.filter(o => (o.productName||'').toLowerCase().includes(q) || (o.receiverName||'').toLowerCase().includes(q) || String(o.orderId).includes(q));
  $('s-ord-count').textContent = `${f.length}건`;

  const L = { ACCEPT:'결제완료', INSTRUCT:'상품준비중', DEPARTURE:'배송지시', DELIVERING:'배송중', FINAL_DELIVERY:'배송완료', CANCEL:'취소' };
  const C = { ACCEPT:'blue', INSTRUCT:'orange', DELIVERING:'blue', FINAL_DELIVERY:'green', CANCEL:'red' };
  const isR = id => reviewTags.has(String(id));

  const supplyBadge = (ss) => {
    if (ss === '발주완료') return '<span class="badge-supply-ok" style="padding:3px 8px;border-radius:12px;font-size:11px">발주완료 ●</span>';
    if (ss === '공급취소') return '<span class="badge-supply-cancel" style="padding:3px 8px;border-radius:12px;font-size:11px">공급취소 ●</span>';
    if (ss === '재발주완료') return '<span class="badge-supply-reorder" style="padding:3px 8px;border-radius:12px;font-size:11px">재발주완료</span>';
    return '<span class="badge-supply-none" style="padding:3px 8px;border-radius:12px;font-size:11px">미발주</span>';
  };

  $('s-ord-body').innerHTML = f.length ? f.map(o => {
    const ss = getSupplyStatus(o.orderId);
    const track = sellerTracking[String(o.orderId)];
    const tag = isR(o.orderId) ? '<span class="badge orange" style="font-size:11px">체험단</span>' : '<span class="badge green" style="font-size:11px">실주문</span>';
    const isCancelled = ss === '공급취소';
    const rowClass = ss === '공급취소' ? 'supply-cancel' : ss === '발주완료' ? 'supply-ok' : ss === '재발주완료' ? 'supply-reorder' : '';
    const cancelReason = track?.cancelReason ? `<br><span style="font-size:10px;color:var(--red)">${esc(track.cancelReason)}</span>` : '';
    return `<tr class="${rowClass}">
      <td style="text-align:center">
        ${isCancelled ? `<input type="checkbox" class="s-ord-cb" data-trackid="${esc(track?.id||'')}" style="cursor:pointer" onchange="updateBulkReorderBtn()">` : ''}
      </td>
      <td>${tag}</td>
      <td><code style="font-size:11px">${o.orderId||'-'}</code></td>
      <td style="max-width:180px;font-size:13px">${esc(o.productName||'-')}</td>
      <td><span class="badge blue" style="font-size:11px">${esc(o.optionName||'-')}</span></td>
      <td style="text-align:center">${o.quantity||1}</td>
      <td style="font-size:13px">${esc(o.receiverName||'-')}</td>
      <td><span class="badge ${C[o.status]||'gray'}" style="font-size:11px">${L[o.status]||o.status}</span></td>
      <td>${supplyBadge(ss)}${cancelReason}</td>
      <td style="font-size:11px">${o.orderDate?new Date(o.orderDate).toLocaleDateString('ko'):'-'}</td>
      <td>${isCancelled && track ? `<button class="reorder-btn" onclick="openReorderModal(['${track.id}'])">재발주</button>` : ''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="11" class="empty"><p>주문 불러오기를 눌러주세요</p></td></tr>';

  // 전체선택 상태 초기화
  $('s-ord-check-all').checked = false;
  $('btn-s-ord-bulk-reorder').classList.add('hidden');
}

// ========================================
//  재발주 모달
// ========================================
function openReorderModal(trackIds) {
  reorderTargets = trackIds;
  const items = trackIds.map(id => Object.values(sellerTracking).find(t => t.id === id)).filter(Boolean);
  if (!items.length) return toast('재발주 대상이 없습니다');

  $('reorder-modal-body').innerHTML = `
    <table class="tbl" style="font-size:13px">
      <thead><tr><th>상품명</th><th>수령인</th><th>취소사유</th></tr></thead>
      <tbody>${items.map(t => `<tr>
        <td>${esc(t.productName||'-')}</td>
        <td>${esc(t.receiverName||'-')}</td>
        <td><span style="color:var(--red);font-weight:600">${esc(t.cancelReason||'기타')}</span></td>
      </tr>`).join('')}</tbody>
    </table>
    <p style="font-size:13px;color:var(--gray-500);margin-top:12px">총 <strong>${items.length}건</strong>을 재발주 처리합니다.</p>`;
  $('reorder-memo').value = '';
  $('reorder-modal').classList.remove('hidden');
}

function closeReorderModal() { $('reorder-modal').classList.add('hidden'); reorderTargets = []; }

async function submitReorder() {
  if (!reorderTargets.length) return;
  const memo = $('reorder-memo').value.trim();
  const btn = $('btn-reorder-confirm'); btn.disabled = true; btn.textContent = '처리 중...';
  try {
    const d = await post('/order-tracking/reorder', { trackIds: reorderTargets, memo });
    if (d.success) {
      toast(`재발주 완료: ${d.count}건`);
      closeReorderModal();
      fetchSellerOrders(); // 새로고침
    } else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
  btn.disabled = false; btn.textContent = '재발주 처리';
}

// ========================================
//  셀러: 예치금
// ========================================
function initSellerDeposit() {
  $('btn-s-dep-refresh').onclick = loadSellerDeposit;
  loadSellerDeposit();
}

async function loadSellerDeposit() {
  if (!currentUser) return;
  try {
    const [bRes, tRes] = await Promise.all([
      get(`/deposits/balance/${currentUser.uid}`),
      get(`/deposits/transactions/${currentUser.uid}`)
    ]);
    if (bRes.success) $('s-dep-balance').textContent = `${(bRes.balance || 0).toLocaleString()}원`;
    if (tRes.success) {
      const txs = tRes.transactions || [];
      const typeLabel = t => t === 'charge' ? '충전' : t === 'deduct' ? '차감' : t === 'auto_order' ? '자동발주' : t === 'self_order' ? '자체발주' : t === 'refund' ? '환불' : t;
      const typeColor = t => t === 'charge' || t === 'refund' ? 'green' : 'red';
      $('s-dep-body').innerHTML = txs.length ? txs.map(t => `<tr>
        <td style="font-size:12px">${t.createdAt ? new Date(t.createdAt).toLocaleString('ko') : '-'}</td>
        <td><span class="badge ${typeColor(t.type)}">${typeLabel(t.type)}</span></td>
        <td style="text-align:right;font-weight:600;color:${t.amount >= 0 ? 'var(--blue)' : 'var(--red)'}">${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString()}원</td>
        <td style="text-align:right">${(t.balance||0).toLocaleString()}원</td>
        <td>${esc(t.description || '-')}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty"><p>거래 내역이 없습니다</p></td></tr>';
    }
  } catch {}
}

// ========================================
//  관리자: 예치금 관리
// ========================================
let adminDepSummary = [], adminDepTxs = [];

function initAdminDeposits() {
  $('btn-a-dep-refresh').onclick = loadAdminDeposits;
  loadAdminDeposits();
}

async function loadAdminDeposits() {
  try {
    const d = await get('/admin/deposits');
    if (d.success) {
      adminDepSummary = d.summary || [];
      adminDepTxs = d.transactions || [];
      renderAdminDeposits();
    }
  } catch {}
}

function renderAdminDeposits() {
  $('a-dep-body').innerHTML = adminDepSummary.length ? adminDepSummary.map(s => `<tr>
    <td>${esc(s.loginId)}</td>
    <td>${esc(s.company)}</td>
    <td style="text-align:right;font-weight:600">₩${(s.balance||0).toLocaleString()}</td>
    <td>
      <div class="btn-row" style="gap:6px">
        <input type="number" placeholder="금액" class="input-sm dep-amt-${s.uid}" style="width:100px;padding:6px 10px;font-size:12px">
        <button class="btn-primary" style="padding:6px 12px;font-size:12px" onclick="adminDepCharge('${s.uid}')">충전</button>
        <button class="btn-danger-sm" style="padding:6px 12px" onclick="adminDepDeduct('${s.uid}')">차감</button>
      </div>
    </td>
  </tr>`).join('') : '<tr><td colspan="4" class="empty"><p>셀러가 없습니다</p></td></tr>';

  const typeLabel = t => t === 'charge' ? '충전' : t === 'deduct' ? '차감' : t === 'auto_order' ? '자동발주' : t === 'self_order' ? '자체발주' : t === 'refund' ? '환불' : t;
  const typeColor = t => t === 'charge' || t === 'refund' ? 'green' : 'red';
  const recentTx = adminDepTxs.slice(0, 50);
  $('a-dep-tx-body').innerHTML = recentTx.length ? recentTx.map(t => {
    const seller = adminDepSummary.find(s => s.uid === t.userId);
    return `<tr>
      <td>${esc(seller?.company || t.userId)}</td>
      <td style="font-size:12px">${t.createdAt ? new Date(t.createdAt).toLocaleString('ko') : '-'}</td>
      <td><span class="badge ${typeColor(t.type)}">${typeLabel(t.type)}</span></td>
      <td style="text-align:right;font-weight:600;color:${t.amount >= 0 ? 'var(--blue)' : 'var(--red)'}">${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString()}원</td>
      <td style="text-align:right">${(t.balance||0).toLocaleString()}원</td>
      <td>${esc(t.description || '-')}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="empty"><p>거래 내역이 없습니다</p></td></tr>';
}

async function adminDepCharge(uid) {
  const input = document.querySelector(`.dep-amt-${uid}`);
  const amount = parseInt(input?.value);
  if (!amount || amount <= 0) return toast('충전 금액을 입력하세요');
  try {
    const d = await post('/deposits/charge', { userId: uid, amount, description: '관리자 충전' });
    if (d.success) { toast(`충전 완료: ₩${amount.toLocaleString()}`); input.value = ''; loadAdminDeposits(); }
    else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
}

async function adminDepDeduct(uid) {
  const input = document.querySelector(`.dep-amt-${uid}`);
  const amount = parseInt(input?.value);
  if (!amount || amount <= 0) return toast('차감 금액을 입력하세요');
  if (!confirm(`₩${amount.toLocaleString()} 차감하시겠습니까?`)) return;
  try {
    const d = await post('/deposits/deduct', { userId: uid, amount, description: '관리자 차감' });
    if (d.success) { toast(`차감 완료: ₩${amount.toLocaleString()}`); input.value = ''; loadAdminDeposits(); }
    else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
}

// ========================================
//  관리자: 발주 추적 관리
// ========================================
let adminTracking = [], adminTrackFilter = 'all';

function initAdminOrderTracking() {
  $('btn-a-track-refresh').onclick = loadAdminOrderTracking;
  $('btn-a-track-cancel').onclick = submitAdminCancel;
  $('a-track-search').oninput = renderAdminTracking;
  $('a-track-chips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('#a-track-chips .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active'); adminTrackFilter = c.dataset.s; renderAdminTracking();
  };
  loadAdminOrderTracking();
  loadAdminTrackingSellers();
}

async function loadAdminTrackingSellers() {
  try {
    const d = await post('/auth/users', {});
    const sellers = (d.users || []).filter(u => u.role === 'seller');
    $('a-track-seller').innerHTML = '<option value="">셀러를 선택하세요</option>' +
      sellers.map(u => `<option value="${u.uid}" data-name="${esc(u.company||u.loginId)}">${esc(u.company||u.loginId)} (${esc(u.loginId)})</option>`).join('');
  } catch {}
}

async function loadAdminOrderTracking() {
  try {
    const d = await get('/admin/order-tracking');
    if (d.success) { adminTracking = d.tracking || []; renderAdminTracking(); }
  } catch {}
}

function renderAdminTracking() {
  const q = ($('a-track-search')?.value || '').toLowerCase();
  let f = adminTracking;
  if (adminTrackFilter !== 'all') f = f.filter(t => t.supplyStatus === adminTrackFilter);
  if (q) f = f.filter(t => String(t.orderId).includes(q) || (t.sellerName||'').toLowerCase().includes(q) || (t.productName||'').toLowerCase().includes(q));
  $('a-track-count').textContent = `${f.length}건`;

  const supplyBadge = ss => {
    if (ss === '발주완료') return `<span class="badge-supply-ok" style="padding:3px 8px;border-radius:12px;font-size:11px">발주완료 ●</span>`;
    if (ss === '공급취소') return `<span class="badge-supply-cancel" style="padding:3px 8px;border-radius:12px;font-size:11px">공급취소 ●</span>`;
    if (ss === '재발주완료') return `<span class="badge-supply-reorder" style="padding:3px 8px;border-radius:12px;font-size:11px">재발주완료</span>`;
    return `<span class="badge-supply-none" style="padding:3px 8px;border-radius:12px;font-size:11px">미발주</span>`;
  };

  const statusOpts = ['발주완료','공급취소','재발주완료'];
  $('a-track-body').innerHTML = f.length ? f.map(t => {
    const rowClass = t.supplyStatus === '공급취소' ? 'supply-cancel' : t.supplyStatus === '발주완료' ? 'supply-ok' : t.supplyStatus === '재발주완료' ? 'supply-reorder' : '';
    return `<tr class="${rowClass}">
      <td>${esc(t.sellerName||t.sellerId)}</td>
      <td><code style="font-size:11px">${esc(t.orderId)}</code></td>
      <td style="max-width:180px;font-size:13px">${esc(t.productName||'-')}</td>
      <td>${esc(t.receiverName||'-')}</td>
      <td>${supplyBadge(t.supplyStatus)}</td>
      <td style="color:var(--red);font-size:12px">${esc(t.cancelReason||'-')}</td>
      <td style="font-size:11px">${t.updatedAt?new Date(t.updatedAt).toLocaleDateString('ko'):'-'}</td>
      <td>
        <select class="input-sm" style="padding:4px 8px;font-size:11px" onchange="updateAdminTrackStatus('${t.id}',this.value)">
          ${statusOpts.map(s => `<option value="${s}" ${t.supplyStatus===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty"><p>추적 내역이 없습니다</p></td></tr>';
}

async function submitAdminCancel() {
  const sellerId = $('a-track-seller').value;
  const orderId = $('a-track-orderid').value.trim();
  const cancelReason = $('a-track-reason').value;
  if (!sellerId) return toast('셀러를 선택하세요');
  if (!orderId) return toast('쿠팡 주문번호를 입력하세요');

  const sellerOpt = $('a-track-seller').selectedOptions[0];
  const sellerName = sellerOpt?.dataset?.name || '';
  try {
    const d = await post('/order-tracking/cancel', {
      orderId, sellerId, sellerName, cancelReason,
      productName: $('a-track-product').value.trim()
    });
    if (d.success) {
      toast(`공급취소 등록: ${orderId}`);
      $('a-track-orderid').value = ''; $('a-track-product').value = '';
      loadAdminOrderTracking();
    } else toast(d.message || '실패');
  } catch { toast('서버 연결 실패'); }
}

async function updateAdminTrackStatus(trackId, status) {
  try {
    const d = await post('/order-tracking/update-admin-status', { trackId, status });
    if (d.success) { const t = adminTracking.find(x => x.id === trackId); if (t) { t.supplyStatus = status; } renderAdminTracking(); toast(`상태 변경: ${status}`); }
  } catch { toast('실패'); }
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
