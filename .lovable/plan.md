

# Simplificar YouTube: Sempre Baixar e Analisar Localmente

## Problema
Quando você cola um link do YouTube, o sistema tenta primeiro extrair legendas via Edge Function (`analyze-video`). Isso falha na maioria dos vídeos (sem legenda, cipher, 401, etc.). O fallback local só ativa em casos específicos de erro 422.

## Solução
Eliminar a dependência da Edge Function `analyze-video` para YouTube. O fluxo será:

1. Usuário cola link do YouTube
2. Sistema extrai o ID do vídeo
3. Chama `download-youtube` para obter a URL do stream
4. Baixa o vídeo como arquivo local
5. Roda `analyzeVideoLocally()` (detecção de ganchos + cenas de ação via Canvas/Audio)
6. Mostra os clips

## Mudanças

### `src/pages/AppPage.tsx`
- **Reescrever `handleGenerateYoutube`**: Remover toda a lógica que chama `analyze-video`. Em vez disso, chamar diretamente `downloadYoutubeAsFile` → `analyzeVideoLocally`.
- Remover o `fallbackToLocalYoutubeAnalysis` (não será mais necessário como fallback, vira o fluxo principal).
- Manter mensagens de progresso claras: "Baixando vídeo..." → "Analisando cenas..." → "Pronto!"

### Nenhuma mudança nas Edge Functions
- `download-youtube` continua igual (já funciona para extrair URLs de stream).
- `analyze-video` fica disponível mas não será chamada para YouTube.

## Resultado
- YouTube **sempre** funciona, independente de legendas
- Análise local detecta ganchos e cenas de ação (já implementado em `videoAnalyzer.ts`)
- Sem dependência de transcrição

