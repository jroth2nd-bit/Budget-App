const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !supabaseKey || !openaiKey) return respond({ error: 'AI generation is not configured.' }, 503);
  if (!authorization || !authorization.startsWith('Bearer ')) return respond({ error: 'Sign in to generate a module.' }, 401);

  try {
    const user = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: supabaseKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!user.ok) return respond({ error: 'Your session could not be verified.' }, 401);

    const limit = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_stoic_generation`, {
      method: 'POST',
      headers: { Authorization: authorization, apikey: supabaseKey, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    if (!limit.ok) return respond({ error: 'AI generation limit is not configured.' }, 503);
    if (await limit.json() !== true) return respond({ error: 'Daily generation limit reached. Try again tomorrow.' }, 429);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: 'Create a new 30-day Stoic journaling module. Return only JSON with keys virtue, focus, quote, morning, evening. Quote must be an object with text (an original, short Stoic-inspired reflection, not an attributed historical quotation) and attribution exactly "AI-generated reflection". Morning must contain exactly two simple questions, each under 10 words. Evening must contain exactly three simple questions, each under 10 words, with the third exactly "What is one thing I am grateful for today?". Do not include personal data.',
        }],
      }),
    });
    if (!response.ok) return respond({ error: 'AI provider request failed. Check the function configuration and provider account.' }, 502);
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return respond({ error: 'AI provider returned no module.' }, 502);
    return respond(JSON.parse(content), 200);
  } catch (error) {
    console.error('Stoic module generation failed:', error instanceof Error ? error.message : 'Unknown error');
    return respond({ error: 'Could not generate a module. Please retry.' }, 502);
  }
});
