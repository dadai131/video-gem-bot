import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Fetch the YouTube video page to extract caption tracks
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
    });
    const html = await pageResp.text();

    // Extract captions JSON from the page
    const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s);
    if (!captionMatch) {
      console.log("No captions found in page");
      return null;
    }

    let captionsJson;
    try {
      captionsJson = JSON.parse(captionMatch[1]);
    } catch {
      console.log("Failed to parse captions JSON");
      return null;
    }

    const tracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) return null;

    // Prefer Portuguese, then English, then first available
    const ptTrack = tracks.find((t: any) => t.languageCode?.startsWith("pt"));
    const enTrack = tracks.find((t: any) => t.languageCode?.startsWith("en"));
    const track = ptTrack || enTrack || tracks[0];

    const captionResp = await fetch(track.baseUrl + "&fmt=json3");
    const captionData = await captionResp.json();

    if (!captionData.events) return null;

    // Build transcript with timestamps
    const lines: string[] = [];
    for (const event of captionData.events) {
      if (!event.segs) continue;
      const text = event.segs.map((s: any) => s.utf8).join("").trim();
      if (!text) continue;
      const startMs = event.tStartMs || 0;
      const mins = Math.floor(startMs / 60000);
      const secs = Math.floor((startMs % 60000) / 1000);
      lines.push(`[${mins}:${secs.toString().padStart(2, "0")}] ${text}`);
    }

    return lines.join("\n");
  } catch (e) {
    console.error("Transcript fetch error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Get transcript
    const transcript = await fetchTranscript(videoId);
    if (!transcript) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair a transcrição. O vídeo pode não ter legendas disponíveis." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Analyze with AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um especialista em edição de vídeos para redes sociais. Analise a transcrição e identifique os 4-6 melhores trechos para cortes virais (shorts/reels).

Para cada trecho, retorne:
- title: título curto e chamativo em português
- start_seconds: segundo exato de início
- end_seconds: segundo exato de fim (cada trecho deve ter entre 15 e 90 segundos)
- score: pontuação de viralidade de 0-100
- reason: breve razão pela qual esse trecho é bom

Priorize: ganchos emocionais, insights únicos, momentos engraçados, frases de impacto, revelações surpreendentes.

Responda APENAS com JSON válido, sem markdown.`,
          },
          {
            role: "user",
            content: `Analise esta transcrição e identifique os melhores momentos:\n\n${transcript.slice(0, 15000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "identify_clips",
              description: "Return the best video clips identified from the transcript",
              parameters: {
                type: "object",
                properties: {
                  clips: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        start_seconds: { type: "number" },
                        end_seconds: { type: "number" },
                        score: { type: "number" },
                        reason: { type: "string" },
                      },
                      required: ["title", "start_seconds", "end_seconds", "score", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["clips"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "identify_clips" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para análise de IA." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResponse.text();
      console.error("AI error:", status, t);
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let clips;

    if (toolCall) {
      clips = JSON.parse(toolCall.function.arguments).clips;
    } else {
      // Fallback: try to parse from content
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) clips = JSON.parse(jsonMatch[0]);
      else throw new Error("Could not parse AI response");
    }

    // Sort by score descending
    clips.sort((a: any, b: any) => b.score - a.score);

    return new Response(JSON.stringify({ videoId, clips, transcript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-video error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro ao analisar vídeo" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
