

## Plano: Corrigir FFmpeg travando em 8%

### Diagnóstico
O WASM baixa com sucesso, mas `ffmpeg.load()` trava na linha que mostra 8% ("Inicializando motor de vídeo..."). Isso acontece porque a versão ESM do `@ffmpeg/core@0.12.6` usa **SharedArrayBuffer**, que requer headers de Cross-Origin Isolation (`Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy`). O ambiente de preview não fornece esses headers, então `ffmpeg.load()` fica pendurado para sempre.

### Solução
Trocar para a versão **single-threaded (umd)** do ffmpeg-core, que **não precisa de SharedArrayBuffer**.

### Mudança

**`src/lib/ffmpegSingleton.ts`**:
- Alterar `BASE_URL` de:
  `https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm`
  para:
  `https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd`
- Isso usa a build single-threaded que funciona em qualquer ambiente sem headers especiais

Uma única linha muda. Nenhum outro arquivo precisa ser alterado.

