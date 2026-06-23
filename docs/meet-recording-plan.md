# Plano para gravação real do EntreUS Meet

## Estado atual

O Pacote 49 adicionou a fundação de gravação com consentimento, APIs server-side, metadata privada e download temporário. O botão agora abre uma confirmação explícita e só chama o backend após a confirmação.

Neste ambiente, a gravação real continua **indisponível** enquanto não forem configurados explicitamente LiveKit Egress e um bucket R2 privado dedicado. Nessa condição a API responde com uma mensagem clara, não inicia Egress, não cria arquivo e não informa uma gravação que não aconteceu.

Gravação real não é apenas um botão: ela envolve consentimento, autorização, processamento do arquivo, retenção e acesso seguro. Não deve iniciar silenciosamente nem depender do retorno do navegador.

## Requisitos antes de ativar

- Avisar claramente todos os participantes antes do início e durante toda a gravação.
- Registrar consentimento e a identidade de quem iniciou a ação.
- Restringir início/parada ao host/admin da sala e exigir VIP ativo.
- Bloquear o início para contas de menores de idade e manter bloqueios de conteúdo sensível.
- Não tornar a mídia pública: downloads devem usar URLs assinadas, com autorização e expiração.

## Caminho técnico

A opção usada é **LiveKit Egress**, iniciado exclusivamente pelo backend após autorização. Ele grava a sala no servidor, evita depender do navegador do host e permite acompanhar estados confiáveis:

1. preparando;
2. gravando;
3. processando;
4. pronto para baixar;
5. falhou.

O resultado deve ficar no R2 privado, com metadata privada e URL assinada curta para download. O campo legado `is_recording_enabled` não ativa Egress por si só: a ativação depende da configuração server-side protegida e do fluxo de consentimento.

## Implementação do Pacote 49C

Além da fundação, o Pacote 49C define compactação obrigatória, teto de duração/tamanho e retenção de acesso. O perfil padrão é `economy`; gravações gratuitas continuam bloqueadas, VIP e testes administrativos respeitam o mesmo teto, e a gravação real segue indisponível até o opt-in seguro.

Veja [meet-recording-implementation.md](meet-recording-implementation.md) para a arquitetura, variáveis necessárias, migration manual e procedimentos de teste. Consulte a [política de armazenamento](meet-recording-storage-policy.md) para perfis, limites, retenção e checklist de ativação.
