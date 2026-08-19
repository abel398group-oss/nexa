-- Aquecimento: carimbo de quando o número entrou no degrau atual.
--
-- A escada (`WARMUP_DAILY = [10,15,20,30]`) era lida a cada envio e escrita por
-- ninguém: todo número ficava no degrau 0 (10 msgs/dia) para sempre. Sem saber há
-- quanto tempo o número está no degrau, não havia como decidir a subida.
--
-- Aditiva e anulável de propósito: os números que já existem entram com NULL, e a
-- decisão cai no `created_at` deles. Preencher com now() aqui reiniciaria o relógio
-- de quem já tem meses de histórico — justamente quem deveria subir primeiro.
ALTER TABLE "sender_numbers" ADD COLUMN IF NOT EXISTS "warmup_stage_since" TIMESTAMP(3);
