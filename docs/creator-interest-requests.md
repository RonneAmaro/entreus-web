# Solicitacoes de Criadores Fundadores

O formulario publico `/creators/apply` envia para `POST /api/creator-interest` nome, e-mail, nicho principal, mensagem e campos opcionais de perfil/canal, link principal, tamanho aproximado de audiencia e interesse em conteudo adulto.

Contato/WhatsApp e interesses adicionais sao incorporados na mensagem para reaproveitar o schema existente. O formulario nao coleta CPF, RG, documento, endereco, senha, dados bancarios ou comprovantes. Tambem nao promete aprovacao, renda, pagamento ou monetizacao imediata.

A tabela `creator_interest_requests` depende da migration manual `20260621_create_creator_interest_requests.sql`. Este pacote nao cria migration nova e nao altera banco. Apos aprovacao operacional, aplicar migrations somente pelo fluxo manual definido para Supabase.
