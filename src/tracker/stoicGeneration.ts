import { supabase } from '../supabase';
import { validateGeneratedStoicModule, type StoicModule } from './stoic.js';

export async function generateStoicMonth(month: number): Promise<StoicModule> {
  if (!supabase) throw new Error('AI generation requires a configured Supabase account.');
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not check your account: ${sessionError.message}`);
  if (!session.session) throw new Error('Sign in before generating a new module.');
  const { data, error } = await supabase.functions.invoke<unknown>('generate-stoic-month', { body: {} });
  if (error) {
    const status = error.context instanceof Response ? error.context.status : null;
    if (status === 429) throw new Error('Daily generation limit reached. Try again tomorrow.');
    if (status === 401) throw new Error('Your session could not be verified. Sign in again.');
    if (status === 503) throw new Error('AI generation is not configured. Check the Edge Function, provider key, and generation limit setup.');
    throw new Error(`AI generation failed${status ? ` (HTTP ${status})` : ''}: ${error.message}.`);
  }
  return validateGeneratedStoicModule(data, month, `generated-${crypto.randomUUID()}`);
}
