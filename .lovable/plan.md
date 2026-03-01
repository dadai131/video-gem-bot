

## Plano: Análise de Vídeo 100% no Navegador (Sem IA, Sem Custo)

### Abordagem
Tudo roda no PC do usuário usando APIs nativas do navegador. Zero chamadas a servidor, zero custo.

### Como funciona a análise local

**1. Detecção de mudança de cena (Canvas API)**
- Carrega o vídeo num `<video>` escondido
- Extrai frames a cada ~1 segundo usando `canvas.drawImage()`
- Compara pixels entre frames consecutivos (diferença média de cor RGB)
- Picos de diferença = mudança de cena = momento potencialmente interessante

**2. Detecção de picos de áudio (Web Audio API)**
- Decodifica o áudio do vídeo com `AudioContext.decodeAudioData()`
- Calcula a energia (RMS) em janelas de ~1 segundo
- Momentos de alta energia = partes mais intensas/interessantes

**3. Combinação dos sinais**
- Score = peso da mudança visual + peso do pico de áudio
- Agrupa momentos próximos em trechos de 15-60 segundos
- Ordena por score e retorna os top 4-6 trechos

### Etapas de implementação

1. **Atualizar `AppPage.tsx`**
   - Adicionar tabs "YouTube" / "Upload de Arquivo"
   - Na tab Upload: área de drag-and-drop (aceita mp4, webm, mov)
   - Manter funcionalidade YouTube existente intacta

2. **Criar módulo `src/lib/videoAnalyzer.ts`**
   - Função que recebe um `File`, cria `<video>` + `<canvas>` offscreen
   - Loop de seek frame-a-frame comparando pixels (scene detection)
   - Web Audio API para análise de energia do áudio
   - Combina scores, agrupa em trechos, retorna array de clips no mesmo formato `Clip[]`
   - Reporta progresso via callback

3. **Player nativo para uploads**
   - Usar `<video>` HTML nativo com `URL.createObjectURL(file)` 
   - Controle de `currentTime` para navegar entre trechos identificados
   - Mesma UI de lista de clips que já existe

### Detalhes técnicos
- Para vídeo de 10min: ~600 comparações de frame, leva ~30-60 segundos
- Sem limite de tamanho de arquivo (roda local)
- Funciona offline após carregar a página
- O YouTube continua usando a edge function existente com IA (já implementada)

