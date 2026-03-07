import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { videoId } = await req.json();
    if (!videoId || typeof videoId !== 'string') {
      return new Response(JSON.stringify({ error: 'videoId é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
    const youtubeUrl = `https://www.youtube.com/watch?v=${cleanId}`;

    // Fetch YouTube page
    const pageRes = await fetch(youtubeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!pageRes.ok) {
      return new Response(JSON.stringify({ error: 'Não foi possível acessar a página do YouTube' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await pageRes.text();

    // Extract ytInitialPlayerResponse
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!playerMatch) {
      return new Response(JSON.stringify({ 
        error: 'Não foi possível extrair dados do player. O vídeo pode ter restrições.',
        fallback: true,
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let playerData: any;
    try {
      playerData = JSON.parse(playerMatch[1]);
    } catch {
      return new Response(JSON.stringify({ 
        error: 'Erro ao parsear dados do player',
        fallback: true,
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const streamingData = playerData?.streamingData;
    if (!streamingData) {
      return new Response(JSON.stringify({ 
        error: 'Dados de streaming não disponíveis. O vídeo pode exigir login ou ter restrição de idade.',
        fallback: true,
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try progressive formats first (video + audio combined)
    const formats = streamingData.formats || [];
    const adaptiveFormats = streamingData.adaptiveFormats || [];

    // Find best progressive MP4 (has both video and audio)
    const progressiveMp4 = formats
      .filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    if (progressiveMp4.length > 0) {
      const best = progressiveMp4[0];
      return new Response(JSON.stringify({
        type: 'progressive',
        url: best.url,
        quality: `${best.height || '?'}p`,
        mimeType: best.mimeType,
        contentLength: best.contentLength,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: adaptive formats (separate video and audio)
    const videoStreams = adaptiveFormats
      .filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    const audioStreams = adaptiveFormats
      .filter((f: any) => f.mimeType?.startsWith('audio/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

    if (videoStreams.length > 0 && audioStreams.length > 0) {
      return new Response(JSON.stringify({
        type: 'adaptive',
        videoUrl: videoStreams[0].url,
        audioUrl: audioStreams[0].url,
        videoQuality: `${videoStreams[0].height || '?'}p`,
        videoMimeType: videoStreams[0].mimeType,
        audioMimeType: audioStreams[0].mimeType,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All streams have signatureCipher — can't extract without deobfuscation
    const hasCipher = [...formats, ...adaptiveFormats].some((f: any) => f.signatureCipher);
    
    return new Response(JSON.stringify({
      error: hasCipher
        ? 'Este vídeo usa proteção de assinatura (cipher). Não é possível baixar automaticamente.'
        : 'Nenhum stream MP4 acessível encontrado.',
      fallback: true,
    }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('download-youtube error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Erro interno', fallback: true }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
