

## Problema

O `MediaRecorder` no navegador **não suporta MP4 na maioria dos browsers** (Firefox, Safari, e mesmo alguns Chrome). A função `pickMimeType()` tenta MP4 primeiro, mas quando `isTypeSupported` retorna `false`, cai para WebM. O blob final fica com tipo `video/webm` e o `downloadBlob` corretamente salva como `.webm`.

A tentativa anterior de usar FFmpeg WASM para converter WebM→MP4 travava em 8% por problemas de carregamento do WASM.

## Solução

Usar uma **edge function no backend** para converter WebM→MP4 via FFmpeg server-side, onde não há limitações de WASM/browser. O fluxo será:

1. **Gravar normalmente** com MediaRecorder (WebM no browser)
2. **Upload do WebM** para a edge function
3. **Conversão server-side** WebM→MP4 usando FFmpeg
4. **Retornar o MP4** como blob para download

### Detalhes técnicos

1. **Criar edge function `convert-to-mp4`**
   - Recebe o arquivo WebM via POST (multipart ou base64)
   - Usa FFmpeg no Deno runtime para remuxar/transcodificar para MP4
   - Retorna o arquivo MP4

2. **Atualizar `src/lib/videoCutter.ts`**
   - Após `recorder.onstop`, verificar se o blob é WebM
   - Se for WebM, chamar a edge function para converter
   - Se a conversão falhar, fazer fallback salvando como `.webm` com aviso ao usuário

3. **Atualizar `src/lib/exportModule.ts`** e **`src/lib/videoEditor.ts`**
   - Mesma lógica de conversão pós-gravação

4. **`downloadBlob`** continua determinando extensão pelo tipo do blob

### Alternativa mais simples (sem backend)

Se preferir evitar upload/download de vídeos grandes pelo servidor, a alternativa é:
- **Forçar `.mp4` como extensão** independente do tipo real do blob
- A maioria dos players mobile (TikTok upload, WhatsApp) aceita WebM mesmo com extensão .mp4
- Mas isso não é um MP4 real

### Recomendação

A abordagem mais confiável e rápida é a **alternativa simples**: sempre salvar como `.mp4` independente do container real. Para uploads em redes sociais, o arquivo será re-encodado de qualquer forma. Se o usuário precisar de MP4 real, aí sim usamos a edge function.

