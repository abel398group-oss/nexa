# Fix — Nome do contato (pushName do WhatsApp) não aparece no Nexa

> Sintoma: no WhatsApp o contato tem nome (ex.: "Henrique Martinazzo"), mas no
> inbox do Nexa a conversa aparece só com o telefone "(11) 94761-2634".

## Causa raiz

O nome do WhatsApp (**pushName**) chega no webhook, mas **não é lido nem salvo**.

1. `apps/backend/src/application/whatsapp/whatsapp.service.ts` → `normalize()`
   extrai `text` e `phone`, mas **não extrai o pushName**.
2. No mesmo arquivo, `process()` cria o contato **sem nome** (linha ~240):
   ```ts
   const contact = await this.contacts.create(tenantId, { phone: n.phone, source: 'whatsapp' });
   ```
3. Resultado: o contato fica com `name = null` → o inbox renderiza o telefone.

O pushName existe no payload (engine GOWS do WAHA), em:
`payload._data.Info.PushName` — confirmado no webhook real (ex.: `"PushName":"Abel Magalhães Ramos"`).

> Atenção (ADR 020 — enriquecimento de contato): o campo `nameSource` define a
> precedência do nome: **pushname (baixa) < tms < manual**. O ajuste deve gravar o
> pushName SOMENTE quando o nome atual estiver vazio ou também for `pushname` —
> nunca sobrescrever um nome vindo do TMS ou definido manualmente.

## Ajuste proposto (3 passos, todos no backend)

### 1) `normalize()` — extrair o pushName
Em `whatsapp.service.ts`:

- Adicionar ao tipo `Normalized`:
  ```ts
  pushName: string;
  ```
- Dentro de `normalize()`, antes do `return`, calcular:
  ```ts
  const pany = payload as any;
  const pushName = String(
    pany._data?.Info?.PushName ||
    pany.notifyName ||
    pany._data?.PushName ||
    pany._data?.notifyName ||
    ''
  ).trim();
  ```
- Incluir `pushName` no objeto retornado.

### 2) `contacts.service.ts` — método que respeita a precedência (ADR 020)
Adicionar:
```ts
// Grava o nome do contato a partir do pushName do WhatsApp respeitando a
// precedência do nameSource (ADR 020): pushname < tms < manual.
// Só grava se o nome atual estiver vazio OU também for 'pushname'.
async applyPushName(tenantId: string, phone: string, pushName: string) {
  if (!pushName) return;
  const p = normalizePhone(phone) || phone;
  const c = await this.prisma.contact.findUnique({
    where: { tenantId_phone: { tenantId, phone: p } },
  });
  if (!c) return;
  const src = (c as any).nameSource ?? 'pushname';
  if (c.name && src !== 'pushname') return; // nome de fonte superior → não toca
  if (c.name === pushName) return;          // sem mudança
  await this.prisma.contact.update({
    where: { id: c.id },
    data: { name: pushName, nameSource: 'pushname' },
  });
}
```

### 3) `process()` — chamar o método após criar/achar o contato
Em `whatsapp.service.ts`, logo após o `contacts.create(...)` (linha ~240):
```ts
const contact = await this.contacts.create(tenantId, { phone: n.phone, source: 'whatsapp' });
if (n.pushName) {
  await this.contacts.applyPushName(tenantId, n.phone, n.pushName).catch(() => null);
}
```

> Alternativa mais enxuta (menos segura): passar `name`/`nameSource` direto no
> `contacts.create`. NÃO recomendado — o `create()` faz upsert com `update: { ...dto }`,
> então sobrescreveria o nome (inclusive um vindo do TMS) a cada mensagem. Por isso
> o método dedicado `applyPushName` é a forma correta.

## Como testar
1. Mandar uma mensagem de um número **novo** cujo WhatsApp tenha nome definido.
   → No inbox do Nexa, a conversa deve mostrar o **nome** (não só o telefone).
2. Num contato que já tenha nome vindo do **TMS** (`nameSource = 'tms'`), mandar uma
   mensagem → o nome **não** pode ser trocado pelo pushName.
3. `pnpm test` (de `apps/backend`) — deve seguir verde.

## Arquivos afetados
- `apps/backend/src/application/whatsapp/whatsapp.service.ts` (normalize + process)
- `apps/backend/src/application/contacts/contacts.service.ts` (novo método `applyPushName`)

Nenhuma migração de banco — o `Contact` já tem `name` e `nameSource`.
