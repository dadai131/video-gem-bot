

## Plano: Download de vídeos do YouTube via edge function

### Problema
`yt-dlp` é uma ferramenta CLI/Python — não roda no navegador nem em edge functions (Deno). Precisamos de uma alternativa compatível com a arquitetura atual.

### Abordagem viável

Criar uma edge function `download-youtube` que extrai a URL de stream direto do YouTube (sem dependências externas como yt-dlp), permitindo ao usuário baixar o vídeo para editar localmente no navegador.

**Como funciona:** O YouTube expõe URLs de streaming na página do player (dentro do JSON `ytInitialPlayerResponse`). A edge function faz scraping dessa informação e retorna a URL direta do vídeo.

### Mudanças

**1. Nova edge function `supabase/functions/download-youtube/index.ts`**
- Recebe `videoId` 
- Faz fetch da página do YouTube, extrai `streamingData.formats` e `adaptiveFormats`
- Retorna URL direta do stream MP4 (progressive, com áudio+vídeo)
- Fallback: retorna URLs adaptivas separadas (vídeo + áudio)

**2. Atualizar `src/pages/AppPage.tsx`**
- Na aba de resultados do YouTube, adicionar botão "Baixar vídeo para editar"
- Ao clicar: chama a edge function, recebe URL, faz download via `fetch` + `Blob`
- Após download, converte automaticamente para arquivo local (`uploadedFile`), habilitando as abas Editar e Legendar com Whisper

### Limitações conhecidas
- YouTube frequentemente muda a estrutura da página e adiciona proteções (signature cipher)
- Vídeos com restrição de idade ou privados não funcionarão
- Streams com cipher precisam de deobfuscação (complexo, pode quebrar)
- **Alternativa mais confiável**: pedir ao usuário que use yt-dlp localmente no PC e faça upload do arquivo — adicionar instruções claras na UI

### Resultado
- Usuário analisa YouTube → vê clips → clica "Baixar para editar" → vídeo vira arquivo local → pode usar Editar + Legendar (Whisper)
- Fallback: instruções para usar yt-dlp no PC + upload

