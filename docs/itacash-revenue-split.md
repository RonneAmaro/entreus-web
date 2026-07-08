# Divisao de receita ItaCash 85/15

Pacote 40 implementa divisao automatica de receita nas monetizacoes internas com ItaCash.

ItaCash e credito interno do EntreUS. Nao e cripto, nao e pagamento externo e nao cria saque automatico.

## Regra

- O pagador perde o valor bruto integral.
- O criador recebe 85% liquido.
- A plataforma registra 15% como taxa no ato da transacao.
- A divisao acontece dentro das RPCs seguras, nunca apenas no frontend.
- ItaCash e inteiro. A taxa da plataforma e arredondada para baixo, e o criador recebe o restante.

Exemplos:

- 100 ItaCash: criador 85, plataforma 15.
- 50 ItaCash: criador 43, plataforma 7.
- 25 ItaCash: criador 22, plataforma 3.
- 10 ItaCash: criador 9, plataforma 1.
- 1 ItaCash: criador 1, plataforma 0.

## Banco de dados

A migration esta em:

`supabase/migrations/20260708_add_platform_revenue_split.sql`

Ela deve ser revisada e aplicada manualmente no Supabase. O Codex nao aplicou a migration automaticamente.

A migration cria `public.platform_revenue_ledger` com:

- origem (`source_type`, `source_id`);
- pagador e criador;
- valor bruto;
- valor liquido do criador;
- taxa da plataforma;
- basis points aplicados;
- metadata de auditoria.

RLS permite leitura apenas para admins via `public.is_admin()`. Usuarios comuns nao leem o ledger, e inserts diretos por client nao recebem grant. As insercoes acontecem pelas RPCs `send_itacash_tip` e `unlock_paid_post`.

## RPCs alteradas

- `public.send_itacash_tip(p_receiver_id uuid, p_amount integer, p_message text)`
- `public.unlock_paid_post(p_post_id uuid)`

As duas RPCs:

- usam `auth.uid()` como pagador/comprador;
- bloqueiam self-tip e compra do proprio post;
- validam saldo antes do debito;
- debitam o valor bruto;
- creditam apenas o liquido ao criador;
- registram a taxa no ledger da plataforma;
- gravam metadata `gross_amount`, `creator_amount`, `platform_fee_amount` e `platform_fee_bps`;
- retornam bruto/liquido/taxa para as APIs normalizarem a resposta.

## Posts pagos

`paid_post_unlocks.amount` continua sendo o valor bruto para compatibilidade. A migration adiciona:

- `creator_amount`;
- `platform_fee_amount`;
- `platform_fee_bps`.

Registros antigos sao preenchidos com `creator_amount = amount`, `platform_fee_amount = 0` e `platform_fee_bps = 0`, preservando o historico antes do pacote 40.

## Dashboard e wallet

O dashboard do criador mostra:

- receita liquida recebida;
- taxa da plataforma;
- valor bruto movimentado;
- gorjetas liquidas recebidas;
- posts pagos liquidos recebidos.

A wallet mostra o valor disponivel do criador apenas como liquido. Para recebimentos com metadata de split, o historico tambem mostra bruto e taxa da plataforma como detalhe de auditoria.

## Auditoria

Para auditar a receita da plataforma, um admin pode consultar `platform_revenue_ledger` por periodo, criador ou origem.

Exemplos:

```sql
select source_type, sum(gross_amount) as gross, sum(creator_amount) as creators, sum(platform_fee_amount) as platform
from public.platform_revenue_ledger
group by source_type;
```

```sql
select *
from public.platform_revenue_ledger
where creator_id = '<creator-id>'
order by created_at desc;
```

## Teste manual

1. Aplicar a migration manualmente no Supabase.
2. Garantir usuario A com saldo ItaCash e criador B com carteira.
3. Usuario A envia 100 ItaCash de gorjeta para criador B.
4. A carteira de A reduz 100.
5. A carteira de B aumenta 85.
6. `platform_revenue_ledger` registra 15.
7. Usuario A desbloqueia um post de 100 ItaCash do criador B.
8. A carteira de A reduz 100.
9. A carteira de B aumenta 85.
10. `platform_revenue_ledger` registra 15.
11. `/wallet` mostra `Gorjeta enviada`, `Gorjeta recebida liquida`, `Desbloqueio de post` e `Post pago recebido liquido`.
12. `/creator-dashboard` mostra receita liquida.

## Limitacoes atuais

- Nao ha saque automatico neste pacote.
- Nao ha pagamento externo neste pacote.
- A taxa e fixa em 15% no codigo/migration.
- Historico anterior ao pacote 40 permanece com taxa zero.
- O ledger e administrativo; usuario comum nao acessa a tabela.

## Proximos passos

- Solicitacao de saque manual.
- Minimo de 1000 ItaCash para saque.
- Painel financeiro admin.
- Relatorio de lucro/prejuizo.
- Registro de despesas operacionais.
- Registro de salario/desenvolvedor.
- Taxa configuravel pelo admin.
