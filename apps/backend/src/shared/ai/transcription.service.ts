import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';

// Transcrição de áudio (Whisper) LOCAL — roda no backend, sem vendor/API key.
// Decodifica o áudio (OGG/Opus do WhatsApp, etc.) com ffmpeg → PCM 16kHz mono → Whisper.
const ENABLED = (process.env.TRANSCRIPTION_ENABLED ?? 'true').toLowerCase() !== 'false';
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'Xenova/whisper-base';
const AUDIO_LANG = process.env.WHISPER_LANG ?? 'portuguese';

/**
 * Transcreve buffers de áudio recebidos (ex.: notas de voz do WhatsApp).
 * Carrega o modelo sob demanda (lazy) e é à prova de falha: se o ffmpeg ou o
 * modelo não estiverem disponíveis, retorna null e o fluxo segue sem travar.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger('Transcription');
  private transcriber: any | null = null;
  private loading: Promise<any | null> | null = null;
  private failed = false;
  private ffmpegPath: string | null | undefined; // undefined = ainda não resolvido

  get enabled(): boolean {
    return ENABLED && !this.failed;
  }

  // Caminho do binário ffmpeg via ffmpeg-static (baixa sozinho, sem instalar no SO).
  private async resolveFfmpeg(): Promise<string | null> {
    if (this.ffmpegPath !== undefined) return this.ffmpegPath;
    try {
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      const mod = await dynamicImport('ffmpeg-static');
      this.ffmpegPath = (mod?.default ?? mod) as string;
      if (!this.ffmpegPath) throw new Error('ffmpeg-static sem caminho');
    } catch (e: any) {
      this.logger.warn(`ffmpeg-static indisponível (${e?.message}) — áudio não será transcrito`);
      this.ffmpegPath = null;
    }
    return this.ffmpegPath;
  }

  private async getTranscriber(): Promise<any | null> {
    if (!this.enabled) return null;
    if (this.transcriber) return this.transcriber;
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
          const { pipeline, env } = await dynamicImport('@xenova/transformers');
          env.allowLocalModels = true;
          const t = await pipeline('automatic-speech-recognition', WHISPER_MODEL);
          this.logger.log(`Modelo Whisper carregado: ${WHISPER_MODEL}`);
          return t;
        } catch (e: any) {
          this.failed = true;
          this.logger.warn(`Falha ao carregar Whisper (${e?.message}) — áudio não será transcrito`);
          return null;
        }
      })();
    }
    this.transcriber = await this.loading;
    return this.transcriber;
  }

  // Decodifica qualquer formato de áudio → Float32Array PCM 16kHz mono (via ffmpeg).
  private decodeToPcm(input: Buffer, ffmpeg: string): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'];
      const proc = spawn(ffmpeg, args, { stdio: ['pipe', 'pipe', 'ignore'] });
      const chunks: Buffer[] = [];
      proc.stdout.on('data', (c: Buffer) => chunks.push(c));
      proc.on('error', reject);
      proc.on('close', (code) => {
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) return reject(new Error(`ffmpeg sem saída (código ${code})`));
        const ab = new ArrayBuffer(buf.length - (buf.length % 4));
        new Uint8Array(ab).set(buf.subarray(0, ab.byteLength));
        resolve(new Float32Array(ab));
      });
      proc.stdin.on('error', () => undefined); // evita EPIPE se o ffmpeg fechar cedo
      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  /**
   * Transcreve um buffer de áudio. Retorna o texto ou null (se desabilitado,
   * indisponível, ou áudio vazio/inválido) — nunca lança.
   */
  async transcribe(audio: Buffer): Promise<string | null> {
    if (!this.enabled || !audio?.length) return null;
    const ffmpeg = await this.resolveFfmpeg();
    if (!ffmpeg) return null;
    const t = await this.getTranscriber();
    if (!t) return null;
    try {
      const pcm = await this.decodeToPcm(audio, ffmpeg);
      if (!pcm.length) return null;
      const out = await t(pcm, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: AUDIO_LANG,
        task: 'transcribe',
      });
      const text = String(out?.text ?? '').trim();
      return text || null;
    } catch (e: any) {
      this.logger.warn(`transcribe falhou: ${e?.message}`);
      return null;
    }
  }
}
