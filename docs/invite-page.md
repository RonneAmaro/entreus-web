# Página de convite

## Objetivo

A página pública de convite apresenta a EntreUS para novos usuários em um formato bonito, direto e compartilhável por WhatsApp, Instagram, grupos, QR Codes e campanhas.

## Rota

`/convite`

A rota é pública e não exige login.

## Seções

- Hero com marca EntreUS, resumo da plataforma e botões de cadastro/login.
- Menu visual com atalhos para Comunidades, ItaCash, Selos e Meet.
- "O que você encontra na EntreUS" com feed, comunidades, ItaCash, selos, presentes digitais, Meet e monetização para criadores.
- ItaCash explicando a moeda interna sem alterar regras financeiras, preços ou conversão.
- Selos apresentando Ancião, VIP Premium e Comunidade.
- EntreUS Meet para chamadas, chat, participantes e gravação quando disponível.
- Vídeos com assets reais onde já existem e placeholders para demonstrações futuras.
- Chamada final: "Entre para a EntreUS hoje".

## Vídeos principais

Os blocos de vídeo ficam em `app/convite/page.tsx`, no array `videoBlocks`.

Assets reais atuais:

- `/intro.mp4` para "Conheça a EntreUS".
- `/selos-entreus.mp4` para "Selos e comunidades".

Placeholders atuais:

- "Como funciona o ItaCash".
- "EntreUS Meet".

Para trocar um placeholder por vídeo real, adicione `src` e `poster` opcional ao item correspondente em `videoBlocks`.

## Vídeo 16:9 dos três selos

A seção de Selos já tem uma área premium preparada para um futuro loop 16:9 com os três selos oficiais.

Caminho esperado:

`public/videos/selos-entreus-loop.mp4`

O diretório `public/videos/` ainda não existe neste pacote. Enquanto o vídeo não estiver configurado na página, a área usa fallback visual com os três selos estáticos.

Quando o vídeo real for adicionado, configure `badgesLoopVideoSrc` em `app/convite/page.tsx` para:

`/videos/selos-entreus-loop.mp4`

## Mídia dos selos

O componente visual usado na página é `app/components/BadgeVisual.tsx`.

Assets atuais em `public/badges/`:

- Ancião: `/badges/anciao.mp4` com fallback `/badges/anciao.png`.
- VIP Premium: `/badges/vip-premium.mp4` com fallback `/badges/vip-premium.png`.
- Comunidade: `/badges/comunidade.mp4` com fallback `/badges/comunidade.png`.

Nenhum arquivo `.webm` de selo foi encontrado neste pacote. Se vídeos `.webm` forem adicionados no futuro, atualize o mapa de assets em `BadgeVisual.tsx`.

## Performance

- Vídeos de selo devem aparecer apenas em áreas grandes e visuais, como a seção pública `/convite`.
- Badges pequenos de feed, perfil, posts e superfícies sociais devem continuar usando PNG estático para manter rolagem leve e previsível.
- Todo vídeo decorativo deve usar `autoPlay`, `muted`, `loop`, `playsInline` e `preload="metadata"`.

## Link público

A landing atual em `/` inclui um link discreto para `/convite`.

## Próximos passos

- Adicionar QR Code apontando para `/convite`.
- Preparar texto de campanha para WhatsApp.
- Gravar vídeos reais de ItaCash e EntreUS Meet.
- Gerar e adicionar o vídeo 16:9 dos três selos.
- Adicionar rastreamento de referral ou código de convite em pacote futuro.
