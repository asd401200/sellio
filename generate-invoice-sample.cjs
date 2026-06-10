// 데모 주문(셀러 3명 × 12건 = 36건) 기반 송장 입력용 엑셀 생성
// 실행: node generate-invoice-sample.cjs
const demo = require('./demo');
const XLSX = require('xlsx');

const rows = [];
let inv = 629000000000; // CJ대한통운 운송장 형태 샘플
demo.DEMO_SELLERS.forEach(sd => {
  const r = demo.mockCoupang('GET', `/v2/providers/openapi/apis/api/v4/vendors/${sd.vendorId}/ordersheets?status=ALL`);
  (r.data.data || []).forEach(o => {
    rows.push({
      '주문번호': o.orderId,
      '수령인': o.receiver.name,
      '상품명': [o.sellerProductName, o.sellerProductItemName].filter(Boolean).join(' / '),
      '연락처': o.receiver.receiverPhoneNumber1 || o.receiver.safeNumber || '',
      '택배사': 'CJ대한통운',
      '송장번호': String(inv++),
    });
  });
});

const ws = XLSX.utils.json_to_sheet(rows);
ws['!cols'] = [18, 12, 34, 16, 12, 16].map(w => ({ wch: w }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '송장입력');
const out = 'C:/Users/qkrwh/OneDrive/Desktop/송장입력_샘플.xlsx';
XLSX.writeFile(wb, out);
console.log(`생성 완료: ${out} (${rows.length}건)`);
