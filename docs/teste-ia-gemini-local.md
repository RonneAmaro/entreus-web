# Teste local da IA Gemini - EntreUS

Este guia valida o fluxo local da IA de ponta a ponta sem alterar o fluxo de
producao e sem expor segredos.

Fluxo esperado:

1. O usuario entra na conta pelo Supabase.
2. O `PostComposer` obtem o `access_token` da sessao.
3. O navegador envia o texto para `POST /api/ai/assist` com Bearer token.
4. O backend valida o usuario.
5. O backend chama o Gemini com `GEMINI_API_KEY` somente no servidor.
6. O texto melhorado volta para o composer.
7. O composer substitui apenas o texto.
8. O post continua aguardando o clique do usuario em publicar.

A rota aceita os modos `improve_post` e `suggest_caption`. Ambos usam a mesma
autenticacao, validacao de texto e protecao de rate limit.

## 1. Configurar a chave local

Use somente o arquivo local:

```text
C:\Porjetos\EntreUS\entreus-web\.env.local
```

Adicione as variaveis abaixo usando a sua chave real apenas nesse arquivo:

```dotenv
GEMINI_API_KEY=SUA_CHAVE_GEMINI_AQUI
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_MODEL` e opcional. Quando ele nao e informado, o backend ja usa
`gemini-2.5-flash` como padrao.

Regras de seguranca:

- Nunca commite `.env.local`.
- Nunca coloque a chave em documentacao, issue, chat, print ou log.
- Nunca crie `NEXT_PUBLIC_GEMINI_API_KEY`.
- Variaveis com prefixo `NEXT_PUBLIC_` podem ser enviadas ao navegador.
- `GEMINI_API_KEY` deve existir apenas no backend.
- Reinicie o servidor local sempre que alterar `.env.local`.
- Antes de qualquer commit, execute `git status --short` e confirme que
  `.env.local` nao aparece.

O repositorio ja ignora arquivos `.env*`, mas a conferencia manual continua
obrigatoria.

## 2. Iniciar o ambiente local

No PowerShell:

```powershell
cd C:\Porjetos\EntreUS\entreus-web
npm.cmd run dev -- -p 3001
```

Depois, abra:

```text
http://127.0.0.1:3001/login
```

Use `Ctrl+C` para encerrar o servidor. Se `.env.local` for alterado, encerre e
inicie o servidor novamente.

## 3. Teste completo pelo navegador

1. Abra `http://127.0.0.1:3001/login`.
2. Entre com um usuario de teste valido.
3. Abra `http://127.0.0.1:3001/feed`.
4. Abra o composer de publicacao.
5. Escreva: `hoje foi muito bom gostei desse video`.
6. Clique em **Melhorar com IA**.
7. Aguarde o estado **Melhorando...**.
8. Confirme que o texto foi substituido por uma versao melhorada.
9. Confirme a mensagem `Texto melhorado. Revise antes de publicar.`.
10. Revise se o sentido original foi preservado.
11. Confirme que nenhum post foi publicado automaticamente.
12. Se houver midia anexada, confirme que ela continua anexada.

### Testar sugestao de legenda

1. Escreva: `foto do meu treino de hoje`.
2. Clique em **Sugerir legenda**.
3. Aguarde o estado **Gerando legenda...**.
4. Confirme que a ideia foi substituida por uma legenda natural.
5. Confirme a mensagem `Legenda sugerida. Revise antes de publicar.`.
6. Confirme que o post nao foi publicado automaticamente.
7. Se houver midia anexada, confirme que ela continua anexada.
8. Teste **Melhorar com IA** novamente para garantir que o primeiro modo
   continua funcionando.

Para conferir a chamada, abra as ferramentas do navegador, acesse a aba
**Network** e procure por `assist`. O resultado esperado e:

- Metodo: `POST`.
- URL: `/api/ai/assist`.
- Status: `200`.
- Corpo da resposta: `{ "ok": true, "result": "..." }`.
- O texto muda no composer, mas a publicacao nao e disparada.

Nao copie nem compartilhe o valor do cabecalho `Authorization`.

## 4. Testes de erro

### Texto curto

1. Digite menos de 3 caracteres, por exemplo `oi`.
2. Confirme que os dois botoes de IA ficam desabilitados.
3. Passe o cursor sobre os botoes e confira a orientacao para escrever pelo
   menos 3 caracteres.
4. Confirme que nenhuma chamada para `/api/ai/assist` foi feita.

### Texto acima de 1200 caracteres

1. Cole um texto com 1201 caracteres ou mais.
2. Clique em **Melhorar com IA**.
3. Confirme a mensagem informando que o texto esta muito grande.
4. Confirme que o post nao foi publicado e que a midia nao foi alterada.

O frontend bloqueia essa chamada. Se o limite for testado diretamente na API,
o status esperado e `413`.

### Sem login

1. Saia da conta.
2. Tente usar a IA novamente, caso o composer esteja disponivel.
3. Confirme a mensagem `Faca login para usar a IA da EntreUS.`.

Se o feed redirecionar antes de exibir o composer, teste a API sem o cabecalho
`Authorization`. O status esperado e `401`, sem chamada ao Gemini.

### Sem `GEMINI_API_KEY`

1. Encerre o servidor local.
2. Remova temporariamente ou comente `GEMINI_API_KEY` apenas no seu
   `.env.local`.
3. Inicie o servidor novamente.
4. Entre na conta e tente melhorar um texto valido.
5. Confirme que a interface mostra um erro generico e nao revela detalhes da
   configuracao.

A API deve responder com status `503` e mensagem publica segura. Restaure a
variavel local e reinicie o servidor depois do teste.

### Limite temporario e status 429

O limite local atual e de 10 chamadas validas por usuario em uma janela de 10
minutos. A chamada seguinte deve retornar `429`.

Para evitar consumir requisicoes Gemini durante esse teste:

1. Execute o cenario sem `GEMINI_API_KEY` descrito acima.
2. Com um usuario autenticado, envie 11 chamadas com texto valido.
3. As 10 primeiras devem falhar com `503`, mas contam no limitador.
4. A 11a chamada deve retornar `429`.
5. Restaure a chave e reinicie o servidor.

O limitador e temporario e fica em memoria. Reiniciar o servidor limpa o estado
local; em ambientes com varias instancias, o comportamento pode variar.

## 5. Teste manual da API com PowerShell

Use apenas um access token temporario da sua propria sessao local. Para obter o
token, faca uma tentativa pelo composer, abra **Network**, selecione a chamada
`/api/ai/assist` e consulte o Bearer token enviado no cabecalho da requisicao.
Nao compartilhe esse valor e nao o salve em arquivo.

Exemplo com `curl.exe` e placeholder, sem token ou chave reais:

```powershell
$token = 'TOKEN_AQUI'

curl.exe -i --request POST "http://127.0.0.1:3001/api/ai/assist" `
  --header "Authorization: Bearer $token" `
  --header "Content-Type: application/json" `
  --data-raw '{"mode":"improve_post","text":"hoje foi muito bom gostei desse video"}'

Remove-Variable token
```

Resposta esperada com configuracao e token validos:

```json
{
  "ok": true,
  "result": "Texto melhorado retornado pelo Gemini."
}
```

Exemplo para o modo `suggest_caption`:

```powershell
$token = 'TOKEN_AQUI'

curl.exe -i --request POST "http://127.0.0.1:3001/api/ai/assist" `
  --header "Authorization: Bearer $token" `
  --header "Content-Type: application/json" `
  --data-raw '{"mode":"suggest_caption","text":"foto do meu treino de hoje"}'

Remove-Variable token
```

A resposta esperada usa o mesmo contrato `{ "ok": true, "result": "..." }`
e retorna somente a legenda final.

Teste sem login, sem incluir o cabecalho `Authorization`:

```powershell
curl.exe -i --request POST "http://127.0.0.1:3001/api/ai/assist" `
  --header "Content-Type: application/json" `
  --data-raw '{"mode":"improve_post","text":"texto valido para testar"}'
```

O status esperado e `401`.

Para repetir o teste de rate limit, mantenha a chave desativada e execute:

```powershell
$token = 'TOKEN_AQUI'

1..11 | ForEach-Object {
  Write-Host "Chamada $_"
  curl.exe --silent --show-error --output NUL --write-out "HTTP %{http_code}`n" `
    --request POST "http://127.0.0.1:3001/api/ai/assist" `
    --header "Authorization: Bearer $token" `
    --header "Content-Type: application/json" `
    --data-raw '{"mode":"improve_post","text":"teste local do limite da IA"}'
}

Remove-Variable token
```

Resultado esperado: dez respostas `503` e a ultima resposta `429`. Reinicie o
servidor depois para limpar o limitador local.

## 6. Checklist final

- [ ] `GEMINI_API_KEY` existe somente em `.env.local` ou no ambiente seguro.
- [ ] Nao existe variavel `NEXT_PUBLIC_GEMINI_API_KEY`.
- [ ] O servidor foi reiniciado depois da configuracao.
- [ ] Login local funciona.
- [ ] O `PostComposer` envia o Bearer token para `/api/ai/assist`.
- [ ] A API valida o usuario antes de chamar o Gemini.
- [ ] Um texto valido retorna melhorado.
- [ ] Uma ideia valida retorna uma legenda pelo modo `suggest_caption`.
- [ ] Os botoes **Melhorar com IA** e **Sugerir legenda** funcionam separadamente.
- [ ] A mensagem pede revisao antes da publicacao.
- [ ] O post nao e publicado automaticamente.
- [ ] Midias anexadas permanecem no composer.
- [ ] Erros de login, tamanho, configuracao e limite sao seguros.
- [ ] `npm.cmd run build` passa.
- [ ] `git status --short` nao mostra `.env.local`.
- [ ] Nenhuma chave ou access token aparece no diff do Git.
