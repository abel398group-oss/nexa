/**
 * EmailCryptoService — criptografia AES-256-GCM para senhas SMTP/IMAP.
 *
 * Chave via env EMAIL_ENCRYPTION_KEY (hex de 64 chars = 32 bytes).
 * Formato do ciphertext armazenado: "ENC:<iv_hex>:<authTag_hex>:<cipher_hex>"
 *
 * Migração: decrypt() aceita strings sem o prefixo "ENC:" como plaintext
 * para compatibilidade com senhas antigas até serem sobrescritas via upsert.
 *
 * Para gerar uma chave segura:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;   // 96 bits — recomendado para GCM
const TAG_LEN = 16;  // 128 bits auth tag
const PREFIX = 'ENC:';

@Injectable()
export class EmailCryptoService {
  private readonly logger = new Logger('EmailCryptoService');
  private readonly key: Buffer | null;

  constructor() {
    const raw = process.env.EMAIL_ENCRYPTION_KEY ?? '';
    if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
      this.key = Buffer.from(raw, 'hex');
    } else {
      // Sem chave configurada → modo "passthrough" (sem criptografia).
      // Adequado para dev local; em produção, configure EMAIL_ENCRYPTION_KEY.
      this.key = null;
      if (raw) {
        this.logger.warn('EMAIL_ENCRYPTION_KEY inválida (esperado hex de 64 chars) — email passwords NÃO criptografadas');
      }
    }
  }

  /** Criptografa uma senha. Retorna plaintext se a chave não estiver configurada. */
  encrypt(plaintext: string): string {
    if (!this.key) return plaintext;
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decripta uma senha.
   * - Se começar com "ENC:" → decripta com AES-256-GCM.
   * - Se não começar → retorna como plaintext (migração).
   */
  decrypt(stored: string): string {
    if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
    if (!this.key) {
      this.logger.warn('EMAIL_ENCRYPTION_KEY ausente mas há senha criptografada — não consegue decriptar');
      return stored;
    }
    try {
      const parts = stored.slice(PREFIX.length).split(':');
      if (parts.length !== 3) throw new Error('formato inválido');
      const [ivHex, tagHex, cipherHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const encrypted = Buffer.from(cipherHex, 'hex');
      const decipher = createDecipheriv(ALGO, this.key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
    } catch (e: any) {
      this.logger.error(`EmailCryptoService.decrypt falhou: ${e?.message}`);
      return stored; // fail-open: melhor retornar algo do que quebrar o envio de e-mail
    }
  }
}
