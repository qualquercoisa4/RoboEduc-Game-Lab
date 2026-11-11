-- RoboEduc Game Lab — production schema
-- Apply once to a new Supabase project. All data and files remain private.

create extension if not exists pgcrypto;

create type public.account_role as enum ('teacher', 'student');
create type public.submission_status as enum ('submitted', 'reviewing', 'approved', 'needs_changes');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role public.account_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_.-]{3,32}$')
);
create unique index profiles_username_case_insensitive_idx on public.profiles (lower(username));

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  access_code text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  title text not null,
  description text not null,
  learning_objective text,
  difficulty text not null default 'Iniciante' check (difficulty in ('Iniciante','Intermediário','Avançado')),
  cover_path text,
  file_path text,
  instructions text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_assignments (
  project_id uuid not null references public.projects(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (project_id, class_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete cascade,
  file_path text not null,
  original_filename text not null,
  status public.submission_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.submission_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now()
);

create index classes_teacher_id_idx on public.classes(teacher_id);
create index class_members_student_id_idx on public.class_members(student_id);
create index project_assignments_class_id_idx on public.project_assignments(class_id);
create index submissions_student_id_idx on public.submissions(student_id);
create index submissions_class_id_idx on public.submissions(class_id);
create index submissions_project_id_idx on public.submissions(project_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger classes_updated_at before update on public.classes
for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger submissions_updated_at before update on public.submissions
for each row execute function public.set_updated_at();

-- Every newly provisioned Auth user starts as a student.
-- The first teacher's role is elevated manually in the trusted SQL editor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_username text;
begin
  new_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    new_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new_username),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- SECURITY DEFINER helpers prevent recursive RLS checks on membership and profile data.
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'teacher'
  );
$$;

create or replace function public.teaches_class(target_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes c
    where c.id = target_class and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_class_member(target_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_members cm
    where cm.class_id = target_class and cm.student_id = auth.uid()
  );
$$;

create or replace function public.is_student_profile(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user and p.role = 'student'
  );
$$;

create or replace function public.join_class_by_code(entered_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $
declare
  target_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login para entrar em uma turma.';
  end if;

  if not public.is_student_profile(auth.uid()) then
    raise exception 'Somente contas de aluno podem entrar em turmas.';
  end if;

  select id
  into target_class_id
  from public.classes
  where access_code = upper(trim(entered_code))
    and is_active = true;

  if target_class_id is null then
    raise exception 'Código de turma inválido ou turma inativa.';
  end if;

  insert into public.class_members (class_id, student_id)
  values (target_class_id, auth.uid())
  on conflict (class_id, student_id) do nothing;

  return target_class_id;
end;
$;

revoke all on function public.join_class_by_code(text) from public;
grant execute on function public.join_class_by_code(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_feedback enable row level security;

create policy "profiles_read_self_or_teacher_roster" on public.profiles
for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1
    from public.class_members cm
    join public.classes c on c.id = cm.class_id
    where cm.student_id = profiles.id and c.teacher_id = auth.uid()
  )
);
create policy "profiles_update_self" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (username, display_name) on public.profiles to authenticated;
-- The role column can only be changed by trusted server/admin operations.

create policy "classes_read_teacher_or_member" on public.classes
for select to authenticated using (teacher_id = auth.uid() or public.is_class_member(id));
create policy "classes_insert_teacher" on public.classes
for insert to authenticated with check (teacher_id = auth.uid() and public.is_teacher());
create policy "classes_update_teacher" on public.classes
for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "classes_delete_teacher" on public.classes
for delete to authenticated using (teacher_id = auth.uid());

create policy "class_members_read_teacher_or_student" on public.class_members
for select to authenticated using (student_id = auth.uid() or public.teaches_class(class_id));
create policy "class_members_manage_teacher" on public.class_members
for all to authenticated
using (public.teaches_class(class_id))
with check (public.teaches_class(class_id) and public.is_student_profile(student_id));

create policy "projects_read_creator_or_assigned_student" on public.projects
for select to authenticated using (
  created_by = auth.uid()
  or exists (
    select 1 from public.project_assignments pa
    join public.class_members cm on cm.class_id = pa.class_id
    where pa.project_id = projects.id and cm.student_id = auth.uid()
  )
);
create policy "projects_insert_teacher" on public.projects
for insert to authenticated with check (created_by = auth.uid() and public.is_teacher());
create policy "projects_update_creator" on public.projects
for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "projects_delete_creator" on public.projects
for delete to authenticated using (created_by = auth.uid());

create policy "assignments_read_teacher_or_class_member" on public.project_assignments
for select to authenticated using (public.teaches_class(class_id) or public.is_class_member(class_id));
create policy "assignments_manage_teacher" on public.project_assignments
for all to authenticated
using (
  public.teaches_class(class_id)
  and exists (
    select 1 from public.projects p
    where p.id = project_assignments.project_id and p.created_by = auth.uid()
  )
)
with check (
  public.teaches_class(class_id)
  and exists (
    select 1 from public.projects p
    where p.id = project_assignments.project_id and p.created_by = auth.uid()
  )
);

create policy "submissions_read_owner_or_teacher" on public.submissions
for select to authenticated using (student_id = auth.uid() or public.teaches_class(class_id));
create policy "submissions_insert_student" on public.submissions
for insert to authenticated with check (
  student_id = auth.uid()
  and public.is_class_member(class_id)
  and exists (
    select 1 from public.project_assignments pa
    where pa.project_id = submissions.project_id and pa.class_id = submissions.class_id
  )
);
create policy "submissions_update_teacher" on public.submissions
for update to authenticated using (public.teaches_class(class_id))
with check (public.teaches_class(class_id));
revoke update on public.submissions from authenticated;
grant update (status) on public.submissions to authenticated;

create policy "feedback_read_student_or_teacher" on public.submission_feedback
for select to authenticated using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.submissions s
    where s.id = submission_id and s.student_id = auth.uid()
  )
);
create policy "feedback_insert_teacher" on public.submission_feedback
for insert to authenticated with check (
  teacher_id = auth.uid()
  and exists (
    select 1 from public.submissions s
    where s.id = submission_id and public.teaches_class(s.class_id)
  )
);

-- Private buckets. No public URL access is enabled.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-files', 'project-files', false, 104857600, array['application/zip','application/x-zip-compressed','application/octet-stream']),
  ('student-submissions', 'student-submissions', false, 104857600, array['application/zip','application/x-zip-compressed','application/octet-stream'])
on conflict (id) do nothing;

create policy "teachers_upload_own_project_files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'project-files'
  and public.is_teacher()
  and (storage.foldername(name))[1] = 'teacher'
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "teachers_read_own_project_files" on storage.objects
for select to authenticated using (
  bucket_id = 'project-files'
  and public.is_teacher()
  and (storage.foldername(name))[1] = 'teacher'
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "students_read_assigned_project_files" on storage.objects
for select to authenticated using (
  bucket_id = 'project-files'
  and exists (
    select 1
    from public.projects p
    join public.project_assignments pa on pa.project_id = p.id
    join public.class_members cm on cm.class_id = pa.class_id
    where p.file_path = storage.objects.name and cm.student_id = auth.uid()
  )
);

create policy "students_upload_own_submissions" on storage.objects
for insert to authenticated with check (
  bucket_id = 'student-submissions'
  and public.is_student_profile(auth.uid())
  and (storage.foldername(name))[1] = 'student'
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "students_and_class_teacher_read_submissions" on storage.objects
for select to authenticated using (
  bucket_id = 'student-submissions'
  and (
    ((storage.foldername(name))[1] = 'student' and (storage.foldername(name))[2] = auth.uid()::text)
    or exists (
      select 1 from public.submissions s
      where s.id::text = (storage.foldername(name))[3]
      and public.teaches_class(s.class_id)
    )
  )
);
