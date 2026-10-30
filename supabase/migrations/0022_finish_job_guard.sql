-- =============================================================================
-- 0022_finish_job_guard.sql — finish_job() מסיים רק משימה שרצה עכשיו (סבב האבטחה, אזור D)
--
-- עד עכשיו finish_job() עדכן את המשימה בלי לבדוק את מצבה: סיום מאוחר או כפול (משלוח חוזר של QStash, שגיאה אחרי
-- הצלחה) יכול היה להחזיר ל-queued משימה שכבר הסתיימה או בוטלה, או לסמן done ניסיון חדש יותר.
--   * המשימה מתעדכנת רק כשהיא במצב running;
--   * p_attempts (חדש, לא חובה): כשנשלח, גם מספר הניסיון חייב להתאים — סיום של ניסיון קודם לא נוגע בניסיון החדש.
-- בכל מקרה אחר מוחזרת השורה כמו שהיא, בלי שינוי.
--
-- החתימה הישנה (3 פרמטרים) נמחקת, כדי שלא יהיו שתי פונקציות באותו שם עם ברירות מחדל. service_role בלבד.
-- =============================================================================

drop function if exists public.finish_job(uuid, text, timestamptz);

create or replace function public.finish_job(
  p_job_id   uuid,
  p_error    text        default null,
  p_retry_at timestamptz default null,
  p_attempts integer     default null
)
returns public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'finish_job: job % not found', p_job_id using errcode = 'P0002';
  end if;

  -- a late or duplicate finish: the job is no longer running, or this is not the attempt that is running now
  if v_job.status <> 'running' or (p_attempts is not null and v_job.attempts <> p_attempts) then
    return v_job;
  end if;

  if p_error is null then
    update public.jobs
       set status = 'done', last_error = null, locked_at = null
     where id = p_job_id
    returning * into v_job;

  elsif v_job.attempts < v_job.max_attempts then
    -- backoff: 5, 10, 20 דקות... (אלא אם ה-worker נתן זמן מפורש, למשל חיוב HYP ביום 3/5)
    update public.jobs
       set status     = 'queued',
           last_error = p_error,
           locked_at  = null,
           run_at     = coalesce(p_retry_at,
                                 now() + make_interval(mins => (5 * power(2, greatest(v_job.attempts - 1, 0)))::integer))
     where id = p_job_id
    returning * into v_job;

  else
    update public.jobs
       set status = 'failed', last_error = p_error, locked_at = null
     where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;
comment on function public.finish_job(uuid, text, timestamptz, integer) is
  'רק משימה במצב running (ואם נשלח p_attempts — רק הניסיון הזה). p_error ריק → done. אחרת: attempts < max_attempts → חוזר ל-queued ב-p_retry_at (או backoff 5/10/20 דק''); אחרת failed. סיום מאוחר/כפול מחזיר את השורה בלי שינוי.';

revoke execute on function public.finish_job(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.finish_job(uuid, text, timestamptz, integer) to service_role;
