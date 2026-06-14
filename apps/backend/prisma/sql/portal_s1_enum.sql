-- Portal S1: novo canal no enum (separado pois ALTER TYPE ADD VALUE nao gosta de transacao)
ALTER TYPE "SourceChannel" ADD VALUE IF NOT EXISTS 'portal';
