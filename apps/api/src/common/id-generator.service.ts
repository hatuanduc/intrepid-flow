import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * IdGeneratorService — chuẩn tạo code/ID cho toàn hệ thống.
 *
 * Các loại code:
 *  - slug  : từ tên + suffix ngẫu nhiên   → role key, product key  (vd: quan_ly_kho_a3f2b1)
 *  - serial: prefix + ngày + counter hex  → order code, invoice    (vd: ORD-20260421-a3f2b1)
 *  - uid   : prefix + random hex          → ref nhanh, không cần ngữ nghĩa (vd: PRD-a3f2b1c2)
 */
@Injectable()
export class IdGeneratorService {
  /**
   * Tạo key kiểu slug từ text (tên vai trò, tên hàng...) + suffix hex ngẫu nhiên.
   * @example slugKey('Quản lý kho') → 'quan_ly_kho_a3f2b1'
   */
  slugKey(text: string, suffixBytes = 3): string {
    const slug = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const suffix = randomBytes(suffixBytes).toString('hex');
    return `${slug}_${suffix}`;
  }

  /**
   * Tạo code kiểu serial: PREFIX-YYYYMMDD-hexsuffix.
   * Dùng cho đơn hàng, hóa đơn, phiếu nhập/xuất.
   * @example serialCode('ORD') → 'ORD-20260421-a3f2b1'
   */
  serialCode(prefix: string, suffixBytes = 3): string {
    const date = new Date();
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');
    const suffix = randomBytes(suffixBytes).toString('hex');
    return `${prefix.toUpperCase()}-${dateStr}-${suffix}`;
  }

  /**
   * Tạo UID ngắn: PREFIX-hexrandom. Dùng cho mã hàng, mã khách hàng...
   * @example uid('PRD') → 'PRD-a3f2b1c2'
   */
  uid(prefix: string, bytes = 4): string {
    const hex = randomBytes(bytes).toString('hex');
    return `${prefix.toUpperCase()}-${hex}`;
  }
}
