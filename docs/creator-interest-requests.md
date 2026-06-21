# Solicitações de Criadores Fundadores

O formulário público `/creators/apply` envia para `POST /api/creator-interest` apenas nome, e-mail, categoria, mensagem e campos opcionais de perfil/canal. Não coleta CPF, RG, documento, endereço, senha ou dados bancários. Não promete aprovação, renda ou pagamento.

A tabela `creator_interest_requests` depende da migration manual `20260621_create_creator_interest_requests.sql`, que não foi aplicada. Após aprovação, aplicar no SQL Editor, rodar `verify-creator-interest-requests.sql` somente para leitura e usar o rollback apenas se necessário. O próximo pacote sugerido é o admin de triagem.
