

## Plano: Editor de Vídeo + Legenda Automática (100% Client-Side)

### Visão geral

Transformar a aplicação atual em um editor de vídeo completo que roda inteiramente no navegador. Nenhum vídeo ou áudio é enviado para servidor. Usa FFmpeg.wasm (já instalado) para edição e `@huggingface/transformers` (Whisper ONNX) para transcrição automática.

### Arquitetura modular

```text
src/lib/
  ├── videoCutter.ts      ← já existe (FFmpeg.wasm)
  ├── videoAnalyzer.ts     ← já existe (análise de cena/áudio)
  ├── videoEditor.ts       ← NOVO: trim, split, remove trechos
  ├── whisperWorker.ts     ← NOVO: Web Worker para Whisper
  ├── subtitleUtils.ts     ← NOVO: gerar/parsear SRT, edição
  └── exportModule.ts      ← NOVO: exportar com legenda burn-in

src/pages/
  └── AppPage.tsx           ← refatorar com abas: Analisar | Editar | Legendar

src/components/
  ├── VideoTimeline.tsx     ← NOVO: timeline visual com handles de trim
  ├── SubtitleEditor.tsx    ← NOVO: lista editável de legendas
  └── ExportDialog.tsx      ← NOVO: opções de exportação
```

### Etapas de implementação

**1. Instalar `@huggingface/transformers`**
- Pacote npm que roda Whisper via ONNX Runtime Web (WASM/WebGPU)
- Modelo `Xenova/whisper-tiny` (~75MB) ou `whisper-base` (~142MB)
- Modelo baixado uma vez e cacheado automaticamente pelo browser

**2. Criar `whisperWorker.ts` (Web Worker)**
- Roda transcrição em Web Worker para não travar a UI
- Usa `pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny')`
- Recebe áudio WAV extraído pelo FFmpeg.wasm
- Retorna array de segmentos `{start, end, text}`
- Reporta progresso via `postMessage`

**3. Criar `subtitleUtils.ts`**
- `generateSRT(segments)` → string .srt
- `parseSRT(text)` → array de segmentos
- `downloadSRT(content, filename)` → download do arquivo
- Formatação de timestamps SRT (`00:01:23,456`)

**4. Criar `videoEditor.ts`**
- `trimVideo(file, start, end)` → Blob MP4 (usa FFmpeg.wasm, já funciona via videoCutter)
- `splitVideo(file, splitPoints[])` → Blob[] (múltiplos cortes)
- `removeSegments(file, segments[])` → Blob (remove trechos e concatena)
- Todas usando `-c copy` para velocidade (sem re-encode)

**5. Criar `exportModule.ts`**
- `exportWithBurnedSubtitles(file, srtContent)` → Blob MP4
  - Usa FFmpeg.wasm com filtro `subtitles` ou `drawtext` para embutir legenda
  - Re-encode necessário para burn-in (mais lento, avisar usuário)
- `exportSeparate(file, start, end)` → Blob MP4 (corte simples)

**6. Criar componente `VideoTimeline.tsx`**
- Barra visual representando a duração do vídeo
- Handles arrastáveis para definir ponto inicial e final (trim)
- Marcadores visuais dos trechos detectados pela análise
- Sincronizado com o `<video>` player

**7. Criar componente `SubtitleEditor.tsx`**
- Lista de segmentos de legenda com timestamp + texto editável
- Campos para ajustar tempo de início/fim de cada linha
- Preview ao vivo: ao clicar numa legenda, o vídeo pula para aquele ponto
- Botão para download do .srt

**8. Criar componente `ExportDialog.tsx`**
- Dialog com opções:
  - Exportar vídeo cortado (sem legenda)
  - Exportar legenda separada (.srt)
  - Exportar vídeo com legenda embutida (burn-in)
- Barra de progresso do FFmpeg durante exportação

**9. Refatorar `AppPage.tsx`**
- 3 abas principais: **Analisar** | **Editar** | **Legendar**
- Aba Analisar: funcionalidade atual (YouTube + Upload)
- Aba Editar: timeline, trim, split, remover trechos, preview
- Aba Legendar: transcrição automática, editor de SRT, exportação
- O vídeo carregado persiste entre abas

### Fluxo do usuário

```text
1. Upload do vídeo (ou análise de YouTube)
2. Aba "Editar": trim, split, remover trechos
3. Aba "Legendar":
   a. Clica "Gerar legendas" → FFmpeg extrai áudio WAV
   b. Whisper transcreve no Web Worker (progresso visível)
   c. Legendas aparecem para edição
   d. Download .srt OU burn-in no vídeo
4. Exportar resultado final
```

### Limitações e avisos ao usuário

- **Modelo Whisper tiny**: ~75MB de download na primeira vez, depois fica em cache
- **Tempo de transcrição**: ~2-5x tempo real para o modelo tiny (vídeo de 5min leva ~2-10min)
- **Burn-in de legendas**: requer re-encode completo, significativamente mais lento que corte simples
- **Memória**: vídeos muito longos (>30min) podem consumir muita RAM
- **Compatibilidade**: Chrome/Edge recomendados (WASM SIMD necessário)

### Detalhes técnicos

- FFmpeg.wasm já está instalado e funcionando (`videoCutter.ts`)
- `@huggingface/transformers` usa ONNX Runtime Web internamente
- Web Worker isola processamento pesado da thread principal
- `URL.createObjectURL` para preview sem upload
- Tudo funciona offline após carregar modelo Whisper

