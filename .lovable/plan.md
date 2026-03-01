

## Plano: Legendas para vídeos do YouTube

### Problema
As abas "Editar" e "Legendar" só aparecem quando o usuário faz upload de um arquivo (`hasVideo = !!uploadedFile`). Para vídeos do YouTube, essas abas ficam escondidas.

### Solução
Habilitar a aba "Legendar" também para vídeos do YouTube, com duas abordagens:

1. **Para YouTube**: Usar as legendas já extraídas pela edge function (transcrição) e convertê-las em segmentos SRT editáveis. Se a edge function já retornou a transcrição, parsear o texto em segmentos de legenda.

2. **Mostrar a aba "Legendar" sempre que houver resultados** (clips do YouTube ou vídeo local), não apenas quando há arquivo local.

### Mudanças

**`src/pages/AppPage.tsx`**:
- Alterar condição de visibilidade da aba "Legendar": mostrar quando `hasVideo` OU quando `phase === "results"` (YouTube com resultados)
- Para YouTube sem arquivo local: mostrar mensagem explicando que para gerar legendas automáticas com Whisper, é necessário fazer upload do vídeo
- Alternativa: se a edge function `analyze-video` já retorna a transcrição do YouTube, usar essa transcrição para gerar os segmentos de legenda automaticamente

**Verificação da edge function**:
- Checar se `analyze-video` retorna o texto da transcrição (além dos clips) para aproveitá-lo como legenda

### Resultado
- Vídeos do YouTube: aba "Legendar" visível, com legendas baseadas na transcrição da IA (se disponível) ou aviso para fazer upload
- Vídeos locais: funcionalidade Whisper como já está implementada

