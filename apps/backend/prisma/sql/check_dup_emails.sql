-- Falha com mensagem se houver email duplicado por tenant (que quebraria o indice unico).
-- Se "Script executed successfully" => ZERO duplicados, db push e seguro.
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM (
    SELECT 1 FROM contacts
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY tenant_id, email
    HAVING COUNT(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'DUPLICADOS: % par(es) de (tenant,email) repetido(s) em contacts', n;
  END IF;
END $$;
