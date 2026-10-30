import type { Tool } from "@/lib/ai/tools";
import { TASKS_NOTE, cleanTitle, compactTask, dueHe, DUE_RE } from "@/lib/connections/task-format";
import { gcopy } from "@/lib/copy/bot-google";
import { GoogleApiError, type GoogleClient } from "./client";
import { tasksConsentStatus } from "./consent";
import { googleErrorOutput } from "./errors";

/**
 * Google Tasks for the strong model (scope `tasks`). Reading and adding a task to the user's own list is an internal
 * action, like a reminder (lib/ai/reminder-tools.ts): no approval buttons, and the reply echoes what was added. A
 * connection without the scope (made before Tasks joined the base set, or the box was unticked) gets the incremental
 * consent link instead — from the tool itself, so "add a task" is answered either way.
 */
export interface GoogleTasksDeps {
  google: () => Promise<GoogleClient>;
  /** the connection has the `tasks` scope */
  granted: boolean;
  /** one-time chat link for `feature=tasks` */
  consentLink?: () => string;
}

const str = (description: string) => ({ type: "string", description });
const REPLY_NOTE = "לענות למשתמש בנוסח שב-reply.";

export function googleTasksTools(deps: GoogleTasksDeps): Tool[] {
  const guard = async (fn: (g: GoogleClient) => Promise<unknown>) => {
    if (!deps.granted) return tasksConsentStatus({ consentLink: deps.consentLink });
    try {
      return await fn(await deps.google());
    } catch (e) {
      // the scope was granted once but the token lacks it now (unticked in a later consent)
      if (e instanceof GoogleApiError && e.insufficientScope) return tasksConsentStatus({ consentLink: deps.consentLink });
      return googleErrorOutput(e);
    }
  };
  return [
    {
      name: "gtasks_list_tasks",
      description: "המשימות הפתוחות של המשתמש ב-Google Tasks (מכל הרשימות), עם תאריך יעד אם יש.",
      readOnly: true,
      input_schema: { type: "object", properties: { include_completed: { type: "boolean", description: "גם משימות שהושלמו" } }, required: ["include_completed"], additionalProperties: false },
      run: (input) =>
        guard(async (g) => {
          const lists = (await g.listTaskLists(10)).slice(0, 5);
          const tasks: Record<string, unknown>[] = [];
          for (const list of lists) {
            for (const t of await g.listTasks(list.id, { showCompleted: Boolean(input.include_completed), maxResults: 50 })) tasks.push(compactTask({ ...t, completed: t.status === "completed" }, list.title));
            if (tasks.length >= 50) break;
          }
          return { count: tasks.length, tasks: tasks.slice(0, 50), note: TASKS_NOTE };
        }),
    },
    {
      name: "gtasks_create_task",
      description: "מוסיף משימה לרשימת המשימות הראשית של המשתמש ב-Google Tasks. פעולה פנימית, בלי אישור. להשתמש כשמבקשים משימה ב-Google Tasks, או משימה כש-Google הוא החשבון היחיד שמחובר.",
      readOnly: true,
      internalWrite: true,
      input_schema: {
        type: "object",
        properties: { title: str("המשימה, קצרה ובלשון המשתמש"), notes: str("פרטים נוספים או ריק"), due_date: str("תאריך יעד YYYY-MM-DD או ריק") },
        required: ["title", "notes", "due_date"],
        additionalProperties: false,
      },
      run: (input, ctx) =>
        guard(async (g) => {
          const title = cleanTitle(input.title);
          if (!title) return { status: "error", error: "empty_title" };
          const due = DUE_RE.test(String(input.due_date ?? "")) ? String(input.due_date) : null;
          const task = await g.createTask("@default", { title, notes: String(input.notes ?? "").trim().slice(0, 2000) || undefined, due });
          await ctx.db.addAudit({ user_id: ctx.userId, action: "google.tasks.create", target: task.id, result: "ok" });
          return { status: "done", id: task.id, reply: gcopy["g.tasks.created"](title, "Google Tasks", dueHe(task.due ?? due)), note: REPLY_NOTE };
        }),
    },
  ];
}
