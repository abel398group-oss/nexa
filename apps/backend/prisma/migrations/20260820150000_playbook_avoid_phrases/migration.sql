-- Frases que a Lia não deve escrever, uma por linha.
--
-- A lista de "não fale assim" que existia era um punhado de exemplos escritos por
-- quem redigiu o prompt — um chute sobre o que soaria agressivo. Esta coluna passa a
-- curadoria para quem LÊ a saída: apareceu frase com tom errado, cola aqui e ela vale
-- nas próximas gerações.
--
-- Aditiva, com default vazio: playbook existente continua valendo sem nenhuma frase
-- proibida, que é exatamente o comportamento de hoje.
ALTER TABLE "sales_playbook" ADD COLUMN IF NOT EXISTS "avoid_phrases" TEXT NOT NULL DEFAULT '';
