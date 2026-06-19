# SLA — Acordo de Nível de Serviço por Plano

> Nexa | Versão: 1.0 | Junho 2026
> Revisar a cada 6 meses conforme crescimento da base.

---

## 1. Disponibilidade da Plataforma

| Plano | Uptime garantido | Janela de manutenção | Suporte |
|-------|-----------------|---------------------|---------|
| **Starter** | 99% (~7,2h indisponível/mês) | Seg-Sex 02h-04h | E-mail (48h úteis) |
| **Growth** | 99,5% (~3,6h/mês) | Seg-Sex 02h-04h | E-mail (24h úteis) |
| **Scale** | 99,9% (~43min/mês) | Dom 02h-04h | Chat + E-mail (8h úteis) |
| **Enterprise** | 99,95% (~22min/mês) | Negociado | Telefone + Slack dedicado (4h úteis) |

### Cálculo de uptime

```
Uptime % = (Minutos totais no mês - Minutos de downtime) / Minutos totais × 100
Downtime: período em que /api/health retorna != 200 por mais de 5 minutos consecutivos
Excluído: manutenções programadas com aviso de 48h
```

---

## 2. Limites por Plano

| Recurso | Starter | Growth | Scale | Enterprise |
|---------|---------|--------|-------|-----------|
| Tenants | 1 | 1 | 1 | Multi-tenant |
| Contatos | 5.000 | 25.000 | 100.000 | Ilimitado |
| Mensagens/mês (WhatsApp) | 2.000 | 10.000 | 50.000 | Ilimitado |
| Campanhas simultâneas | 2 | 5 | Ilimitado | Ilimitado |
| Números WhatsApp | 1 | 3 | 10 | Ilimitado |
| Usuários do painel | 3 | 10 | 30 | Ilimitado |
| Base de conhecimento (itens) | 100 | 500 | 2.000 | Ilimitado |
| Retenção de histórico | 6 meses | 12 meses | 24 meses | Conforme contrato |
| Canal e-mail | ❌ | ✅ | ✅ | ✅ |
| Portal de suporte (clientes) | ❌ | ❌ | ✅ | ✅ |
| Integração TMS (conector) | ✅ | ✅ | ✅ | ✅ |
| API de integração | ❌ | Leitura | Completo | Completo |
| SLA formal (contrato) | ❌ | ❌ | ✅ | ✅ |

---

## 3. Tempos de Resposta da IA (SLA Técnico)

| Métrica | Alvo | Medido em |
|---------|------|-----------|
| Tempo de resposta da Lia (p50) | < 3s | `ai_messages.latency_ms` |
| Tempo de resposta da Lia (p95) | < 8s | `ai_messages.latency_ms` |
| Tempo de entrega WhatsApp (p95) | < 5s após Lia processar | Recibo WAHA |
| Polling IMAP (e-mail inbound) | < 60s | `email_channels.last_poll_at` |

---

## 4. Créditos por Indisponibilidade

Aplicáveis apenas nos planos Scale e Enterprise com SLA formal em contrato.

| Downtime mensal | Crédito |
|-----------------|---------|
| 0,1% – 0,5% acima do SLA | 10% da mensalidade |
| 0,5% – 1% acima do SLA | 25% da mensalidade |
| > 1% acima do SLA | 50% da mensalidade |

Créditos são concedidos como desconto na próxima fatura. Não são convertíveis em dinheiro.

**Não são creditados:**
- Indisponibilidade causada por WhatsApp/Meta (serviço de terceiros)
- Ataques DDoS de grande escala
- Manutenções programadas com aviso
- Problemas de infraestrutura do cliente (VPN, rede local)

---

## 5. Exclusões e Responsabilidades de Terceiros

| Serviço | Responsável | SLA próprio |
|---------|-------------|-------------|
| WhatsApp / Meta | Meta (não controlado pela Hiperviás) | Não garantido |
| Anthropic Claude API | Anthropic | 99,9% (verificar anthropic.com) |
| DigitalOcean (Droplet) | DigitalOcean | 99,99% (droplets com volume) |
| DNS / CDN | Provedor do cliente | — |

---

## 6. Processo de Incidente

1. **Detecção:** monitor externo (UptimeRobot / BetterStack) detecta `/api/health` != 200
2. **Alerta:** notificação para canal de emergência da equipe
3. **Resposta:** dentro do SLA de resposta por plano (seção 1)
4. **Comunicação ao cliente:** e-mail + painel de status (pendente: implementar página de status)
5. **Resolução e postmortem:** dentro de 5 dias úteis para SEV-1/2

---

## 7. Itens Pendentes para Suporte ao SLA

| Item | Plano | Prioridade |
|------|-------|-----------|
| Página de status pública (status.nexa.com.br) | Scale+ | 🔴 Alta |
| Monitor externo (UptimeRobot ou BetterStack) | Todos | 🔴 Alta |
| Alertas automáticos para o time (PagerDuty / WhatsApp) | Todos | 🔴 Alta |
| Enforcement de limites por plano no backend | Todos | 🟡 Média |
| Dashboard de latência da IA em tempo real | Scale+ | 🟡 Média |
