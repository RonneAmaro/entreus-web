# Bot WhatsApp do EntreUS Lab — Pacote 1

Arquivos:

- `app/api/whatsapp/webhook/route.ts`
- `lib/whatsapp.ts`

## Variáveis no `.env.local`

```env
WHATSAPP_VERIFY_TOKEN=entreus_lab_verificacao
WHATSAPP_ACCESS_TOKEN=COLE_AQUI_O_TOKEN_DA_META
WHATSAPP_PHONE_NUMBER_ID=COLE_AQUI_O_PHONE_NUMBER_ID
WHATSAPP_APP_SECRET=COLE_AQUI_O_APP_SECRET
WHATSAPP_API_VERSION=v20.0
```

## URL do webhook

Depois de subir para a Vercel:

```txt
https://SEU-DOMINIO/api/whatsapp/webhook
```

Exemplo:

```txt
https://entreus.vercel.app/api/whatsapp/webhook
```

## O que este pacote faz

- Verifica o webhook com `hub.challenge`.
- Recebe mensagens via POST.
- Identifica texto, imagem, documento/PDF, vídeo e áudio.
- Responde com mensagens de teste.
- Já deixa preparado para o próximo pacote: baixar mídia e gerar PDF.

## Próximo pacote

- Baixar arquivo recebido pelo WhatsApp usando o `media_id`.
- Validar JPG, PNG, WEBP e PDF.
- Gerar o pôster em PDF no servidor.
- Enviar o PDF pronto de volta pelo WhatsApp.
