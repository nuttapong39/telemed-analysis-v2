# Handoff: Telemed — รหัสมาตรฐาน TELMED + แก้ข้อที่ Marketplace ไม่อนุมัติ

อัปเดต 5 ต.ค. 2569 · branch `feat/telmed-standard-code`

## ที่มา

1. **เปลี่ยน query**: เลิกกรองด้วย icode ของโรงพยาบาลเอง 3 ตัว (3002487 / 3002488 / 3002416) มากรองด้วยรหัส ADP ของ สปสช.
   `nhso_adp_code = 'TELMED' AND nhso_adp_type_id = 3` แทน เพื่อให้ใช้ได้ทุกโรงพยาบาล และเพิ่มมิติประเภทการมา (`ovst.ovstist`)
   เหตุผลอยู่ใน `docs/adr/0001-telmed-standard-code-as-service-identity.md` ส่วนคำศัพท์อยู่ใน `CONTEXT.md`
2. **HOSxP Marketplace ไม่อนุมัติ (3 ต.ค. 2569)** กองบรรณาธิการทดสอบบนฐาน PostgreSQL แล้วพบ 4 ข้อ
   | ข้อ | ปัญหา | สิ่งที่แก้ใน branch นี้ |
   |---|---|---|
   | 1 | Visit = 0 ทุกมุมมอง ทั้งที่มีรายการ (เช่น B2B มิ.ย. 69 มี 3 รายการ 7,500 บาท) | นับ Visit จาก VN ถ้าไม่มี VN ใช้ HN + วันที่แทน และใช้ `LEFT JOIN ovst` เพื่อไม่ให้รายการหาย **ยังไม่ได้ยืนยันสาเหตุจริง** (ดูงานค้างข้อ 1) |
   | 2 | ค่าเฉลี่ยต่อ Visit ใช้ไม่ได้ | แก้ได้พร้อมข้อ 1 และถ้าช่วงนั้นไม่มี Visit เลยจะขึ้นข้อความ "ไม่มี Visit ในช่วงนี้" แทน −100% |
   | 3 | ไม่มีช่องค้นหาและเรียงคอลัมน์ | ตาราง "รายละเอียดรายบริการ" (TanStack) ค้นหา เรียง และแบ่งหน้าได้ ตารางสรุปรายเดือนเรียงได้ |
   | 4 | console มี warning ขนาดกราฟ Recharts | กำหนดความสูงกราฟเป็นตัวเลข มี test คอยจับ warning นี้ |

## สถานะตอนส่งต่อ

- **branch:** `feat/telmed-standard-code` มี 10 commits ต่อจาก `main` (`553ba04` … `7dede75`)
- **ผลตรวจ:**
  - `npm test` ผ่าน 488/488
  - `npx tsc -b` ผ่าน
  - `npm run build` ผ่าน ไม่มี warning ขนาด chunk
  - `npm run lint` ไฟล์ที่แก้ไม่มี error ใหม่ (ที่เหลือมีอยู่แล้วใน `main` และอยู่ในไฟล์ที่ไม่ได้แตะ)
- **remote:**
  - push แล้วที่ GitHub (`github`, https://github.com/nuttapong39/telemed-analysis-v2) ทั้ง `main` และ branch นี้
  - **ยังไม่ได้ push ไป `origin` (git ของ BMS)** ซึ่งเป็นที่ที่ deploy ไป Marketplace
- **ยังไม่เคยทดสอบกับ HOSxP จริง:** ไม่รู้ว่า query ใหม่รันบนฐานจริงได้ และยังไม่เคยเห็นหน้า dashboard ตอนมีข้อมูลใน browser จริง

## ข้อตัดสินใจที่สรุปแล้ว

| # | ประเด็น | ข้อสรุป |
|---|---|---|
| Q1 | การแยกบริการ | แยกตาม icode แบบ dynamic ทุก icode ที่ติด TELMED ใช้ชื่อจาก `nondrugitems.name` |
| Q2 | ประเภทการมา | แยกย่อยใน Detail modal (ชื่อดึงจากตาราง `ovstist` ด้วย query แยก ถ้าดึงไม่ได้แสดงรหัสแทน) |
| Q3 | จำนวนชิ้น / ไม่คิดเงิน | เพิ่ม `total_qty` และ `zero_price_rows` กลับเข้า SQL |
| Q4 | กติกา SQL | ใช้ `EXTRACT` (ห้าม `TO_CHAR`), bind `:start_date/:end_date` ครอบ 2 ปีงบ, bind `:adp_code/:adp_type_id`, มี `LIMIT` |
| Q5 | หลายบริการ | แสดงทุก icode เรียงตาม icode ใช้ 8 สีและไม่วนซ้ำ บริการที่ 9 ขึ้นไปรวมเป็น "อื่นๆ" สีเทา |
| Q6 | ตารางประเภทการมา | ใช้ช่วงเดือนเดียวกับการ์ด: ประเภทการมา, Visit, ยอดเงิน, สัดส่วน, Visit ปีงบก่อน |
| Q7 | CSV | 1 แถวต่อ เดือน × icode × ประเภทการมา |
| Q8 | นิยาม | ยึด TELMED เป็นหลัก ลบ B2B/B2C/Telehealth ออกจาก glossary |
| Q9 | สาเหตุ Visit = 0 | ผู้ใช้รัน SQL ตรวจสอบ A/B เอง |
| Q10 | รายการที่ไม่มี VN | นับ Visit จาก HN + วันที่รับบริการ |
| Q11 | ค้นหา / เรียง | ตารางรายละเอียดใหม่ด้วย TanStack + ตารางรายเดือนเรียงได้ |

## งานค้าง (เรียงตามลำดับที่ควรทำ)

### 1. รัน SQL ตรวจสอบสาเหตุ Visit = 0

รันบน PostgreSQL ที่มีข้อมูลจริง และถ้าทำได้ ขอให้กองบรรณาธิการรันบนฐานทดสอบของเขาด้วย

```sql
-- A
SELECT COUNT(*) AS item_rows, COUNT(o.vn) AS rows_with_vn, COUNT(DISTINCT o.vn) AS distinct_vn,
       COUNT(v.vn) AS rows_matching_ovst, COUNT(o.an) AS rows_with_an
FROM opitemrece o LEFT JOIN ovst v ON v.vn = o.vn
WHERE o.icode IN ('3002487','3002488','3002416') AND o.vstdate BETWEEN '2025-10-01' AND '2026-09-30';

-- B
SELECT icode, name, nhso_adp_code, nhso_adp_type_id FROM nondrugitems
WHERE nhso_adp_code = 'TELMED' OR icode IN ('3002487','3002488','3002416');
```

| ผลที่ได้ | ทำอะไรต่อ |
|---|---|
| `rows_with_vn` = 0 หรือน้อยกว่า `item_rows` | ยืนยันสาเหตุ สิ่งที่แก้ใน branch นี้ (นับจาก HN + วันที่) ตรงจุด |
| `distinct_vn > 0` แต่แอปเดิมยังแสดง 0 | สาเหตุอยู่ที่อื่น (API/client) ให้เก็บ response จริงจาก DevTools > Network ก่อนแก้ต่อ |
| B ไม่มีแถว TELMED | ฐานนั้นยังไม่ตั้งรหัส dashboard จะแสดงหน้าว่างพร้อมคำแนะนำ ต้องแจ้งกองบรรณาธิการ |

### 2. ทดสอบกับ session HOSxP จริง

`npm run dev` แล้วเปิดด้วย `?bms-session-id=…` (ควรใช้ฐาน PostgreSQL)

- [ ] Visit ไม่เป็น 0 ในเดือนที่มีรายการ และค่าเฉลี่ยต่อ Visit แสดงค่า
- [ ] ผลรวม Visit / ยอดเงิน ต่อ เดือน × icode ตรงกับ SQL ดิบ
- [ ] ตารางรายละเอียดค้นหาและเรียงได้ ตารางรายเดือนเรียงได้
- [ ] **console ไม่มี warning** ทั้งตอนโหลดหน้าและตอนเปิด Detail modal
- [ ] CSV เปิดใน Excel ได้ ภาษาไทยไม่เพี้ยน
- [ ] ถ้า query ชื่อประเภทการมา (`SELECT * FROM ovstist`) ล้มเหลว dashboard ยังใช้งานได้ (แสดงรหัสแทนชื่อ แต่จะมี error toast ขึ้นหนึ่งครั้ง)

### 3. ปีงบที่เปิดเป็นค่าเริ่มต้น

ตั้งแต่ 1 ต.ค. 2569 dashboard จะเปิดที่ปีงบ 2570 ซึ่งยังแทบไม่มีข้อมูล ทำให้ reviewer เห็นหน้า "ปีงบประมาณนี้เพิ่งเริ่มต้น" ก่อน
มีปุ่มไปปีงบ 2569 อยู่แล้ว (พฤติกรรมนี้มีมาตั้งแต่ก่อน branch นี้) ต้องตัดสินใจว่าจะแจ้งในข้อความตอบ หรือเปลี่ยนให้เปิดปีงบก่อนหน้าเมื่อปีปัจจุบันยังไม่มีข้อมูล

### 4. ข้อ code review ที่ยังเปิดอยู่

ข้อที่แก้แล้วใน `7dede75`: `CONCAT` กับ HN ว่าง (MySQL/PostgreSQL ให้ผลต่างกัน), ค่าเฉลี่ยต่อ Visit แสดง −100%, fallback `icode` ที่ไม่ได้ใช้

**Spec**
- ผู้ป่วยคนเดียวในวันเดียวกัน ถ้ามีทั้งรายการที่มี VN และไม่มี VN จะนับเป็น 2 Visit
- สีของบริการเปลี่ยนได้เมื่อสลับปีงบ และ "(n รหัส)" ในการ์ดรวมนับรหัสที่มีแค่ในปีก่อนด้วย
- คอลัมน์ "Visit ปีงบ {ปีก่อน}" ในตารางประเภทการมานับเฉพาะเดือนที่ตรงกับช่วงเปรียบเทียบ ไม่ใช่ทั้งปี (หัวคอลัมน์อาจทำให้เข้าใจผิด)
- ข้อความบนหน้า login (`AuthShell.tsx`) เขียนใหม่โดยไม่ได้อยู่ใน plan (ต้องแก้อยู่แล้วเพราะเลิกใช้รายการ 3 บริการ)

**Standards** (`CLAUDE.md`, `.specify/memory/constitution.md`)
- **กฎ 400 บรรทัด:** `src/services/telemed.ts` 619 บรรทัด (เกินตั้งแต่ใน `main` ที่ 432) และ `src/pages/TelemedDashboard.tsx` 432 บรรทัด ควรแยกไฟล์
- **logic อยู่ใน component:** `loadVisitTypeNames` และ `derivationFor` (หน้า dashboard), การสร้างแถวใน `DetailDataTable`, `pick/sum` ใน `DetailModal` ควรย้ายไป `src/services/`
- **คำนำหน้า commit:** `c2bbe33` ใช้ `build:` ซึ่งไม่อยู่ในรายการที่ constitution อนุญาต (push แล้ว ถ้าจะแก้ต้อง force push)
- **คำไม่ตรง glossary:** บางที่ใช้ "จำนวนเงิน" แทน "ยอดเงิน" และ "รหัส" แทน "รหัสบริการ"
- **ทำซ้ำ:** การเช็ค `TOTAL_KEY` และข้อความ `รหัส {icode}` ซ้ำหลายจุด, `TOTAL_COLUMN` ใน `MonthlyTable` ซ้ำกับ `TOTAL_KEY`
- **ผูกกับลำดับคอลัมน์:** `DetailDataTable` ใช้ `getVisibleCells().slice(3)`
- **อื่นๆ:** ข้อความ `'TELMED'` / `'ประเภท 3'` เขียนตรงใน UI copy, selection ถูกคำนวณสองที่, พารามิเตอร์ของ `summarizeByVisitType` ส่งเป็นกลุ่มเดิมซ้ำๆ

### 5. เปิด PR และส่งขึ้น `origin`

- เปิด PR `feat/telmed-standard-code` → `main` บน GitHub:
  https://github.com/nuttapong39/telemed-analysis-v2/pull/new/feat/telmed-standard-code
- push ไป `origin` (git ของ BMS) เมื่อพร้อม deploy

### 6. ร่างข้อความตอบกองบรรณาธิการ

ชี้แจงทีละข้อ (1–4) ว่าแก้อย่างไร ตามตาราง "ที่มา" ด้านบน และแจ้งเพิ่ม:
- dashboard อ่านจากรายการที่ตั้งรหัสมาตรฐาน TELMED ประเภท 3 แล้ว ฐานทดสอบต้องตั้งรหัสนี้ให้รายการ Telemedicine
- ผลของ SQL ตรวจสอบ A/B (ถ้ามี)
- เรื่องปีงบที่เปิดเป็นค่าเริ่มต้น (งานค้างข้อ 3)

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/services/telemed.ts` | SQL, normalize, series, สรุปตามประเภทการมา, CSV |
| `src/pages/TelemedDashboard.tsx` | หน้า dashboard, โหลด 3 query พร้อมกัน, การ์ด, empty state |
| `src/components/telemed/DetailDataTable.tsx` | ตารางรายละเอียด ค้นหา/เรียง/แบ่งหน้า |
| `src/components/telemed/MonthlyTable.tsx`, `SortableHeader.tsx` | ตารางรายเดือนที่เรียงได้ |
| `src/components/telemed/DetailModal.tsx` | รายละเอียดรายบริการ + แยกตามประเภทการมา |
| `src/components/telemed/MonthlyTrendChart.tsx` | กราฟแท่งซ้อนรายเดือน |
| `src/components/telemed/serviceTheme.ts`, `src/index.css` | ชุดสี 8 สี (`--svc-1…8`, `--svc-other`) |
| `vite.config.ts` | แยก chunk vendor-react / vendor-charts / vendor-table |
| `tests/unit/telemed.test.ts`, `tests/component/TelemedDashboardParts.test.tsx` | test หลักของงานนี้ |
