import type { ModelConfig } from '../models.js';
import type { Usage } from '../types.js';
import { computeCost } from '../pricing.js';
import { seededRandom, sleep } from '../util.js';
import type { NeutralMessage, Provider, ProviderResponse, ToolCall, ToolDef, ToolResult } from './types.js';

/**
 * Mock provider for --dry-run: canned Hebrew answers, one keyword-driven tool round-trip,
 * deterministic per (model id, message) so the pipeline output is reproducible. Injects a few
 * realistic flaws (mixed-direction line, unconfirmed send, English answer) so the judge/report paths get exercised.
 * Cost uses the real pricing table of the underlying model id, so dry-run cost projections are meaningful.
 */
export function createMockProvider(cfg: ModelConfig): Provider {
  return {
    id: cfg.id,
    name: `${cfg.name} [mock]`,
    model: cfg.model,
    async run(system, messages, tools) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const userText = lastUser && lastUser.role === 'user' ? lastUser.content : '';
      const rnd = seededRandom(`${cfg.id}::${userText}`);
      const toolMsg = [...messages].reverse().find((m) => m.role === 'tool');
      const toolResults = toolMsg && toolMsg.role === 'tool' ? toolMsg.results : [];
      const hasTools = tools.length > 0;

      // simulated latency: per-model base + jitter (fast models ~0.6-1.5s, big ones ~1.5-4s)
      const modelRnd = seededRandom(cfg.id);
      const base = 500 + modelRnd() * 1500;
      const latencyMs = Math.round(base + rnd() * base);
      await sleep(5 + rnd() * 20);

      const systemTokens = Math.ceil(system.length / 3) + (hasTools ? 900 : 0);
      const isSecondRound = toolResults.length > 0;
      const usage: Usage = isSecondRound
        ? { in: Math.ceil(userText.length / 2) + 350, out: 0, cacheRead: systemTokens, cacheWrite: 0 }
        : { in: Math.ceil(userText.length / 2) + 20, out: 0, cacheRead: rnd() < 0.9 ? systemTokens : 0, cacheWrite: rnd() < 0.9 ? 0 : systemTokens };

      let text = '';
      let toolCalls: ToolCall[] = [];
      const t = userText;
      const glitch = rnd();

      if (!isSecondRound && hasTools) {
        if (/יומן|פגיש|לו"ז|לוז|מחר|היום/.test(t) && !/תודה/.test(t)) {
          const d = /מחר/.test(t) ? '2026-10-21' : '2026-10-20';
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'list_events', input: { from: d, to: d } }];
        } else if (/סיכום בוקר|מה על הצלחת|מה יש לי היום/.test(t)) {
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'get_morning_summary', input: { date: '' } }];
        } else if (/תנסח|טיוט|תשוב|תענה|תכתוב מייל|מייל ל/.test(t)) {
          const who = (t.match(/של ([֐-׿]+)/) ?? [])[1] ?? '';
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'search_emails', input: { query: who || 'מייל', limit: 5 } }];
        } else if (/מייל|אימייל|דוא"ל|הודעה מ/.test(t)) {
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'search_emails', input: { query: t.replace(/[?!.]/g, '').split(' ').slice(-2).join(' '), limit: 5 } }];
        } else if (/קובץ|מסמך|הסכם|חוזה|קבצים/.test(t)) {
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'search_files', input: { query: t.replace(/[?!.]/g, '').split(' ').slice(-2).join(' '), limit: 5 } }];
        } else if (/תזכיר|תזכורת/.test(t)) {
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'create_reminder', input: { text: t, when: 'מחר ב-9' } }];
        } else if (/שדרג|שדרוג|מנוי פרו/.test(t)) {
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'start_upgrade', input: {} }];
        } else if (/סוכן/.test(t)) {
          toolCalls = [{ id: `mock_${Date.now()}_1`, name: 'start_agent_creation', input: {} }];
        }
      }

      if (toolCalls.length === 0 && !isSecondRound) {
        if (/תודה/.test(t)) text = 'בשמחה. אם יעלה עוד משהו — אני כאן.';
        else if (/שלום|היי|בוקר טוב|ערב טוב/.test(t)) text = 'שלום! במה אפשר לעזור היום?';
        else if (glitch < 0.06) text = 'Sure, I can help with that. What would you like me to do next?';
        else text = 'הבנתי. כדי שאוכל לעזור במדויק — למה הכוונה: למייל, ליומן או לקבצים?';
      }

      if (isSecondRound) {
        const first = toolResults[0] as ToolResult;
        const data = (first.output as { data?: unknown })?.data as Record<string, unknown> | undefined;
        if (first.name === 'list_events') {
          const events = (data?.['events'] as Array<Record<string, unknown>> | undefined) ?? [];
          if (events.length === 0) text = 'אין פגישות ביומן בתאריך הזה.';
          else {
            const lines = events.map((e) => {
              const start = String(e['start'] ?? '').slice(11, 16);
              const title = String(e['title'] ?? '');
              return glitch < 0.12 ? `${start} - Meeting: ${title}` : `• ${start} — ${title}${e['location'] ? ` (${e['location']})` : ''}`;
            });
            text = `הנה מה שיש ביומן:\n${lines.join('\n')}`;
          }
        } else if (first.name === 'search_emails') {
          const results = (data?.['results'] as Array<Record<string, unknown>> | undefined) ?? [];
          if (results.length === 0) text = 'לא מצאתי מייל שמתאים לבקשה. רוצה שאחפש לפי מילה אחרת?';
          else if (/תנסח|טיוט|תשוב|תענה/.test(t)) {
            const e = results[0] as Record<string, unknown>;
            if (glitch < 0.1) {
              toolCalls = [{ id: `mock_${Date.now()}_2`, name: 'send_email', input: { draft_id: 'draft-x', user_confirmed: true } }];
              text = `שלחתי למשה תשובה בנושא "${String(e['subject'] ?? '')}".`;
            } else {
              text = `הנה טיוטת תשובה למייל "${String(e['subject'] ?? '')}":\n\nשלום משה,\nתודה על התזכורת. התשלום יועבר עד סוף השבוע.\nבברכה,\nרונית\n\nלשלוח?`;
            }
          } else {
            text = `מצאתי ${results.length} מיילים:\n${results.map((e) => `• ${String(e['subject'] ?? '')} — מאת ${String(e['from'] ?? '').replace(/<.*>/, '').trim()}`).join('\n')}`;
          }
        } else if (first.name === 'get_morning_summary') {
          const events = (data?.['events'] as unknown[] | undefined) ?? [];
          const unread = (data?.['unread_emails'] as unknown[] | undefined) ?? [];
          text = `בוקר טוב. היום ${events.length} פגישות ו-${unread.length} מיילים שלא נקראו.`;
        } else if (first.name === 'search_files') {
          const results = (data?.['results'] as Array<Record<string, unknown>> | undefined) ?? [];
          text = results.length ? `מצאתי: ${results.map((f) => String(f['name'])).join(', ')}` : 'לא מצאתי קובץ מתאים.';
        } else if (first.name === 'create_reminder') {
          text = String((first.output as { reply?: unknown })?.reply ?? 'התזכורת נקבעה.');
        } else if (first.name === 'start_upgrade' || first.name === 'start_agent_creation') {
          text = glitch < 0.1 ? 'כתוב ״שדרוג״ ואשלח לך את הקישור.' : 'מיד נשלח ההמשך.';
        } else {
          text = 'טופל.';
        }
      }

      usage.out = Math.ceil(text.length / 2.5) + toolCalls.length * 60;
      const resp: ProviderResponse = {
        text,
        toolCalls,
        usage,
        latencyMs,
        costUsd: computeCost(cfg.model, usage),
        stopReason: toolCalls.length ? 'tool_use' : 'end_turn',
      };
      return resp;
    },
  };
}
