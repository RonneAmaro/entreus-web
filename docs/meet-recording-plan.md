# Plano para gravação real do EntreUS Meet

## Estado atual

O Meet exibe **Gravar reunião** como “Em preparação”. A ação não inicia gravação, não cria arquivo, não chama `MediaRecorder` e não chama LiveKit Egress. O campo existente `is_recording_enabled` descreve capacidade futura da sala, mas não há infraestrutura de gravação ativa neste pacote.

Gravação real não é apenas um botão: ela envolve consentimento, autorização, processamento do arquivo, retenção e acesso seguro. Não deve iniciar silenciosamente nem depender do retorno do navegador.

## Requisitos antes de ativar

- Avisar claramente todos os participantes antes do início e durante toda a gravação.
- Registrar consentimento e a identidade de quem iniciou a ação.
- Restringir início/parada ao host/admin da sala; uma regra futura pode limitar o recurso a VIP.
- Definir regras especiais ou bloqueio para menores e conteúdo sensível.
- Não tornar a mídia pública: downloads devem usar URLs assinadas, com autorização e expiração.

## Caminho técnico recomendado

A opção recomendada para salas LiveKit é **LiveKit Egress**, iniciado pelo backend após autorização. Ele grava a sala no servidor, evita depender do navegador do host e permite acompanhar estados confiáveis:

1. preparando;
2. gravando;
3. processando;
4. pronto para baixar;
5. falhou.

O resultado deve ser armazenado em R2, com metadados privados, prazo de retenção e URL assinada para download. Limites de duração, quantidade e retenção devem respeitar plano/VIP e ser validados no servidor.

`MediaRecorder` é apenas uma alternativa limitada: depende de o navegador permanecer aberto, costuma capturar apenas fontes locais e não atende bem a uma gravação completa e auditável da sala.

## Próximo pacote

**Pacote 49 — Gravação real do Meet com consentimento e storage seguro.**

Esse pacote deverá incluir a autorização do host, aviso aos participantes, modelo de estados, integração server-side com Egress, armazenamento privado em R2, retenção, auditoria e downloads por URL assinada.
