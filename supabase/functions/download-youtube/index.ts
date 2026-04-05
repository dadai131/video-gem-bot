import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
    const youtubeUrl = `https://www.youtube.com/watch?v=${cleanId}`;

    // Strategy 1: Cobalt API
    const cobaltResult = await tryCobalt(youtubeUrl);
    if (cobaltResult) {
      console.log('Cobalt succeeded');
      return new Response(JSON.stringify(cobaltResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Strategy 2: Piped API instances
    const pipedResult = await tryPiped(cleanId);
    if (pipedResult) {
      console.log('Piped succeeded');
      return new Response(JSON.stringify(pipedResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Strategy 3: Direct YouTube scrape
    const directResult = await tryDirectYoutube(cleanId);
    if (directResult) {
      console.log('Direct YouTube succeeded');
      return new Response(JSON.stringify(directResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Não foi possível obter o vídeo. Tente outro link ou faça upload direto do arquivo.',
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

async function tryCobalt(youtubeUrl: string) {
  const COBALT_APIS = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekmiki.com',
  ];

  for (const api of COBALT_APIS) {
    try {
      const res = await fetch(`${api}/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl,
          downloadMode: 'auto',
          filenameStyle: 'basic',
          videoQuality: '720',
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const text = await res.text();
        console.log(`Cobalt ${api} returned ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();
      console.log('Cobalt response status:', data.status);

      if (data.status === 'redirect' && data.url) {
        return { type: 'progressive', url: data.url, quality: '720p', mimeType: 'video/mp4' };
      }
      if (data.status === 'tunnel' && data.url) {
        return { type: 'progressive', url: data.url, quality: '720p', mimeType: 'video/mp4' };
      }
      if (data.status === 'stream' && data.url) {
        return { type: 'progressive', url: data.url, quality: '720p', mimeType: 'video/mp4' };
      }
      if (data.url) {
        return { type: 'progressive', url: data.url, quality: '720p', mimeType: 'video/mp4' };
      }
    } catch (err) {
      console.log(`Cobalt ${api} failed:`, err.message);
    }
  }
  return null;
}

async function tryPiped(cleanId: string) {
  const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://api-piped.mha.fi',
  ];

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${cleanId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();

      // Progressive streams (video + audio)
      const progressive = (data.videoStreams || [])
        .filter((f: any) => f.format === 'MPEG_4' && !f.videoOnly && f.url)
        .sort((a: any, b: any) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

      if (progressive.length > 0) {
        return { type: 'progressive', url: progressive[0].url, quality: progressive[0].quality || '360p', mimeType: 'video/mp4' };
      }

      // Video-only + audio
      const vidOnly = (data.videoStreams || [])
        .filter((f: any) => f.format === 'MPEG_4' && f.url)
        .sort((a: any, b: any) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
      const audio = (data.audioStreams || [])
        .filter((f: any) => f.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (vidOnly.length > 0) {
        return {
          type: audio.length > 0 ? 'adaptive' : 'progressive',
          url: vidOnly[0].url,
          videoUrl: vidOnly[0].url,
          audioUrl: audio[0]?.url,
          quality: vidOnly[0].quality || '720p',
          mimeType: 'video/mp4',
        };
      }
    } catch (err) {
      console.log(`Piped ${instance} failed:`, err.message);
    }
  }
  return null;
}

async function tryDirectYoutube(cleanId: string) {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${cleanId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!playerMatch) return null;

    const playerData = JSON.parse(playerMatch[1]);
    const sd = playerData?.streamingData;
    if (!sd) return null;

    const formats = sd.formats || [];
    const mp4 = formats
      .filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    if (mp4.length > 0) {
      return { type: 'progressive', url: mp4[0].url, quality: `${mp4[0].height || '?'}p`, mimeType: mp4[0].mimeType };
    }

    const af = sd.adaptiveFormats || [];
    const vs = af.filter((f: any) => f.mimeType?.startsWith('video/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
    const as2 = af.filter((f: any) => f.mimeType?.startsWith('audio/mp4') && f.url && !f.signatureCipher)
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

    if (vs.length > 0 && as2.length > 0) {
      return { type: 'adaptive', videoUrl: vs[0].url, audioUrl: as2[0].url, quality: `${vs[0].height || '?'}p` };
    }
  } catch { /* ignore */ }
  return null;
}
