-- Migration: web_chat ao enum SourceChannel (ADR-027)
-- Aditiva: ADD VALUE IF NOT EXISTS é seguro em qualquer estado do banco.

ALTER TYPE "SourceChannel" ADD VALUE IF NOT EXISTS 'web_chat';
