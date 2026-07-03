# Admin Financeiro da Plataforma

O painel financeiro administrativo fica em `/admin/finance` e serve como controle gerencial interno para entradas, saidas, custos e lucro da plataforma.

Ele nao executa pagamentos, nao altera saldo ItaCash, nao cria saque automatico e nao substitui contabilidade. Repasses a criadores continuam manuais nesta fase.

## Receitas e Despesas

Receitas sao entradas de dinheiro da operacao, como venda de ItaCash, venda VIP ou uma receita manual registrada pelo administrador.

Despesas sao saidas de dinheiro da operacao, como servidor, dominio, ferramentas, marketing, impostos, salario/desenvolvimento e repasses manuais para criadores.

O lucro liquido exibido e:

`receitas - despesas`

Todos os valores sao armazenados em centavos de BRL.

## Categorias

Receitas:

- `itacash_sale`: venda de ItaCash;
- `vip_sale`: venda VIP;
- `manual_income`: receita manual;
- `other_income`: outra receita.

Despesas:

- `creator_payout`: repasse manual para criador;
- `server`: servidor;
- `domain`: dominio;
- `tool`: ferramenta;
- `marketing`: marketing;
- `tax`: imposto;
- `developer_salary`: salario ou desenvolvimento;
- `manual_expense`: despesa manual;
- `other_expense`: outra despesa.

## Como Registrar

Venda manual:

1. tipo: entrada;
2. categoria: `manual_income`;
3. descricao: origem da venda;
4. valor em reais;
5. data e forma de pagamento.

Venda ItaCash externa/manual:

1. tipo: entrada;
2. categoria: `itacash_sale`;
3. descricao: compra ou conciliacao manual;
4. informe o valor recebido em reais;
5. use observacoes para detalhes como comprovante ou referencia externa.

Custo de servidor:

1. tipo: saida;
2. categoria: `server`;
3. descricao: provedor/mes;
4. valor pago.

Dominio:

1. tipo: saida;
2. categoria: `domain`;
3. descricao: dominio e periodo;
4. valor pago.

Ferramenta:

1. tipo: saida;
2. categoria: `tool`;
3. descricao: nome da ferramenta;
4. valor e forma de pagamento.

Marketing:

1. tipo: saida;
2. categoria: `marketing`;
3. descricao: campanha, criativo ou canal;
4. valor investido.

Imposto:

1. tipo: saida;
2. categoria: `tax`;
3. descricao: imposto/taxa/periodo;
4. valor pago.

Repasse manual para criador:

1. tipo: saida;
2. categoria: `creator_payout`;
3. descricao: nome do criador ou identificador interno;
4. valor pago manualmente fora da plataforma;
5. observacoes: chave Pix, pedido de saque ou comprovante interno.

Salario/desenvolvimento:

1. tipo: saida;
2. categoria: `developer_salary`;
3. descricao: periodo ou atividade;
4. valor.

## Relacao com Saques de Criadores

Este pacote nao cria fluxo novo de saque. Quando Ronne pagar manualmente um criador, pode registrar uma despesa com categoria `creator_payout` para refletir a saida financeira no painel.

O painel de saques em `/admin/creator-withdrawals` continua sendo o local para revisar pedidos de saque. O financeiro e apenas o controle gerencial da saida em reais.

## Migration

A migration preparada e:

`supabase/migrations/20260703_create_admin_financial_records.sql`

Ela cria a tabela `public.admin_financial_records` com RLS habilitado e politicas restritas a administradores via `public.is_admin()`.

Essa migration deve ser aplicada manualmente por Ronne no Supabase. O painel e as APIs retornam aviso claro se a tabela ainda nao existir.

## Proximos Passos

- conciliacao automatica com Mercado Pago;
- importacao de compras ItaCash aprovadas;
- relatorios mensais;
- exportacao CSV;
- DRE simples;
- anexos/comprovantes no R2;
- integracao com `creator_withdrawal_requests`.
