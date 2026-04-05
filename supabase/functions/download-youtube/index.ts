import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://vid.puffyan.us',
  'https://invidious.privacyredirect.com',
];

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
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !user) {
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

    // Try Invidious instances
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const apiUrl = `${instance}/api/v1/videos/${cleanId}`;
        const res = await fetch(apiUrl, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          await res.text();
          continue;
        }

        const data = await res.json();

        // Try formatStreams first (progressive, has audio+video)
        const formatStreams = data.formatStreams || [];
        const progressive = formatStreams
          .filter((f: any) => f.type?.startsWith('video/mp4') && f.url)
          .sort((a: any, b: any) => {
            const hA = parseInt(a.qualityLabel) || 0;
            const hB = parseInt(b.qualityLabel) || 0;
            return hB - hA;
          });

        if (progressive.length > 0) {
          const best = progressive[0];
          return new Response(JSON.stringify({
            type: 'progressive',
            url: best.url,
            quality: best.qualityLabel || '360p',
            mimeType: best.type,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Try adaptiveFormats
        const adaptive = data.adaptiveFormats || [];
        const videoStreams = adaptive
          .filter((f: any) => f.type?.startsWith('video/mp4') && f.url)
          .sort((a: any, b: any) => {
            const hA = parseInt(a.qualityLabel) || 0;
            const hB = parseInt(b.qualityLabel) || 0;
            return hB - hA;
          });

        const audioStreams = adaptive
          .filter((f: any) => f.type?.startsWith('audio/') && f.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        if (videoStreams.length > 0) {
          return new Response(JSON.stringify({
            type: audioStreams.length > 0 ? 'adaptive' : 'progressive',
            url: videoStreams[0].url,
            videoUrl: videoStreams[0].url,
            audioUrl: audioStreams[0]?.url,
            quality: videoStreams[0].qualityLabel || '720p',
            mimeType: videoStreams[0].type,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (err) {
        console.log(`Instance ${instance} failed:`, err.message);
        continue;
      }
    }

    // All instances failed — try direct YouTube scrape as last resort
    const directResult = await tryDirectYoutube(cleanId);
    if (directResult) {
      return new Response(JSON.stringify(directResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Não foi possível obter o vídeo. Tente outro link ou faça upload direto.',
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

async function tryDirectYoutube(cleanId: string) {
  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${cleanId}`;
    const pageRes = await fetch(youtubeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!playerMatch) return null;

    const playerData = JSON.parse(playerMatch[1]);
    const streamingData = playerData?.streamingData;
    if (!streamingData) return null;

    const formats = streamingData.formats || [];
    const progressiveMp4 = formats
      .filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    if (progressiveMp4.length > 0) {
      const best = progressiveMp4[0];
      return {
        type: 'progressive',
        url: best.url,
        quality: `${best.height || '?'}p`,
        mimeType: best.mimeType,
      };
    }

    const adaptiveFormats = streamingData.adaptiveFormats || [];
    const videoStreams = adaptiveFormats
      .filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
    const audioStreams = adaptiveFormats
      .filter((f: any) => f.mimeType?.startsWith('audio/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

    if (videoStreams.length > 0 && audioStreams.length > 0) {
      return {
        type: 'adaptive',
        videoUrl: videoStreams[0].url,
        audioUrl: audioStreams[0].url,
        videoQuality: `${videoStreams[0].height || '?'}p`,
      };
    }
  } catch {
    // ignore
  }
  return null;
}
