// ============================================
//  Sellio — Full Working App
// ============================================
const API = location.origin + '/api';

// Firebase
const fbConfig = { apiKey:"AIzaSyDummyKey",authDomain:"sellio-app.firebaseapp.com",projectId:"sellio-app" };
let fbOk = false;
try { firebase.initializeApp(fbConfig); fbOk = true; } catch(e) {}

// State
let currentUser = null;
let products = [], orders = [], historyData = [];
let reviewTags = new Set();
let orderTypeFilter = 'all', historyFilter = 'all';
let acceptOrders = [];
let matchedReviewOrders = [];
let invoiceMatchData = [];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initLogin(); initNav(); initDashboard(); initOrders(); initReviewOrders();
  initProducts(); initInvoice(); initKakao(); initHistory(); initApiSettings();
  initModal(); initImageUpload(); initMarginCalc(); setDates();
});

function setDates() {
  const t = new Date().toISOString().split('T')[0];
  const w = new Date(Date.now()-7*864e5).toISOString().split('T')[0];
  const $ = id => document.getElementById(id);
  if($('order-to')) $('order-to').value = t;
  if($('order-from')) $('order-from').value = w;
}

function getKeys() { const s = localStorage.getItem('sellio_api'); return s ? JSON.parse(s) : null; }
function needKeys() {
  const k = getKeys();
  if (!k||!k.vendorId||!k.accessKey||!k.secretKey) { toast('먼저 쿠팡 API를 설정해주세요'); nav('api-settings'); return null; }
  return k;
}

// ===== LOGIN =====
function initLogin() {
  if (fbOk) firebase.auth().onAuthStateChanged(u => { if(u) { currentUser={uid:u.uid,name:u.displayName||u.email.split('@')[0],email:u.email,photo:u.photoURL}; localStorage.setItem('sellio_user',JSON.stringify(currentUser)); onLogin(); }});
  else { const s=localStorage.getItem('sellio_user'); if(s){currentUser=JSON.parse(s);onLogin();} }

  document.getElementById('google-login-btn').onclick = async () => {
    if(fbOk) { try { await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()); return; } catch(e) { if(e.code==='auth/popup-closed-by-user')return; } }
    currentUser={uid:'local',name:'jonghyun',email:'jonghyun401200@gmail.com',photo:null};
    localStorage.setItem('sellio_user',JSON.stringify(currentUser)); onLogin();
  };

  document.getElementById('logout-btn').onclick = async () => {
    if(fbOk) try{await firebase.auth().signOut();}catch(e){}
    localStorage.removeItem('sellio_user'); currentUser=null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    toast('로그아웃');
  };
}

async function onLogin() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-avatar-circle').textContent = currentUser.name[0].toUpperCase();
  if(currentUser.photo){const i=document.getElementById('user-avatar-img');i.src=currentUser.photo;i.classList.remove('hidden');document.getElementById('user-avatar-circle').classList.add('hidden');}

  try {
    const r = await fetch(`${API}/user/load-keys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.uid})});
    const d = await r.json();
    if(d.keys){
      localStorage.setItem('sellio_api',JSON.stringify(d.keys));
      document.getElementById('api-vendor-id').value=d.keys.vendorId||'';
      document.getElementById('api-access-key').value=d.keys.accessKey||'';
      document.getElementById('api-secret-key').value=d.keys.secretKey||'';
      document.getElementById('user-sub').textContent=`셀러 #${d.keys.vendorId}`;
    }
  } catch(e) {
    const l=getKeys();
    if(l){
      document.getElementById('api-vendor-id').value=l.vendorId||'';
      document.getElementById('api-access-key').value=l.accessKey||'';
      document.getElementById('api-secret-key').value=l.secretKey||'';
    }
  }

  await loadTags(); await loadHistory();
  toast(`${currentUser.name}님 환영합니다!`);
}

// ===== NAV =====
function initNav() {
  document.querySelectorAll('.nav-item').forEach(i => i.onclick = e => { e.preventDefault(); nav(i.dataset.page); });
  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => nav(b.dataset.goto));
}
function nav(p) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page===p));
  document.querySelectorAll('.page').forEach(pg => pg.classList.toggle('active', pg.id===`page-${p}`));
}

// ===== DASHBOARD =====
function initDashboard() { renderDash(); }
function renderDash() {
  const accept = orders.filter(o => o.status==='ACCEPT').length;
  const instruct = orders.filter(o => o.status==='INSTRUCT').length;
  const reviewCount = reviewTags.size;
  const pending = historyData.filter(h => h.status==='대기중').length;

  document.getElementById('s-accept').innerHTML = `${accept}<small>건</small>`;
  document.getElementById('s-instruct').innerHTML = `${instruct}<small>건</small>`;
  document.getElementById('s-review-wait').innerHTML = `${reviewCount}<small>건</small>`;
  document.getElementById('s-review-req').innerHTML = `${pending}<small>건</small>`;

  const bc = s => s==='대기중'?'orange':s==='완료'?'green':'blue';
  document.getElementById('dash-recent').innerHTML = historyData.slice(0,5).map(h => `<tr><td>${esc(h.productName||'-')}</td><td>${esc(h.keyword||'-')}</td><td>${h.totalCount||0}건</td><td><span class="badge ${bc(h.status)}">${esc(h.status)}</span></td><td>${h.createdAt?new Date(h.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty"><p>신청 내역 없음</p></td></tr>';
}

// ===== ORDERS =====
function initOrders() {
  document.getElementById('btn-fetch-orders').onclick = fetchOrders;
  document.getElementById('order-type-chips').onclick = e => {
    const c=e.target.closest('.chip'); if(!c)return;
    document.querySelectorAll('#order-type-chips .chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active'); orderTypeFilter=c.dataset.t; renderOrders();
  };
  renderOrders();
}

async function fetchOrders() {
  const k=needKeys(); if(!k)return;
  const btn=document.getElementById('btn-fetch-orders'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span> 조회 중...';
  try {
    const r = await fetch(`${API}/coupang/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...k,status:document.getElementById('order-status-sel').value,createdAtFrom:document.getElementById('order-from').value,createdAtTo:document.getElementById('order-to').value})});
    const d = await r.json();
    if(d.success){orders=d.orders;renderOrders();renderDash();toast(`${d.total}건 조회`);}else toast(d.message);
  } catch(e){toast('서버 연결 실패');}
  btn.disabled=false; btn.textContent='주문 조회';
}

function renderOrders() {
  let f = orders;
  if(orderTypeFilter==='review') f=orders.filter(o=>reviewTags.has(String(o.orderId)));
  else if(orderTypeFilter==='real') f=orders.filter(o=>!reviewTags.has(String(o.orderId)));
  const labels={ACCEPT:'결제완료',INSTRUCT:'상품준비중',DEPARTURE:'배송지시',DELIVERING:'배송중',FINAL_DELIVERY:'배송완료'};
  const colors={ACCEPT:'blue',INSTRUCT:'orange',DEPARTURE:'blue',DELIVERING:'blue',FINAL_DELIVERY:'green'};

  document.getElementById('orders-body').innerHTML = f.length ? f.map(o => {
    const isR = reviewTags.has(String(o.orderId));
    return `<tr><td><span class="badge ${isR?'orange':'green'}" style="cursor:pointer;font-size:11px" data-tog="${o.orderId}">${isR?'체험단':'실주문'}</span></td><td><code style="font-size:12px">${o.orderId||'-'}</code></td><td style="max-width:220px">${esc(o.productName||'-')}</td><td><span class="badge blue">${esc(o.optionName||'-')}</span></td><td>${o.quantity}</td><td>${esc(o.receiverName||'-')}</td><td>${o.orderDate?new Date(o.orderDate).toLocaleString('ko'):'-'}</td><td><span class="badge ${colors[o.status]||'gray'}">${labels[o.status]||o.status}</span></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="empty"><p>주문 조회를 해주세요</p></td></tr>';

  document.querySelectorAll('[data-tog]').forEach(b => b.onclick = async () => {
    const id=String(b.dataset.tog);
    if(reviewTags.has(id)) reviewTags.delete(id); else reviewTags.add(id);
    await saveTags(); renderOrders(); renderDash();
  });
}

// Tags - set-tags 방식 (전체 교체, 태그 해제도 정상 반영)
async function loadTags() {
  if(!currentUser) return;
  try {
    const r=await fetch(`${API}/review/get-tags`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.uid})});
    const d=await r.json();
    reviewTags=new Set((d.orderIds||[]).map(String));
  } catch(e) {
    reviewTags=new Set(JSON.parse(localStorage.getItem('sellio_tags')||'[]'));
  }
}
async function saveTags() {
  const a=[...reviewTags]; localStorage.setItem('sellio_tags',JSON.stringify(a));
  if(currentUser) {
    try {
      await fetch(`${API}/review/set-tags`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.uid,orderIds:a})});
    } catch(e) { console.error('태그 저장 실패:', e); }
  }
}

// ===== 체험단 주문 관리 (핵심 기능) =====
function initReviewOrders() {
  document.getElementById('btn-load-accept').onclick = async () => {
    const k=needKeys(); if(!k)return;
    const btn=document.getElementById('btn-load-accept'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span> 불러오는 중...';
    try {
      const from = new Date(Date.now()-14*864e5).toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];
      const r = await fetch(`${API}/coupang/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...k,status:'ACCEPT',createdAtFrom:from,createdAtTo:to})});
      const d = await r.json();
      if(d.success) {
        acceptOrders = d.orders;
        document.getElementById('accept-info').innerHTML = `<div class="accept-count-bar"><span>결제완료 주문: <strong>${acceptOrders.length}건</strong></span><span class="badge blue">최근 2주</span></div>
        <table class="tbl"><thead><tr><th>주문번호</th><th>상품명</th><th>수령인</th><th>주문일</th></tr></thead><tbody>${acceptOrders.slice(0,10).map(o=>`<tr><td><code>${o.orderId}</code></td><td>${esc(o.productName)}</td><td>${esc(o.receiverName)}</td><td>${new Date(o.orderDate).toLocaleDateString('ko')}</td></tr>`).join('')}${acceptOrders.length>10?`<tr><td colspan="4" style="text-align:center;color:var(--gray-400)">...외 ${acceptOrders.length-10}건</td></tr>`:''}</tbody></table>`;
        toast(`결제완료 ${acceptOrders.length}건 불러옴`);
      } else toast(d.message||'주문 조회 실패');
    } catch(e){toast('서버 연결 실패');}
    btn.disabled=false; btn.textContent='결제완료 주문 불러오기';
  };

  document.getElementById('review-excel-file').onchange = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    if(acceptOrders.length===0) { toast('먼저 1단계에서 결제완료 주문을 불러와주세요'); e.target.value=''; return; }

    const fd = new FormData(); fd.append('file', file);
    try {
      toast('엑셀 파싱 중...');
      const r = await fetch(`${API}/invoice/parse-excel`,{method:'POST',body:fd});
      const d = await r.json();
      if(d.success && d.data.length>0) {
        matchedReviewOrders = d.data.map(row => {
          let m = null;
          // 1순위: 주문번호 매칭
          if(row.orderId) m = acceptOrders.find(o => String(o.orderId)===String(row.orderId));
          // 2순위: 수령인+상품명 매칭 (동명이인 방지)
          if(!m && row.receiverName && row.productName) m = acceptOrders.find(o => o.receiverName===row.receiverName && o.productName.includes(row.productName));
          // 3순위: 수령인만 매칭
          if(!m && row.receiverName) m = acceptOrders.find(o => o.receiverName===row.receiverName);
          return { ...row, order: m, matched: !!m };
        });
        renderMatchResult();
        toast(`${d.data.length}건 중 ${matchedReviewOrders.filter(r=>r.matched).length}건 매칭`);
      } else toast(d.message || '데이터 없음');
    } catch(e){toast('파싱 실패');}
    e.target.value='';
  };

  document.getElementById('btn-move-to-instruct').onclick = moveToInstruct;
  document.getElementById('match-check-all').onchange = (e) => {
    document.querySelectorAll('.match-row-cb').forEach(cb => cb.checked = e.target.checked);
  };
}

function renderMatchResult() {
  const el = document.getElementById('review-match-result');
  el.classList.remove('hidden');
  document.getElementById('review-upload-hint').classList.add('hidden');
  const matched = matchedReviewOrders.filter(r=>r.matched).length;
  document.getElementById('match-summary').innerHTML = `매칭: <strong class="text-green">${matched}</strong> / ${matchedReviewOrders.length}건`;

  document.getElementById('match-body').innerHTML = matchedReviewOrders.map((r,i) => `<tr>
    <td>${r.matched?`<input type="checkbox" class="match-row-cb" data-i="${i}" checked>`:'-'}</td>
    <td><code style="font-size:12px">${r.order?.orderId||r.orderId||'-'}</code></td>
    <td>${esc(r.order?.productName||r.productName||'-')}</td>
    <td>${esc(r.order?.optionName||r.option||'-')}</td>
    <td>${esc(r.order?.receiverName||r.receiverName||'-')}</td>
    <td>${r.order?.orderDate?new Date(r.order.orderDate).toLocaleDateString('ko'):'-'}</td>
    <td><span class="badge ${r.matched?'green':'red'}">${r.matched?'매칭':'미매칭'}</span></td>
  </tr>`).join('');
}

async function moveToInstruct() {
  const k=needKeys(); if(!k)return;
  const checked = [...document.querySelectorAll('.match-row-cb:checked')].map(cb => parseInt(cb.dataset.i));
  const toMove = checked.map(i => matchedReviewOrders[i]).filter(r => r && r.matched && r.order);
  if(toMove.length===0){toast('이동할 주문이 없습니다');return;}

  const btn=document.getElementById('btn-move-to-instruct');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> 이동 중...';

  try {
    const boxIds = toMove.map(r => r.order.shipmentBoxId);
    const r = await fetch(`${API}/coupang/approve-orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...k,shipmentBoxIds:boxIds})});
    const d = await r.json();
    if(d.success) {
      const okIds = d.results.filter(x=>x.success).map(x => {
        const m = toMove.find(t => String(t.order.shipmentBoxId)===String(x.shipmentBoxId));
        return m ? String(m.order.orderId) : null;
      }).filter(Boolean);
      okIds.forEach(id => reviewTags.add(id));
      await saveTags();
      toast(`${d.summary.success}건 상품준비중으로 이동 (실패 ${d.summary.fail}건)`);
      renderDash();
    } else toast(d.message || '이동 실패');
  } catch(e){toast('서버 연결 실패');}
  btn.disabled=false; btn.textContent='체험단 건 → 상품준비중 이동';
}

// ===== PRODUCTS =====
function initProducts() {
  renderProducts();
  document.getElementById('btn-fetch-products').onclick = async () => {
    const k=needKeys(); if(!k)return;
    const btn=document.getElementById('btn-fetch-products'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span> 가져오는 중...';
    try {
      const r=await fetch(`${API}/coupang/products`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(k)});
      const d=await r.json();
      if(d.success){products=d.products;renderProducts();toast(`${products.length}개 상품`);}else toast(d.message);
    } catch(e){toast('서버 연결 실패');}
    btn.disabled=false; btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 상품 가져오기';
  };
  document.getElementById('product-search').oninput = renderProducts;
}

function renderProducts() {
  const q = document.getElementById('product-search').value.toLowerCase();
  const f = products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.option||'').toLowerCase().includes(q));
  document.getElementById('product-body').innerHTML = f.length ? f.map((p,i) => `<tr><td style="max-width:300px">${esc(p.name)}</td><td><code style="font-size:12px">${p.optionId||p.vendorItemId||'-'}</code></td><td><span class="badge blue">${esc(p.option||'-')}</span></td><td>${p.salePrice?p.salePrice.toLocaleString()+'원':'-'}</td><td><button class="btn-primary" style="padding:6px 14px;font-size:12px" data-ri="${i}">체험단 신청</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty"><p>상품 가져오기를 눌러주세요</p></td></tr>';
  document.querySelectorAll('[data-ri]').forEach(b => b.onclick = () => openModal(f[parseInt(b.dataset.ri)]));
}

// ===== INVOICE =====
function initInvoice() {
  document.getElementById('invoice-file').onchange = async (e) => {
    const file=e.target.files[0]; if(!file)return;
    document.getElementById('inv-file-name').textContent = file.name;
    const k=needKeys(); if(!k)return;

    toast('주문 조회 + 엑셀 파싱 중...');
    let instructOrders = [];
    try {
      const from=new Date(Date.now()-30*864e5).toISOString().split('T')[0];
      const to=new Date().toISOString().split('T')[0];
      const r=await fetch(`${API}/coupang/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...k,status:'INSTRUCT',createdAtFrom:from,createdAtTo:to})});
      const d=await r.json();
      if(d.success) instructOrders=d.orders;
    } catch(e){ console.error('주문 조회 실패:', e); }

    const fd=new FormData(); fd.append('file',file);
    try {
      const r=await fetch(`${API}/invoice/parse-excel`,{method:'POST',body:fd});
      const d=await r.json();
      if(d.success) {
        invoiceMatchData = d.data.map(row => {
          let m=null;
          if(row.orderId) m=instructOrders.find(o=>String(o.orderId)===String(row.orderId));
          if(!m && row.receiverName && row.productName) m=instructOrders.find(o=>o.receiverName===row.receiverName && o.productName.includes(row.productName));
          if(!m && row.receiverName) m=instructOrders.find(o=>o.receiverName===row.receiverName);
          return {...row,order:m,matched:!!m};
        });
        renderInvoiceResult();
        toast(`${invoiceMatchData.filter(r=>r.matched).length}/${invoiceMatchData.length}건 매칭`);
      } else toast(d.message || '파싱 실패');
    } catch(e){toast('파싱 실패');}
    e.target.value='';
  };

  document.getElementById('btn-apply-invoice').onclick = async () => {
    const k=needKeys(); if(!k)return;
    const matched = invoiceMatchData.filter(r=>r.matched&&r.order&&r.invoiceNumber);
    if(!matched.length){toast('매칭된 송장 없음');return;}
    const courier = document.getElementById('courier-sel').value;
    const btn=document.getElementById('btn-apply-invoice');
    btn.disabled=true; btn.innerHTML='<span class="spinner"></span> 등록 중...';

    try {
      const r=await fetch(`${API}/coupang/invoice-batch`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...k,invoices:matched.map(m=>({shipmentBoxId:m.order.shipmentBoxId,invoiceNumber:m.invoiceNumber,deliveryCompanyCode:courier}))})});
      const d=await r.json();
      if(d.success) toast(`송장 등록 완료! 성공 ${d.summary.success} / 실패 ${d.summary.fail}`);
      else toast(d.message || '등록 실패');
    } catch(e){toast('서버 연결 실패');}
    btn.disabled=false; btn.textContent='쿠팡에 송장 일괄 등록';
  };
}

function renderInvoiceResult() {
  document.getElementById('inv-upload-zone').classList.add('hidden');
  document.getElementById('inv-result').classList.remove('hidden');
  const m=invoiceMatchData.filter(r=>r.matched).length;
  document.getElementById('inv-summary').innerHTML=`<div class="invoice-summary-bar"><span>총 <strong>${invoiceMatchData.length}</strong>건 | 매칭 <strong class="text-green">${m}</strong> | 미매칭 <strong class="text-red">${invoiceMatchData.length-m}</strong></span></div>`;
  document.getElementById('inv-body').innerHTML = invoiceMatchData.map(r=>`<tr><td><code style="font-size:12px">${r.order?.orderId||r.orderId||'-'}</code></td><td>${esc(r.order?.productName||r.productName||'-')}</td><td>${esc(r.order?.receiverName||r.receiverName||'-')}</td><td><code>${esc(r.invoiceNumber||'-')}</code></td><td><span class="badge ${r.matched?'green':'red'}">${r.matched?'매칭':'미매칭'}</span></td></tr>`).join('');
}

// ===== KAKAO EXPORT =====
let exportText='', exportReqs=[];
function initKakao() {
  document.getElementById('btn-load-export').onclick = async () => {
    try {
      const url = currentUser ? `${API}/review/export?userId=${currentUser.uid}` : `${API}/review/export`;
      const r=await(await fetch(url)).json();
      if(r.success){exportText=r.text;exportReqs=r.requests;document.getElementById('kakao-preview').innerHTML=exportReqs.length?`<pre class="kakao-text">${esc(exportText)}</pre>`:'<p class="empty-text">대기중 신청 없음</p>';toast(`${r.count}건`);}
    } catch(e){toast('서버 연결 실패');}
  };
  document.getElementById('btn-copy-kakao').onclick = () => {
    if(!exportText){toast('먼저 불러오기');return;}
    navigator.clipboard.writeText(exportText).then(()=>toast('클립보드 복사 완료! 카톡에 붙여넣기 하세요')).catch(()=>{const t=document.createElement('textarea');t.value=exportText;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);toast('복사 완료!');});
  };
  document.getElementById('btn-mark-sent').onclick = async () => {
    if(!exportReqs.length){toast('없음');return;}
    for(const rq of exportReqs) try{await fetch(`${API}/review/update-status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:rq.id,status:'진행중'})});}catch(e){}
    toast(`${exportReqs.length}건 진행중 처리`); exportReqs=[]; exportText='';
    document.getElementById('kakao-preview').innerHTML='<p class="empty-text">전달 완료</p>';
    await loadHistory();
  };
}

// ===== HISTORY =====
function initHistory() {
  document.getElementById('history-chips').onclick = e => { const c=e.target.closest('.chip'); if(!c)return; document.querySelectorAll('#history-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); historyFilter=c.dataset.s; renderHistory(); };
}
async function loadHistory() {
  try { const url=currentUser?`${API}/review/list?userId=${currentUser.uid}`:`${API}/review/list`; const d=await(await fetch(url)).json(); if(d.success) historyData=d.requests; } catch(e){ historyData=[]; }
  renderHistory(); renderDash();
}
function renderHistory() {
  const f = historyFilter==='all' ? historyData : historyData.filter(h=>h.status===historyFilter);
  const bc = s=>s==='대기중'?'orange':s==='완료'?'green':'blue';
  document.getElementById('history-body').innerHTML = f.length ? f.map(h=>`<tr><td>${esc(h.productName||'-')}</td><td>${esc(h.keyword||'-')}</td><td>${h.totalCount||0}건</td><td><span class="badge ${bc(h.status)}">${esc(h.status)}</span></td><td>${h.createdAt?new Date(h.createdAt).toLocaleDateString('ko'):'-'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty"><p>없음</p></td></tr>';
}

// ===== API SETTINGS =====
function initApiSettings() {
  const s=getKeys(); if(s){document.getElementById('api-vendor-id').value=s.vendorId||'';document.getElementById('api-access-key').value=s.accessKey||'';document.getElementById('api-secret-key').value=s.secretKey||'';}
  document.getElementById('toggle-eye').onclick = () => {const i=document.getElementById('api-secret-key');i.type=i.type==='password'?'text':'password';};

  document.getElementById('btn-test-api').onclick = async () => {
    const v=document.getElementById('api-vendor-id').value.trim(),a=document.getElementById('api-access-key').value.trim(),s=document.getElementById('api-secret-key').value.trim();
    const el=document.getElementById('api-status');
    if(!v||!a||!s){el.className='api-status error';el.textContent='모든 항목 입력 필요';el.classList.remove('hidden');return;}
    el.className='api-status';el.textContent='테스트 중...';el.classList.remove('hidden');
    try {
      const r=await fetch(`${API}/coupang/test`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vendorId:v,accessKey:a,secretKey:s})});
      const d=await r.json();
      el.className=`api-status ${d.success?'success':'error'}`; el.textContent=d.success?`연결 성공! Vendor: ${v}`:d.message;
    } catch(e){el.className='api-status error';el.textContent='서버 연결 실패. npm start로 서버 실행 필요';}
  };

  document.getElementById('btn-save-api').onclick = async () => {
    const v=document.getElementById('api-vendor-id').value.trim(),a=document.getElementById('api-access-key').value.trim(),s=document.getElementById('api-secret-key').value.trim();
    if(!v||!a||!s){toast('모든 항목 입력');return;}
    const keys={vendorId:v,accessKey:a,secretKey:s};
    localStorage.setItem('sellio_api',JSON.stringify(keys));
    if(currentUser){try{await fetch(`${API}/user/save-keys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.uid,...keys})});}catch(e){} document.getElementById('user-sub').textContent=`셀러 #${v}`;}
    toast('API 설정 저장 완료');
  };
}

// ===== MODAL =====
function initModal() {
  document.getElementById('modal-close').onclick = () => document.getElementById('review-modal').classList.add('hidden');
  document.getElementById('review-modal').onclick = e => { if(e.target===e.currentTarget) document.getElementById('review-modal').classList.add('hidden'); };
  document.getElementById('btn-modal-submit').onclick = submitReview;
}

function openModal(p) {
  document.getElementById('modal-product-info').textContent = `${p.name} - ${p.option||''}`;
  document.getElementById('modal-option').value = p.option||'';
  document.getElementById('modal-product-url').value = p.sellerProductId?`https://www.coupang.com/vp/products/${p.sellerProductId}`:'';
  ['modal-keyword','modal-total','modal-daily','modal-guide'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('modal-time').value='상관없음';
  // 이미지 초기화
  document.getElementById('modal-image').value='';
  document.getElementById('preview-img').src='';
  document.getElementById('img-preview').classList.add('hidden');
  document.getElementById('img-placeholder').classList.remove('hidden');
  // 토글 초기화
  ['modal-photo','modal-payment','modal-delivery','modal-weekend'].forEach(id=>document.getElementById(id).checked=true);
  document.getElementById('review-modal').classList.remove('hidden');
}

async function submitReview() {
  const kw=document.getElementById('modal-keyword').value.trim(),tc=document.getElementById('modal-total').value,dc=document.getElementById('modal-daily').value;
  if(!kw||!tc||!dc){toast('필수 항목 입력 (키워드, 총건수, 일건수)');return;}
  if(parseInt(dc) > parseInt(tc)){toast('일 진행 건수가 총 건수보다 클 수 없습니다');return;}
  const btn=document.getElementById('btn-modal-submit'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';

  const fd=new FormData();
  fd.append('userId',currentUser?.uid||''); fd.append('seller',currentUser?.name||''); fd.append('sellerEmail',currentUser?.email||'');
  fd.append('productName',document.getElementById('modal-product-info').textContent.split(' - ')[0]);
  fd.append('keyword',kw); fd.append('productUrl',document.getElementById('modal-product-url').value);
  fd.append('purchaseOption',document.getElementById('modal-option').value);
  fd.append('totalCount',tc); fd.append('dailyCount',dc);
  fd.append('requestTime',document.getElementById('modal-time').value||'상관없음');
  fd.append('reviewGuide',document.getElementById('modal-guide').value||'');
  fd.append('photoReview',String(document.getElementById('modal-photo').checked));
  fd.append('paymentProxy',String(document.getElementById('modal-payment').checked));
  fd.append('deliveryProxy',String(document.getElementById('modal-delivery').checked));
  fd.append('weekend',String(document.getElementById('modal-weekend').checked));
  const img=document.getElementById('modal-image').files[0]; if(img) fd.append('productImage',img);

  try {
    const d=await(await fetch(`${API}/review/apply`,{method:'POST',body:fd})).json();
    if(d.success){toast('체험단 신청 완료!');document.getElementById('review-modal').classList.add('hidden');await loadHistory();}else toast(d.message);
  } catch(e){toast('서버 연결 실패');}
  btn.disabled=false; btn.textContent='신청하기';
}

// ===== IMAGE =====
function initImageUpload() {
  const area=document.getElementById('img-area'),inp=document.getElementById('modal-image'),ph=document.getElementById('img-placeholder'),pv=document.getElementById('img-preview'),pi=document.getElementById('preview-img'),rm=document.getElementById('img-remove');
  area.onclick = e => { if(e.target!==rm&&!rm.contains(e.target)) inp.click(); };
  inp.onchange = () => { const f=inp.files[0]; if(!f)return; if(f.size>10*1024*1024){toast('10MB 이하만');inp.value='';return;} const r=new FileReader(); r.onload=e=>{pi.src=e.target.result;ph.classList.add('hidden');pv.classList.remove('hidden');}; r.readAsDataURL(f); };
  rm.onclick = e => { e.stopPropagation(); inp.value=''; pi.src=''; pv.classList.add('hidden'); ph.classList.remove('hidden'); };
}

// ===== MARGIN CALCULATOR =====
function initMarginCalc() {
  const $ = id => document.getElementById(id);
  const fields = ['mc-sale','mc-cost','mc-shipping','mc-commission','mc-review','mc-other','mc-qty'];
  fields.forEach(id => {
    const el = $(id);
    if(el) el.oninput = calcMargin;
  });
  calcMargin();
}

function calcMargin() {
  const $ = id => document.getElementById(id);
  const val = id => parseFloat($(id)?.value) || 0;

  const sale = val('mc-sale');
  const cost = val('mc-cost');
  const shipping = val('mc-shipping');
  const commRate = val('mc-commission') || 10.8;
  const reviewCost = val('mc-review');
  const other = val('mc-other');
  const qty = parseInt($('mc-qty')?.value) || 1;

  const commission = Math.round(sale * commRate / 100);
  const totalCost = cost + shipping + commission + reviewCost + other;
  const profit = sale - totalCost;
  const marginRate = sale > 0 ? (profit / sale * 100) : 0;

  $('mc-r-sale').textContent = sale.toLocaleString() + '원';
  $('mc-r-cost').textContent = cost.toLocaleString() + '원';
  $('mc-r-shipping').textContent = shipping.toLocaleString() + '원';
  $('mc-r-commission').textContent = commission.toLocaleString() + '원 (' + commRate + '%)';
  $('mc-r-review').textContent = reviewCost.toLocaleString() + '원';
  $('mc-r-other').textContent = other.toLocaleString() + '원';
  $('mc-r-totalcost').textContent = totalCost.toLocaleString() + '원';

  const profitEl = $('mc-r-profit');
  const rateEl = $('mc-r-rate');
  profitEl.textContent = profit.toLocaleString() + '원';
  rateEl.textContent = marginRate.toFixed(1) + '%';

  profitEl.className = 'mc-value ' + (profit > 0 ? 'positive' : profit < 0 ? 'negative' : '');
  rateEl.className = 'mc-value ' + (marginRate > 0 ? 'positive' : marginRate < 0 ? 'negative' : '');

  // 수량별
  $('mc-r-qty').textContent = qty + '개';
  $('mc-r-total-revenue').textContent = (sale * qty).toLocaleString() + '원';
  $('mc-r-total-cost').textContent = (totalCost * qty).toLocaleString() + '원';
  const totalProfit = profit * qty;
  const tpEl = $('mc-r-total-profit');
  tpEl.textContent = totalProfit.toLocaleString() + '원';
  tpEl.className = 'mc-value ' + (totalProfit > 0 ? 'positive' : totalProfit < 0 ? 'negative' : '');

  // 마진 바
  const bar = $('mc-bar-fill');
  if(bar) {
    const w = Math.max(0, Math.min(100, marginRate));
    bar.style.width = w + '%';
    bar.className = 'mc-bar-fill ' + (marginRate >= 20 ? 'high' : marginRate >= 10 ? 'mid' : 'low');
  }
}

// ===== UTILS =====
function toast(m){const e=document.getElementById('toast');document.getElementById('toast-msg').textContent=m;e.classList.remove('hidden');clearTimeout(window._t);window._t=setTimeout(()=>e.classList.add('hidden'),3000);}
function esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
