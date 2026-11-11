import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return fail("O cadastro de alunos ainda não foi configurado no servidor.", 503);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return fail("Sessão não encontrada. Entre novamente.", 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return fail("Sessão inválida. Entre novamente.", 401);

  const { data: teacher, error: teacherError } = await admin
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (teacherError || teacher?.role !== "teacher") {
    return fail("Somente o professor pode cadastrar alunos.", 403);
  }

  let body: { username?: string; displayName?: string; password?: string; classId?: string };
  try { body = await request.json(); } catch { return fail("Dados inválidos.", 400); }

  const username = (body.username || "").trim();
  const displayName = (body.displayName || "").trim();
  const password = body.password || "";
  const classId = body.classId || "";

  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    return fail("O usuário deve ter de 3 a 32 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.", 400);
  }
  if (username.toLowerCase() === "roboeduc") return fail("Esse nome de usuário é reservado.", 400);
  if (displayName.length < 2 || displayName.length > 80) return fail("Informe o nome do aluno.", 400);
  if (password.length < 8 || password.length > 72) return fail("A senha inicial deve ter entre 8 e 72 caracteres.", 400);
  if (!classId) return fail("Selecione uma turma.", 400);

  const { data: classRow, error: classError } = await admin
    .from("classes").select("id").eq("id", classId)
    .eq("teacher_id", authData.user.id).maybeSingle();
  if (classError || !classRow) return fail("Turma não encontrada ou sem permissão.", 404);

  const email = username.toLowerCase() + "@students.roboeduc.local";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (createError || !created.user) {
    const message = createError?.message || "Não foi possível criar a conta.";
    return fail(
      message.toLowerCase().includes("already") || message.toLowerCase().includes("duplicate")
        ? "Esse nome de usuário já está em uso."
        : message, 400,
    );
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id, username, display_name: displayName, role: "student",
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail("A conta foi criada, mas não foi possível configurar o perfil.", 500);
  }

  const { error: membershipError } = await admin.from("class_members").insert({
    class_id: classId, student_id: created.user.id,
  });
  if (membershipError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail("A conta não foi vinculada à turma. Tente novamente.", 500);
  }

  return NextResponse.json({
    student: { id: created.user.id, username, display_name: displayName },
  }, { status: 201 });
}
