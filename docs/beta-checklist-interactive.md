# Checklist interativo do beta fechado

## Objetivo

O checklist interativo em `/admin/beta-checklist` ajuda a validar manualmente o EntreUS antes de liberar usuarios beta. Ele transforma o roteiro do beta fechado em uma ferramenta pratica para marcar status, registrar observacoes curtas, filtrar itens e copiar um relatorio final.

## Como funciona

- Cada item pode ficar como `Pendente`, `Passou`, `Bug` ou `Revisar`.
- Cada item aceita uma observacao curta.
- A pagina mostra contadores de total, passou, bug, revisar, pendente e percentual concluido.
- Os filtros permitem ver `Todos`, `Pendentes`, `Passou`, `Bug` ou `Revisar`.
- A busca encontra texto no titulo, descricao, categoria e rota relacionada.

## Persistencia local

O progresso usa apenas `localStorage`, na chave:

```text
entreus:beta-checklist:v1
```

Isso significa que:

- o progresso fica salvo apenas neste navegador;
- nao ha banco, API, migration ou Supabase para gravar resultados;
- outro navegador, outro dispositivo ou limpeza de dados locais nao tera o mesmo progresso.

## Como testar

1. Acesse `/admin/beta-checklist` com uma conta admin.
2. Marque alguns itens como `Passou`, `Bug` e `Revisar`.
3. Preencha observacoes curtas em alguns itens.
4. Recarregue a pagina e confirme que o progresso continua salvo.
5. Use a busca por termos como `mobile`, `upload`, `admin`, `18+`, `moderacao`, `itacash` ou `politicas`.
6. Use os filtros de status.
7. Clique em `Limpar progresso` e confirme que os dados locais foram apagados.

## Copiar relatorio

O botao `Copiar relatorio` gera texto simples em portugues com:

- data e hora local;
- resumo de status;
- lista de bugs;
- lista de itens para revisar;
- observacoes preenchidas.

O texto copiado pode ser colado em issue, documento interno, planilha ou chat da rodada de beta.

## Limitacoes

- Nao existe historico por rodada.
- Nao existe sincronizacao entre navegadores.
- Nao existe painel real de bugs.
- O relatorio depende do estado local atual do navegador.

## Proximos passos futuros

- Salvar resultado no banco.
- Gerar historico por rodada de teste.
- Criar painel de bugs real.
- Exportar CSV/PDF.
