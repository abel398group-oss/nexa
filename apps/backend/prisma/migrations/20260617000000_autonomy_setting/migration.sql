-- Kill switch da autonomia da IA por canal (ADR 012) — tabela global singleton.
-- CreateTable
CREATE TABLE "autonomy_setting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "master" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "changed_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autonomy_setting_pkey" PRIMARY KEY ("id")
);

-- Seed da linha global (autonomia ligada por padrão; ajuste depois pela UI).
INSERT INTO "autonomy_setting" ("id", "master", "whatsapp", "email", "updated_at")
VALUES ('global', true, true, true, NOW())
ON CONFLICT ("id") DO NOTHING;
