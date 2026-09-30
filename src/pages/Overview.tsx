// =============================================================================
// Overview Page - Professional Hospital Dashboard Template
// =============================================================================

import { useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Database,
  Layers,
  Sparkles,
  ArrowRight,
  Users,
  ClipboardList,
  TestTube,
  CalendarCheck,
  HeartPulse,
  Baby,
  GraduationCap,
  FileText,
  Syringe,
  Stethoscope,
  Copy,
  Check,
  Pill,
  DollarSign,
  Scissors,
  ScanLine,
  Ambulance,
  SmilePlus,
  Siren,
  ClipboardCheck,
  UserRound,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Sample prompt configurations with icons, grouped by department
// ---------------------------------------------------------------------------

interface PromptCard {
  icon: LucideIcon;
  title: string;
  description: string;
  prompt: string;
  gradient: string;
}

interface PromptGroup {
  name: string;
  cards: PromptCard[];
}

// ---------------------------------------------------------------------------
// Shared instruction suffix appended to every dashboard prompt.
//
// Single-line format (no line breaks) so the entire prompt copies as one
// continuous string. Describes what the USER wants from the resulting
// dashboard — not how to implement it.
// ---------------------------------------------------------------------------
const DASHBOARD_INSTRUCTIONS = ' สิ่งที่ผู้ใช้ต้องการจาก dashboard นี้: (การจัดวาง) ให้ dashboard ใหม่นี้เป็น "หน้าหลัก" ของแอปทันทีที่เปิด แทนที่หน้าหลักเดิม โดยไม่ต้องเพิ่มเมนูใหม่ใน Navbar และเปลี่ยนชื่อแอปที่มุมซ้ายบนของ Navbar จาก "Template App" ให้เป็นชื่อสั้น ๆ ภาษาไทยที่สื่อถึง dashboard นี้พร้อมคำบรรยายย่อยให้รู้ว่าเป็นระบบอะไรของ HOSxP. (เนื้อหา) ส่วนหัวของหน้าแสดงชื่อ dashboard ตัวใหญ่ คำอธิบายสั้น ๆ และวันที่/เวลาของข้อมูลล่าสุด มีตัวกรองช่วงเวลาที่ผู้ใช้เลือกได้เอง (วันนี้/7 วัน/30 วัน/เดือนนี้/ปีนี้/กำหนดช่วงเอง) ตัวเลข KPI สำคัญแสดงเด่นด้านบนพร้อมเปรียบเทียบกับช่วงก่อนหน้าเป็นเปอร์เซ็นต์ กราฟและตารางอ่านง่าย มีหัวข้อ หน่วย และคำอธิบายภาษาไทยทั้งหมด รูปแบบวันที่ภาษาไทย (พ.ศ.) ตัวเลขมีคอมมาคั่นหลักพัน. (Drill-down — ทุกจุดของข้อมูลต้องคลิกดูรายละเอียดเพิ่มได้) ทุก KPI card คลิกแล้วเปิด modal แสดงที่มาการคำนวณ แนวโน้มย้อนหลัง 12 เดือน เปรียบเทียบช่วงก่อนหน้าและค่าเฉลี่ย รายการ record ล่าสุดที่ประกอบเป็นตัวเลขนั้น และปุ่ม Export ข้อมูลดิบ.ทุกแท่ง/จุด/ชิ้นในกราฟ (bar, line point, pie slice, heatmap cell) คลิกแล้วเปิด detail view บอกค่าตัวเลขเต็ม สัดส่วนของยอดรวม เปรียบเทียบกับช่วงก่อนหน้า และรายการข้อมูลย่อยที่ประกอบเป็นจุดนั้น (เช่น คลิกแท่ง OPD แผนกอายุรกรรมแล้วแสดงรายชื่อ/HN ที่นับรวม).ทุกแถวในตารางคลิกแล้วขยายดูรายละเอียดเพิ่มแบบ inline หรือ side panel พร้อมข้อมูลที่เกี่ยวข้อง เช่น Lab ยา การวินิจฉัย ประวัติ visit ก่อนหน้า ตามบริบทของ dashboard.legend ของกราฟคลิกแล้ว toggle ซ่อน/แสดง series ได้.หัวคอลัมน์ตารางคลิกเรียงน้อย→มาก ซ้ำเรียงมาก→น้อย คลิกที่ 3 reset.ทุก detail view มีปุ่มปิดและปุ่มย้อนกลับ.ผู้ใช้ต้องรู้ทันทีว่าจุดไหนคลิกได้ด้วย cursor pointer และ hover effect.การคลิกดูรายละเอียดต้องไม่ทำให้หน้า reload หรือหายข้อมูลที่กรองไว้. (ประสบการณ์ใช้งาน) responsive ใช้งานได้ทั้งมือถือ แท็บเล็ต คอมพิวเตอร์ มี loading state ระหว่างโหลด มีข้อความ error ภาษาไทยที่เข้าใจได้พร้อมปุ่มลองใหม่ มี empty state พร้อมคำแนะนำเมื่อยังไม่มีข้อมูล โหลดเร็ว ใช้สีสื่อความหมาย (เขียว=ดี แดง=น่ากังวล). (คุณค่า) เปิดมาแล้วตอบคำถามสำคัญของผู้บริหาร/ผู้ปฏิบัติงานได้ทันทีโดยไม่ต้องคลิกเพิ่ม ข้อมูลตรงกับสิ่งที่เกิดขึ้นจริงในระบบ HOSxP และข้อมูลที่อ่อนไหว (ชื่อผู้ป่วย HN) ต้องจัดการอย่างเหมาะสม';

const PROMPT_GROUPS: PromptGroup[] = [
  {
    name: 'งานบริการผู้ป่วย',
    cards: [
      { icon: Stethoscope, title: 'บริการผู้ป่วยนอก OPD', description: 'ปริมาณ Visit แยกแผนก สิทธิการรักษา ช่วงเวลา วินิจฉัย ICD-10', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบผู้ป่วยนอก สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวน Visit วันนี้ เดือนนี้ เฉลี่ยต่อวัน (2) แผนภูมิจำนวน Visit แยกตามแผนกตรวจ (3) สัดส่วนสิทธิการรักษา (4) Heatmap ช่วงเวลามาตรวจ (5) Top 10 วินิจฉัย ICD-10 ที่พบบ่อย (6) แนวโน้มจำนวน Visit รายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-fuchsia-500 to-pink-600' },
      { icon: ClipboardList, title: 'ระบบผู้ป่วยใน IPD', description: 'สถิติ Admit/Discharge แยก ward สิทธิ LOS โรคหลัก ICD-10', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบผู้ป่วยใน สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวน Admit วันนี้ กำลังนอนรพ. Discharge วันนี้ (2) อัตราครองเตียงแยกหอผู้ป่วย (3) แผนภูมิ Length of Stay เฉลี่ยแยกหอผู้ป่วย (4) Top 10 การวินิจฉัยหลัก ICD-10 (5) สถิติสถานะจำหน่ายและวิธีจำหน่าย${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-indigo-500 to-violet-600' },
      { icon: CalendarCheck, title: 'ระบบนัดหมายผู้ป่วย', description: 'สถิตินัดหมาย มาตามนัด/ไม่มา/ยกเลิก แยกคลินิก แพทย์', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบนัดหมาย สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนนัดวันนี้ มาตามนัด ไม่มา ยกเลิก (2) อัตรามาตามนัดแยกรายคลินิก (3) แผนภูมิแนวโน้มการนัดหมายรายเดือน (4) สรุปสาเหตุการยกเลิกนัด (5) ตาราง Top 10 แพทย์ที่มีนัดมากที่สุด${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-blue-500 to-cyan-600' },
      { icon: Siren, title: 'ห้องฉุกเฉิน ER', description: 'สถิติผู้ป่วยฉุกเฉิน ระดับ Triage แยกประเภท ระยะเวลารอ สาเหตุ', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบห้องฉุกเฉิน สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนผู้ป่วย ER วันนี้ เดือนนี้ กำลังรักษาอยู่ (2) แผนภูมิระดับความเร่งด่วน Triage (Resuscitation/Emergency/Urgent/Less Urgent/Non-Urgent) (3) ระยะเวลารอคอยเฉลี่ยแยกระดับ Triage (4) Top 10 สาเหตุการมา ER (5) สัดส่วนการ Disposition (กลับบ้าน/Admit/ส่งต่อ/เสียชีวิต) (6) แนวโน้มจำนวนผู้ป่วย ER รายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-red-500 to-red-700' },
      { icon: ClipboardCheck, title: 'ระบบคัดกรองพยาบาล OPD Screen', description: 'สถิติการคัดกรอง สัญญาณชีพ BMI ความดัน น้ำตาล ระดับ Triage', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบคัดกรองพยาบาล OPD Screen สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนคัดกรองวันนี้ เดือนนี้ เฉลี่ยต่อวัน (2) แผนภูมิการกระจายค่าความดันโลหิต (BPS/BPD) แบ่งกลุ่ม Normal/Pre-HT/HT (3) สรุปค่า BMI แยกกลุ่ม (ผอม/ปกติ/ท้วม/อ้วน) (4) สถิติน้ำหนัก-ส่วนสูงเฉลี่ยแยกเพศ (5) แนวโน้มจำนวนการคัดกรองรายเดือน (6) ค่าอุณหภูมิและชีพจรเฉลี่ยรายวัน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-teal-500 to-cyan-600' },
      { icon: UserRound, title: 'ระบบ Doctor Workbench', description: 'สถิติการตรวจรักษาแยกแพทย์ จำนวนผู้ป่วย เวลาตรวจ วินิจฉัย สั่งยา', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบ Doctor Workbench การตรวจรักษาของแพทย์ สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนผู้ป่วยที่ตรวจวันนี้ เดือนนี้ จำนวนแพทย์ออกตรวจ (2) ตาราง Ranking แพทย์ตามจำนวนผู้ป่วยที่ตรวจ (3) เวลาเฉลี่ยในการตรวจต่อคน (4) สถิติการวินิจฉัย ICD-10 ที่พบบ่อยแยกแพทย์ (5) จำนวนการสั่งยาและค่ายาเฉลี่ยต่อ Visit แยกแพทย์ (6) แนวโน้มจำนวนผู้ป่วยต่อแพทย์รายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-violet-500 to-indigo-600' },
      { icon: Ambulance, title: 'ระบบส่งต่อผู้ป่วย Refer', description: 'สถิติส่งต่อขาเข้า/ขาออก สถานพยาบาลปลายทาง ระดับความเร่งด่วน', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบส่งต่อผู้ป่วย สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนส่งต่อขาออก ขาเข้า เดือนนี้ ปีนี้ (2) แผนภูมิแนวโน้มการส่งต่อรายเดือน (3) Top 10 สถานพยาบาลที่ส่งต่อไปบ่อย (4) สรุประดับความเร่งด่วนของการส่งต่อ (5) สัดส่วนการส่งต่อ OPD vs IPD${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-orange-500 to-red-600' },
    ],
  },
  {
    name: 'งานสนับสนุนการรักษา',
    cards: [
      { icon: TestTube, title: 'ระบบห้องปฏิบัติการ Lab', description: 'สถิติใบสั่ง Lab สถานะผลตรวจ แยกกลุ่มการตรวจ รายงานค่าวิกฤติ', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบห้องปฏิบัติการ สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนใบสั่ง Lab วันนี้ เดือนนี้ รอผล เสร็จแล้ว (2) แผนภูมิจำนวน Lab แยกตามกลุ่มการตรวจรายวัน (3) สรุปสถานะผลตรวจ (ยืนยันแล้ว/ปฏิเสธ) (4) ตาราง Lab ที่สั่งบ่อยสุด 20 อันดับ (5) แผนภูมิแนวโน้มจำนวนใบสั่ง Lab รายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-emerald-500 to-teal-600' },
      { icon: ScanLine, title: 'ระบบรังสีวิทยา X-Ray', description: 'สถิติสั่งตรวจ X-Ray สถานะยืนยัน/อ่านผล รายได้ค่าบริการ', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบรังสีวิทยา สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนสั่ง X-Ray วันนี้ เดือนนี้ ยืนยันแล้ว อ่านผลแล้ว (2) แผนภูมิจำนวนการตรวจรายเดือน (3) สรุปสถานะ workflow (สั่ง/ยืนยัน/ถ่าย/อ่านผล) (4) Top 10 รายการ X-Ray ที่สั่งบ่อย (5) รายได้ค่าบริการรังสีรายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-cyan-500 to-blue-600' },
      { icon: Pill, title: 'ระบบเภสัชกรรม', description: 'สถิติสั่งยา จ่ายยา มูลค่ายาแยกแผนก สิทธิ แพทย์', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบเภสัชกรรมและสั่งยา สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนใบสั่งยาวันนี้ มูลค่ายารวม จำนวนรายการยา (2) แผนภูมิมูลค่ายาแยกตามแผนก (3) Top 20 ยาที่สั่งบ่อยสุด (4) สัดส่วนมูลค่ายาตามสิทธิ (เบิกได้/จ่ายเอง) (5) แนวโน้มจำนวนใบสั่งยาและมูลค่ารายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-lime-500 to-green-600' },
      { icon: SmilePlus, title: 'ระบบทันตกรรม', description: 'สถิติการรักษาฟัน หัตถการทันตกรรม แยกประเภท ซี่ฟัน แพทย์', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบทันตกรรม สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนผู้ป่วยทันตกรรมวันนี้ เดือนนี้ จำนวนหัตถการ (2) แผนภูมิประเภทหัตถการทันตกรรมที่ทำบ่อย (3) สรุปจำนวนซี่ฟัน/ด้าน/รากที่รักษา (4) สถิติแยกทันตแพทย์ผู้ทำหัตถการ (5) แนวโน้มจำนวนผู้ป่วยทันตกรรมรายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-yellow-500 to-amber-600' },
      { icon: Scissors, title: 'ระบบห้องผ่าตัด OR', description: 'สถิติผ่าตัด ประเภทหัตถการ ICD-9 ห้องผ่าตัด ทีมแพทย์ ดมยา', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบห้องผ่าตัด สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนผ่าตัดวันนี้ เดือนนี้ ฉุกเฉิน/นัดผ่าตัด (2) แผนภูมิประเภทการผ่าตัดที่ทำบ่อย (3) อัตราการใช้งานห้องผ่าตัดแยกห้อง (4) สถิติเวลาผ่าตัดเฉลี่ยและเวลาดมยาเฉลี่ย (5) Top 10 ศัลยแพทย์ที่ผ่าตัดมากที่สุด${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-red-500 to-rose-600' },
    ],
  },
  {
    name: 'งานส่งเสริมสุขภาพชุมชน (PCU)',
    cards: [
      { icon: Users, title: 'ประชากรในเขตรับผิดชอบ', description: 'สรุปประชากรแยกหมู่บ้าน เพศ จำนวนบ้าน ครอบครัว ผู้เสียชีวิต', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องประชากรในเขตรับผิดชอบ สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนประชากรทั้งหมด ชาย หญิง ผู้เสียชีวิต (2) ตารางสรุปแยกรายหมู่บ้าน แสดงจำนวนประชากร ชาย หญิง จำนวนหลังคาเรือน (3) แผนภูมิปิรามิดประชากรตามเพศและช่วงอายุ (4) สรุปปัญหาสุขภาพเรื้อรังแยกหมู่บ้าน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-violet-500 to-purple-600' },
      { icon: HeartPulse, title: 'คัดกรองโรคเรื้อรัง NCD', description: 'คัดกรอง DM/HT ค่าน้ำตาล ค่าความดัน สถานะ Pre-DM/DM/Pre-HT/HT', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบคัดกรองโรคเรื้อรัง NCD สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนคัดกรองทั้งหมด พบเสี่ยง DM พบเสี่ยง HT Pre-DM Pre-HT ปีปัจจุบัน (2) แผนภูมิแนวโน้มผลคัดกรองรายเดือน (3) สรุปการจำแนกค่าความดัน (Normal/Pre-HT/HT) (4) สรุปปัจจัยเสี่ยงเบาหวาน (5) ตารางคลินิกโรคเรื้อรังพร้อมจำนวนสมาชิก${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-rose-500 to-pink-600' },
      { icon: Activity, title: 'ฝากครรภ์และการคลอด (บัญชี 2)', description: 'ทะเบียนฝากครรภ์ ANC ครบ 5 ครั้ง ผลคลอด GA ภาวะแทรกซ้อน', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องบัญชี 2 ฝากครรภ์และการคลอด สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนหญิงฝากครรภ์ทั้งหมด ในเขต คลอดแล้ว (2) อัตราฝากครรภ์ครบ 5 ครั้ง (3) แผนภูมิวิธีคลอด (ปกติ/ผ่าตัดคลอด/สูญญากาศ) (4) สรุปผล Lab ฝากครรภ์ (เลือด ปัสสาวะ ธาลัสซีเมีย) (5) สถิติสถานที่คลอดและ GA สัปดาห์เฉลี่ย${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-rose-600 to-red-600' },
      { icon: Baby, title: 'อนามัยแม่และเด็ก (บัญชี 3)', description: 'ทะเบียนเด็ก 0-5 ปี โภชนาการ น้ำหนัก-ส่วนสูง พัฒนาการ วัคซีน', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องบัญชี 3 อนามัยแม่และเด็ก สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนเด็ก 0-5 ปีทั้งหมด ในเขต นอกเขต (2) แผนภูมิภาวะโภชนาการ (ปกติ/ค่อนข้างผอม/ผอม/อ้วน) (3) สถิติพัฒนาการเด็กแยกตามระดับ (สมวัย/สงสัยล่าช้า/ล่าช้า) (4) ความครอบคลุมวัคซีนตามเกณฑ์ แยกกลุ่มอายุ (5) แผนภูมิสถิติการเลี้ยงลูกด้วยนมแม่${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-amber-500 to-orange-600' },
      { icon: Syringe, title: 'วัคซีนและโภชนาการเด็ก (บัญชี 4)', description: 'ทะเบียน EPI เด็ก 1-5 ปี วัคซีน DTP/OPV/JE/MMR โภชนาการ BMI', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องบัญชี 4 วัคซีน EPI สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนเด็ก 1-5 ปีทั้งหมด ในเขต จำหน่ายแล้ว (2) ความครอบคลุมวัคซีนแยกกลุ่มอายุ (3) สถิติวัคซีนแต่ละชนิด DTP4/5, OPV4/5, JE1-3, MMR2, IPV (4) แผนภูมิภาวะโภชนาการและ BMI (5) ตารางแยกหมู่บ้านพร้อมจำนวนเด็กและ % ครอบคลุมวัคซีน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-sky-500 to-blue-600' },
      { icon: GraduationCap, title: 'สุขภาพโรงเรียน (บัญชี 5)', description: 'ตรวจสุขภาพนักเรียน น้ำหนัก-ส่วนสูง BMI ตา หู ฟัน ธาลัสซีเมีย', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องบัญชี 5 สุขภาพโรงเรียน สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนนักเรียนทั้งหมด ตรวจแล้ว ยังไม่ตรวจ (2) แผนภูมิภาวะโภชนาการและ BMI ของนักเรียน (3) สถิติปัญหาสุขภาพ: สายตา หู ฟันผุ (4) ผลคัดกรองธาลัสซีเมีย (5) ตารางแยกโรงเรียนพร้อมจำนวนนักเรียนและ % ได้ตรวจสุขภาพ${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-teal-500 to-emerald-600' },
      { icon: Users, title: 'วางแผนครอบครัว (บัญชี 6)', description: 'หญิงวัยเจริญพันธุ์ วิธีคุมกำเนิด ตรวจเต้านม คัดกรองมะเร็ง', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องบัญชี 6 วางแผนครอบครัว สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนหญิงวัยเจริญพันธุ์ทั้งหมด ในเขต จำหน่ายแล้ว (2) แผนภูมิวงกลมสัดส่วนวิธีคุมกำเนิด (3) สถิติการตรวจเต้านมด้วยตนเอง (ได้รับคำแนะนำ/ทำได้ถูกต้อง) (4) ผลคัดกรองมะเร็งเต้านม (5) สรุปการให้บริการวางแผนครอบครัวรายเดือน${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-pink-500 to-rose-600' },
    ],
  },
  {
    name: 'งานบริหารจัดการ',
    cards: [
      { icon: DollarSign, title: 'ระบบการเงินและรายได้', description: 'รายได้รวม แยกหมวดค่ารักษา สิทธิ สรุปลูกหนี้ OPD/IPD', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบการเงิน สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI รายได้รวมวันนี้ เดือนนี้ ลูกหนี้คงค้าง ส่วนลด (2) แผนภูมิรายได้แยกหมวดค่ารักษา 17 หมวด (3) สัดส่วนรายได้ OPD vs IPD (4) แนวโน้มรายได้รายเดือนเปรียบเทียบปีก่อน (5) สรุปรายได้แยกสิทธิการรักษา (UC/ประกันสังคม/จ่ายเอง)${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-green-500 to-emerald-600' },
      { icon: FileText, title: 'ระบบเวชระเบียน OPD/IPD', description: 'สถิติยืม-คืนแฟ้ม ค้างคืน เกินกำหนด แยกแผนก', prompt: `/bms-speckit-auto ค้นหาข้อมูลจาก knowledge ของ HOSxP (collection hosxp) เรื่องระบบเวชระเบียน สร้าง dashboard ใหม่ 1 หน้า แสดง: (1) KPI จำนวนยืมวันนี้ ค้างคืน คืนแล้ว เกินกำหนด (2) แผนภูมิการยืม-คืนรายเดือน (3) ตารางแฟ้มค้างคืนพร้อม HN วันที่ยืม แผนก กำหนดคืน จำนวนวันค้าง (4) สรุปแยกแผนกที่ยืมบ่อย (5) แผนภูมิแนวโน้มระยะเวลายืมเฉลี่ย${DASHBOARD_INSTRUCTIONS}`, gradient: 'from-slate-500 to-gray-600' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Overview() {
  const { session } = useBmsSessionContext();
  const userName = session?.userInfo.name || 'ผู้ใช้';

  const [selectedCard, setSelectedCard] = useState<PromptCard | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  const openDialog = useCallback((card: PromptCard) => {
    setSelectedCard(card);
    setEditedPrompt(card.prompt);
    setCopied(false);
  }, []);

  const closeDialog = useCallback(() => {
    setSelectedCard(null);
  }, []);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(editedPrompt).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // Clipboard API unavailable (e.g. insecure context)
        const textarea = document.createElement('textarea');
        textarea.value = editedPrompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    );
  }, [editedPrompt]);

  return (
    <div className="overview-container">
      {/* -----------------------------------------------------------------
          Hero Section
          ----------------------------------------------------------------- */}
      <section className="hero-section">
        <div className="hero-bg-pattern" />
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-Powered Dashboard</span>
          </div>
          <h1 className="hero-title">
            สวัสดี, <span className="text-gradient">{userName}</span>
          </h1>
          <p className="hero-subtitle">
            เริ่มต้นสร้าง Dashboard ด้วย AI ได้ทันที — เลือก Template ด้านล่าง
            หรือเขียน Prompt ของคุณเอง
          </p>
          <div className="hero-meta">
            <div className="hero-meta-item">
              <Database className="h-4 w-4" />
              <span>
                {session?.databaseType === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Database
              </span>
            </div>
            <div className="hero-meta-divider" />
            <div className="hero-meta-item">
              <Layers className="h-4 w-4" />
              <span>{PROMPT_GROUPS.reduce((sum, g) => sum + g.cards.length, 0)} Dashboard Templates</span>
            </div>
          </div>
        </div>
      </section>

      {/* -----------------------------------------------------------------
          Dashboard Templates Grid
          ----------------------------------------------------------------- */}
      <section className="templates-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Dashboard Templates</h2>
            <p className="section-description">
              คลิกเพื่อดูและแก้ไข Prompt ก่อนคัดลอกไปวางในช่องแชท
            </p>
          </div>
        </div>

        {PROMPT_GROUPS.map((group) => (
          <div key={group.name} className="templates-group">
            <h3 className="templates-group-title">{group.name}</h3>
            <div className="templates-grid">
              {group.cards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <button
                    key={index}
                    onClick={() => openDialog(card)}
                    className="template-card group"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className={`template-icon-wrapper bg-gradient-to-br ${card.gradient}`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="template-content">
                      <h3 className="template-title">{card.title}</h3>
                      <p className="template-description">{card.description}</p>
                    </div>
                    <div className="template-action">
                      <span className="template-action-text">ดู Prompt</span>
                      <ArrowRight className="h-4 w-4 template-action-icon" />
                    </div>
                    <div className="template-hover-gradient" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* -----------------------------------------------------------------
          Quick Start Guide
          ----------------------------------------------------------------- */}
      <section className="guide-section">
        <div className="guide-card">
          <div className="guide-content">
            <h3 className="guide-title">วิธีใช้งาน</h3>
            <ol className="guide-steps">
              <li>
                <span className="guide-step-number">1</span>
                <span>เลือก Template ที่ต้องการจากด้านบน</span>
              </li>
              <li>
                <span className="guide-step-number">2</span>
                <span>ตรวจสอบและแก้ไข Prompt ตามต้องการ แล้วคัดลอก</span>
              </li>
              <li>
                <span className="guide-step-number">3</span>
                <span>วางในช่องแชทและกดส่ง — AI จะสร้าง Dashboard ให้อัตโนมัติ</span>
              </li>
            </ol>
          </div>
          <div className="guide-visual">
            <div className="guide-visual-dot" />
            <div className="guide-visual-line" />
            <div className="guide-visual-dot" />
            <div className="guide-visual-line" />
            <div className="guide-visual-dot guide-visual-dot-active">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </section>

      {/* -----------------------------------------------------------------
          Prompt Detail Dialog
          ----------------------------------------------------------------- */}
      <Dialog open={selectedCard !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            {selectedCard && (
              <>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br ${selectedCard.gradient}`}>
                    <selectedCard.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <DialogTitle>{selectedCard.title}</DialogTitle>
                    <DialogDescription>{selectedCard.description}</DialogDescription>
                  </div>
                </div>
              </>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              แก้ไข Prompt ได้ตามต้องการก่อนคัดลอก
            </label>
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-4 py-3 text-base leading-relaxed shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              rows={12}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {editedPrompt !== selectedCard?.prompt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { if (selectedCard) setEditedPrompt(selectedCard.prompt); }}
              >
                รีเซ็ต
              </Button>
            )}
            <Button onClick={copyToClipboard} className="gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  คัดลอกแล้ว!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  คัดลอก Prompt
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
