

# YouTube Upload — Cada Usuário Posta no Próprio Canal

## Como Funciona

Cada usuário conecta o próprio YouTube via Google OAuth. Quando faz upload, o vídeo vai para o canal **dele**, não o seu.

Fluxo:
```text
Usuário clica "Conectar YouTube"
  → Tela de consentimento do Google (youtube.upload scope)
  → Callback salva tokens no banco
  → Usuário escolhe clips → Upload vai pro canal DELE
```

## O Que Precisa Ser Feito

### 1. Pré-requisito: Google Cloud Console (você precisa fazer)
- Criar projeto no Google Cloud Console
- Ativar YouTube Data API v3
- Criar credenciais OAuth (Web Application)
- Redirect URI: `https://djabqkjniwfxbbvtsjeo.supabase.co/functions/v1/youtube-callback`
- Fornecer GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET como secrets do projeto

### 2. Banco de Dados — Tabela `youtube_tokens`
- `id`, `user_id` (referencia auth.users), `access_token`, `refresh_token`, `expires_at`, `channel_name`
- RLS: cada usuário só vê/edita os próprios tokens

### 3. Edge Functions (3 funções)
- **`youtube-auth`**: Gera URL de autorização do Google com scopes `youtube.upload` e redireciona o usuário
- **`youtube-callback`**: Recebe o code do Google, troca por tokens, salva na tabela `youtube_tokens`, redireciona de volta ao app
- **`youtube-upload`**: Recebe o vídeo + metadados, busca os tokens do usuário, faz upload via YouTube API, refresh automático se token expirado

### 4. UI no AppPage
- Botão "Conectar YouTube" que abre o fluxo OAuth
- Indicador de canal conectado (nome do canal)
- Botão "Desconectar YouTube"
- Dialog de upload com opções:
  - Upload de clip individual
  - Upload de todos os clips
  - Campos: título, descrição, visibilidade (público/não listado/privado)
- Progress bar durante upload

### 5. Segurança
- Tokens criptografados no banco
- RLS por user_id
- Refresh automático de tokens expirados
- Validação JWT em todas as edge functions

## Resumo
Você precisa primeiro criar as credenciais no Google Cloud Console e me fornecer o Client ID e Client Secret. Depois disso, eu implemento tudo — banco, funções, UI.

