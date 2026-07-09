# Post Composer UX

## Objetivo

O Pacote 43 simplifica a criacao de posts para usuarios comuns, novos criadores e influenciadores. O fluxo padrao mostra apenas o essencial e deixa configuracoes menos usadas dentro de "Opcoes avancadas".

## Modo Simples

O composer abre com:

- campo de texto com a pergunta "O que voce quer compartilhar hoje?";
- botao para adicionar foto ou video;
- botao "Publicar";
- indicacao compacta da comunidade escolhida, com Geral como padrao;
- resumo rapido antes de publicar.

O padrao continua sendo comunidade Geral, conteudo seguro e visibilidade publica.

## Opcoes Avancadas

A area "Opcoes avancadas" comeca fechada e pode ser aberta sem perder dados. Ela concentra:

- comunidade;
- categoria;
- visibilidade;
- classificacao do conteudo;
- post pago;
- preco em ItaCash;
- conteudo 18+;
- limite de video por nivel;
- assistencia de IA.

Quando algo avancado esta ativo, o composer mostra chips como "Post pago ativo", "Conteudo 18+" ou "Comunidade: Adulto 18+".

## Post Pago

O usuario pode transformar o post em pago dentro das opcoes avancadas. Quando ativado, o composer mostra:

- campo "Definir preco em ItaCash";
- texto curto explicando que o publico paga ItaCash para desbloquear o conteudo;
- aviso da divisao atual: o criador recebe 85% e a plataforma retem 15%.

Este pacote nao altera regra financeira, RPC, migration ou backend de posts pagos.

## Conteudo 18+

O controle 18+ fica dentro das opcoes avancadas. Usuarios elegiveis podem marcar o post como 18+. Usuarios sem verificacao aprovada veem a opcao bloqueada e um link para verificacao de idade.

Este pacote nao altera regra server-side, RLS, upload protegido ou politica 18+.

## Estados De Erro

O composer mostra mensagens curtas para:

- post vazio sem texto nem midia;
- imagem, GIF ou video acima do limite;
- video ainda em otimizacao;
- preco invalido em post pago;
- tentativa de usar 18+ sem permissao;
- falha de publicacao.

Mensagens de upload e salvamento continuam vindo do fluxo existente do feed quando aplicavel.

## Limitacoes

- Nao adiciona rascunho local.
- Nao adiciona agendamento.
- Nao altera backend, migrations, RLS, RPCs ou regras financeiras.
- Nao cria E2E com login real.

## Proximos Passos

- Rascunhos locais.
- Agendamento de post.
- Templates para criadores.
- Sugestao de hashtags e comunidades.
- IA auxiliar dentro do composer.
