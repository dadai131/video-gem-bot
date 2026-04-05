import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Piped instances rotate — keep a few working ones
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.in.projectsegfau.lt',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.protokolla.fi',
  'https://iv.ggtyler.dev',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { videoId } = await req.json();
    if (!videoId || typeof videoId !== 'string') {
      return new Response(JSON.stringify({ error: 'videoId é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');

    // Try all strategies in parallel for speed
    const result = await Promise.any([
      tryPipedInstances(cleanId),
      tryInvidiousInstances(cleanId),
      tryDirectYoutube(cleanId),
    ]).catch(() => null);

    if (result) {
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Não foi possível baixar este vídeo automaticamente. Use o yt-dlp no seu computador e faça upload do arquivo.',
      fallback: true,
      ytdlpCommand: `yt-dlp -f "best[ext=mp4]" "https://www.youtube.com/watch?v=${cleanId}" -o video.mp4`,
    }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('download-youtube error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Erro interno', fallback: true }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function tryPipedInstances(id: string): Promise<any> {
  const errors: string[] = [];
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${id}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();

      const progressive = (data.videoStreams || [])
        .filter((f: any) => !f.videoOnly && f.url && f.format === 'MPEG_4')
        .sort((a: any, b: any) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

      if (progressive.length > 0) {
        return { type: 'progressive', url: progressive[0].url, quality: progressive[0].quality, mimeType: 'video/mp4' };
      }

      const vidOnly = (data.videoStreams || [])
        .filter((f: any) => f.url && f.format === 'MPEG_4')
        .sort((a: any, b: any) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
      const audio = (data.audioStreams || [])
        .filter((f: any) => f.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (vidOnly.length > 0) {
        return {
          type: audio.length > 0 ? 'adaptive' : 'progressive',
          url: vidOnly[0].url, videoUrl: vidOnly[0].url, audioUrl: audio[0]?.url,
          quality: vidOnly[0].quality || '720p', mimeType: 'video/mp4',
        };
      }
    } catch (err) {
      errors.push(`Piped ${instance}: ${err.message}`);
    }
  }
  throw new Error('All Piped instances failed: ' + errors.join('; '));
}

async function tryInvidiousInstances(id: string): Promise<any> {
  const errors: string[] = [];
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${id}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();

      const progressive = (data.formatStreams || [])
        .filter((f: any) => f.type?.startsWith('video/mp4') && f.url)
        .sort((a: any, b: any) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0));

      if (progressive.length > 0) {
        return { type: 'progressive', url: progressive[0].url, quality: progressive[0].qualityLabel, mimeType: 'video/mp4' };
      }

      const adaptive = (data.adaptiveFormats || [])
        .filter((f: any) => f.type?.startsWith('video/mp4') && f.url)
        .sort((a: any, b: any) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0));
      const audio = (data.adaptiveFormats || [])
        .filter((f: any) => f.type?.startsWith('audio/') && f.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (adaptive.length > 0) {
        return {
          type: audio.length > 0 ? 'adaptive' : 'progressive',
          url: adaptive[0].url, videoUrl: adaptive[0].url, audioUrl: audio[0]?.url,
          quality: adaptive[0].qualityLabel || '720p', mimeType: 'video/mp4',
        };
      }
    } catch (err) {
      errors.push(`Invidious ${instance}: ${err.message}`);
    }
  }
  throw new Error('All Invidious instances failed: ' + errors.join('; '));
}

async function tryDirectYoutube(id: string): Promise<any> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!pageRes.ok) throw new Error('YouTube page failed');
  const html = await pageRes.text();

  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!match) throw new Error('No player response');

  const data = JSON.parse(match[1]);
  const sd = data?.streamingData;
  if (!sd) throw new Error('No streaming data');

  const mp4 = (sd.formats || [])
    .filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
    .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

  if (mp4.length > 0) {
    return { type: 'progressive', url: mp4[0].url, quality: `${mp4[0].height}p`, mimeType: mp4[0].mimeType };
  }

  const vs = (sd.adaptiveFormats || [])
    .filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
    .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
  const as2 = (sd.adaptiveFormats || [])
    .filter((f: any) => f.mimeType?.startsWith('audio/mp4') && f.url && !f.signatureCipher)
    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

  if (vs.length > 0 && as2.length > 0) {
    return { type: 'adaptive', videoUrl: vs[0].url, audioUrl: as2[0].url, quality: `${vs[0].height}p` };
  }

  throw new Error('All streams require cipher');
}
