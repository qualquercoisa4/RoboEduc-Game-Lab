# Supabase setup

1. Create a Supabase project for RoboEduc Game Lab.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Add the project URL and anon/publishable key to local environment variables.
4. Keep the service-role key exclusively in server-side environment variables. Never expose it to the browser or commit it to Git.
5. Provision the first teacher account through a trusted server-side admin workflow. Do not let public signup choose the `teacher` role.
6. Create student accounts through the teacher's admin workflow. The student-facing login should map a username to an internal auth identity on the server; do not store plaintext passwords in application tables.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the project's publishable key)
- `SUPABASE_SERVICE_ROLE_KEY` (server only; required for teacher-managed account provisioning)

## File storage conventions

- Project source archives: `project-files/teacher/{teacher-user-id}/{project-id}/{filename}.zip`
- Student submissions: `student-submissions/student/{student-user-id}/{submission-id}/{filename}.zip`

Buckets are private. The application should generate short-lived signed download URLs after checking the relevant project assignment or class ownership.

## Important

The current web interface is a front-end prototype with in-memory demonstration data. Authentication, database reads/writes, uploads, signed downloads, and real account provisioning are not active until the Supabase project and environment variables are configured and the server-side actions are implemented.