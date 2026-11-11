"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, Check, ChevronDown, CircleAlert, Copy, Download,
  FileArchive, FolderOpen, Gamepad2, GraduationCap, LayoutDashboard,
  LoaderCircle, LogOut, Plus, RefreshCw, Search, ShieldCheck, Trash2,
  Upload, Users, X,
} from "lucide-react";
import { getSupabase, usernameToEmail } from "@/lib/supabase";

type Role = "teacher" | "student";
type Tab = "overview" | "classes" | "projects" | "students" | "submissions";
type Profile = { id: string; username: string; display_name: string; role: Role };
type SchoolClass = { id: string; name: string; access_code: string; description: string | null; created_at: string };
type Project = { id: string; code: string; title: string; description: string; difficulty: string; file_path: string | null; created_at: string };
type Student = { id: string; username: string; display_name: string };
type Assignment = { project_id: string; class_id: string };
type Membership = { student_id: string; class_id: string };
type Submission = {
  id: string; project_id: string; class_id: string; student_id: string; file_path: string;
  original_filename: string; status: "submitted" | "reviewing" | "approved" | "needs_changes"; submitted_at: string;
};

const statusNames: Record<Submission["status"], string> = {
  submitted: "Enviada", reviewing: "Em análise", approved: "Aprovada", needs_changes: "Precisa de ajustes",
};

function cleanFilename(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90) || "arquivo.zip";
}
function createAccessCode() {
  return "RBX-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function Home() {
  const db = useMemo(() => getSupabase(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"class" | "project" | "student" | "submission" | null>(null);
  const [className, setClassName] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectDifficulty, setProjectDifficulty] = useState("Iniciante");
  const [projectClass, setProjectClass] = useState("");
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [studentName, setStudentName] = useState("");
  const [studentUsername, setStudentUsername] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [submissionProject, setSubmissionProject] = useState("");
  const [submissionClass, setSubmissionClass] = useState("");
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    if (!db) return;
    const { data, error } = await db.from("profiles")
      .select("id,username,display_name,role").eq("id", userId).maybeSingle();
    if (error || !data) {
      await db.auth.signOut();
      setProfile(null);
      notify("Não foi possível carregar o perfil. Verifique se a conta foi configurada.");
      return;
    }
    setProfile(data as Profile);
  }, [db, notify]);

  useEffect(() => {
    if (!db) {
      setCheckingAuth(false);
      return;
    }
    let active = true;
    db.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) await loadProfile(data.session.user.id);
      if (active) setCheckingAuth(false);
    });
    const { data: listener } = db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        setProfile(null);
        setClasses([]);
        setProjects([]);
        setStudents([]);
        setAssignments([]);
        setSubmissions([]);
        setMemberships([]);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [db, loadProfile]);

  const refresh = useCallback(async (current: Profile | null = profile) => {
    if (!db || !current) return;
    setLoading(true);
    try {
      if (current.role === "teacher") {
        const { data: classRows, error: classError } = await db.from("classes")
          .select("id,name,access_code,description,created_at")
          .eq("teacher_id", current.id).order("created_at", { ascending: false });
        if (classError) throw classError;
        const classList = (classRows || []) as SchoolClass[];
        const classIds = classList.map(row => row.id);

        const [projectResult, memberResult, assignmentResult, submissionResult] = await Promise.all([
          db.from("projects").select("id,code,title,description,difficulty,file_path,created_at")
            .eq("created_by", current.id).order("created_at", { ascending: false }),
          classIds.length ? db.from("class_members").select("student_id,class_id").in("class_id", classIds) : Promise.resolve({ data: [], error: null }),
          classIds.length ? db.from("project_assignments").select("project_id,class_id").in("class_id", classIds) : Promise.resolve({ data: [], error: null }),
          classIds.length ? db.from("submissions").select("*").in("class_id", classIds).order("submitted_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
        ]);
        if (projectResult.error) throw projectResult.error;
        if (memberResult.error) throw memberResult.error;
        if (assignmentResult.error) throw assignmentResult.error;
        if (submissionResult.error) throw submissionResult.error;

        const memberIds = [...new Set((memberResult.data || []).map((row: any) => row.student_id))];
        const { data: studentRows, error: studentError } = memberIds.length
          ? await db.from("profiles").select("id,username,display_name").in("id", memberIds).eq("role", "student")
          : { data: [], error: null };
        if (studentError) throw studentError;

        setClasses(classList);
        setProjects((projectResult.data || []) as Project[]);
        setStudents((studentRows || []) as Student[]);
        setAssignments((assignmentResult.data || []) as Assignment[]);
        setMemberships((memberResult.data || []) as Membership[]);
        setSubmissions((submissionResult.data || []) as Submission[]);
      } else {
        const { data: memberRows, error: memberError } = await db.from("class_members")
          .select("class_id").eq("student_id", current.id);
        if (memberError) throw memberError;
        const classIds = (memberRows || []).map((row: any) => row.class_id);
        const [classResult, assignmentResult, submissionResult] = await Promise.all([
          classIds.length ? db.from("classes").select("id,name,access_code,description,created_at").in("id", classIds) : Promise.resolve({ data: [], error: null }),
          classIds.length ? db.from("project_assignments").select("project_id,class_id").in("class_id", classIds) : Promise.resolve({ data: [], error: null }),
          db.from("submissions").select("*").eq("student_id", current.id).order("submitted_at", { ascending: false }),
        ]);
        if (classResult.error) throw classResult.error;
        if (assignmentResult.error) throw assignmentResult.error;
        if (submissionResult.error) throw submissionResult.error;
        const assignmentRows = (assignmentResult.data || []) as Assignment[];
        const projectIds = [...new Set(assignmentRows.map(row => row.project_id))];
        const { data: projectRows, error: projectError } = projectIds.length
          ? await db.from("projects").select("id,code,title,description,difficulty,file_path,created_at").in("id", projectIds)
          : { data: [], error: null };
        if (projectError) throw projectError;
        setClasses((classResult.data || []) as SchoolClass[]);
        setAssignments(assignmentRows);
        setMemberships((memberRows || []) as Membership[]);
        setProjects((projectRows || []) as Project[]);
        setSubmissions((submissionResult.data || []) as Submission[]);
        setStudents([]);
      }
    } catch (error: any) {
      notify(error?.message || "Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
    }
  }, [db, notify, profile]);

  useEffect(() => {
    if (profile) void refresh(profile);
  }, [profile, refresh]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    const name = username.trim();
    if (!name || !password) return notify("Informe usuário e senha.");
    setBusy("login");
    const { data, error } = await db.auth.signInWithPassword({
      email: usernameToEmail(name),
      password,
    });
    if (error || !data.user) {
      setBusy("");
      return notify("Usuário ou senha incorretos.");
    }
    const { data: profileData, error: profileError } = await db.from("profiles")
      .select("id,username,display_name,role").eq("id", data.user.id).maybeSingle();
    setBusy("");
    setPassword("");
    if (profileError || !profileData) {
      await db.auth.signOut();
      return notify("A conta ainda não possui um perfil RoboEduc.");
    }
    setProfile(profileData as Profile);
    setTab("overview");
  }

  async function signOut() {
    if (!db) return;
    await db.auth.signOut();
    setProfile(null);
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !profile || !className.trim()) return;
    setBusy("class");
    const { error } = await db.from("classes").insert({
      teacher_id: profile.id,
      name: className.trim(),
      description: classDescription.trim() || null,
      access_code: createAccessCode(),
    });
    setBusy("");
    if (error) return notify("Não foi possível criar a turma: " + error.message);
    setClassName("");
    setClassDescription("");
    setModal(null);
    notify("Turma criada.");
    await refresh(profile);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !profile || !projectTitle.trim() || !projectFile) return;
    if (!projectFile.name.toLowerCase().endsWith(".zip")) return notify("Envie um arquivo .zip.");
    setBusy("project");
    const id = crypto.randomUUID();
    const code = "GM-" + crypto.randomUUID().slice(0, 5).toUpperCase();
    const path = "teacher/" + profile.id + "/" + id + "/" + cleanFilename(projectFile.name);
    const { error: uploadError } = await db.storage.from("project-files").upload(path, projectFile, {
      cacheControl: "3600", upsert: false, contentType: "application/zip",
    });
    if (uploadError) {
      setBusy("");
      return notify("Falha ao enviar o arquivo: " + uploadError.message);
    }
    const { error: projectError } = await db.from("projects").insert({
      id, created_by: profile.id, code, title: projectTitle.trim(),
      description: projectDescription.trim(), difficulty: projectDifficulty,
      file_path: path, is_published: Boolean(projectClass),
    });
    if (projectError) {
      await db.storage.from("project-files").remove([path]);
      setBusy("");
      return notify("Falha ao cadastrar o projeto: " + projectError.message);
    }
    if (projectClass) {
      const { error: assignmentError } = await db.from("project_assignments").insert({
        project_id: id, class_id: projectClass, assigned_by: profile.id,
      });
      if (assignmentError) notify("Projeto salvo, mas não foi possível atribuí-lo: " + assignmentError.message);
    }
    setBusy("");
    setProjectTitle("");
    setProjectDescription("");
    setProjectDifficulty("Iniciante");
    setProjectClass("");
    setProjectFile(null);
    setModal(null);
    notify("Projeto adicionado à biblioteca.");
    await refresh(profile);
  }

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !profile) return;
    const { data: sessionData } = await db.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return notify("Sessão expirada. Entre novamente.");
    setBusy("student");
    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        username: studentUsername.trim(),
        displayName: studentName.trim(),
        password: studentPassword,
        classId: studentClass,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) return notify(result.error || "Não foi possível cadastrar o aluno.");
    setStudentName("");
    setStudentUsername("");
    setStudentPassword("");
    setStudentClass("");
    setModal(null);
    notify("Conta de aluno criada e vinculada à turma.");
    await refresh(profile);
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !profile || !submissionFile || !submissionProject || !submissionClass) return;
    if (!submissionFile.name.toLowerCase().endsWith(".zip")) return notify("Envie um arquivo .zip.");
    const isAssigned = assignments.some(a => a.project_id === submissionProject && a.class_id === submissionClass);
    if (!isAssigned) return notify("Esse projeto não está atribuído à turma selecionada.");
    setBusy("submission");
    const id = crypto.randomUUID();
    const path = "student/" + profile.id + "/" + id + "/" + cleanFilename(submissionFile.name);
    const { error: uploadError } = await db.storage.from("student-submissions").upload(path, submissionFile, {
      cacheControl: "3600", upsert: false, contentType: "application/zip",
    });
    if (uploadError) {
      setBusy("");
      return notify("Falha ao enviar o arquivo: " + uploadError.message);
    }
    const { error } = await db.from("submissions").insert({
      id, student_id: profile.id, project_id: submissionProject, class_id: submissionClass,
      file_path: path, original_filename: submissionFile.name, status: "submitted",
    });
    if (error) {
      await db.storage.from("student-submissions").remove([path]);
      setBusy("");
      return notify("Falha ao registrar a entrega: " + error.message);
    }
    setBusy("");
    setSubmissionFile(null);
    setSubmissionProject("");
    setSubmissionClass("");
    setModal(null);
    notify("Projeto enviado para avaliação.");
    await refresh(profile);
  }

  async function downloadFile(bucket: "project-files" | "student-submissions", path: string) {
    if (!db || !path) return;
    setBusy("download");
    const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60);
    setBusy("");
    if (error || !data?.signedUrl) return notify("Não foi possível gerar o link do arquivo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function updateSubmission(id: string, status: Submission["status"]) {
    if (!db || profile?.role !== "teacher") return;
    setBusy("review:" + id);
    const { error } = await db.from("submissions").update({ status }).eq("id", id);
    setBusy("");
    if (error) return notify("Não foi possível atualizar a avaliação: " + error.message);
    notify("Avaliação atualizada.");
    await refresh(profile);
  }

  async function deleteClass(item: SchoolClass) {
    if (!db || !profile) return;
    if (!window.confirm("Excluir a turma \"" + item.name + "\"? Os vínculos com alunos e projetos também serão removidos.")) return;
    setBusy("delete:" + item.id);
    const { error } = await db.from("classes").delete().eq("id", item.id);
    setBusy("");
    if (error) return notify("Não foi possível excluir a turma: " + error.message);
    notify("Turma excluída.");
    await refresh(profile);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      notify("Código copiado.");
    } catch {
      notify("Não foi possível copiar automaticamente: " + code);
    }
  }

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter(project => !term || [project.title, project.code, project.description].join(" ").toLowerCase().includes(term));
  }, [projects, search]);

  if (checkingAuth) return <main className="auth-loading"><LoaderCircle className="spin" size={24}/> Carregando sessão...</main>;

  if (!profile) return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand"><span className="brand-icon"><Gamepad2 size={23}/></span><div><b>RoboEduc</b><small>Game Lab</small></div></div>
        <div className="login-copy">
          <span className="kicker">PLATAFORMA DE PROJETOS</span>
          <h1>Aprender criando.</h1>
          <p>Entre para acessar suas turmas, projetos e entregas.</p>
        </div>
        {!db ? (
          <div className="setup-warning"><CircleAlert size={20}/><div><b>Banco de dados ainda não configurado</b><p>O endereço e a chave pública do Supabase precisam ser adicionados às variáveis de ambiente da publicação.</p></div></div>
        ) : (
          <form className="form-stack" onSubmit={signIn}>
            <label htmlFor="username">Usuário</label>
            <input id="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Digite seu usuário" />
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Digite sua senha" />
            <button className="button primary wide" disabled={busy === "login"}>{busy === "login" ? <LoaderCircle className="spin" size={17}/> : null} Entrar</button>
          </form>
        )}
        <div className="login-foot"><ShieldCheck size={16}/> Contas de alunos são criadas pelo professor.</div>
      </section>
      <footer className="login-footer">RoboEduc Game Lab · Ambiente de aprendizagem</footer>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );

  const nav = [
    { id: "overview" as Tab, label: "Início", icon: LayoutDashboard },
    { id: "classes" as Tab, label: "Turmas", icon: Users },
    { id: "projects" as Tab, label: "Projetos", icon: FolderOpen },
    ...(profile.role === "teacher" ? [{ id: "students" as Tab, label: "Alunos", icon: GraduationCap }] : []),
    { id: "submissions" as Tab, label: "Entregas", icon: Upload },
  ];
  const assignedProjects = projects.filter(project =>
    assignments.some(assignment => assignment.project_id === project.id)
  );
  const pending = submissions.filter(row => row.status === "submitted" || row.status === "reviewing").length;
  const title = nav.find(item => item.id === tab)?.label || "Início";

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon"><Gamepad2 size={22}/></span><div><b>RoboEduc</b><small>Game Lab</small></div></div>
        <div className="account">
          <span className="avatar">{profile.display_name.slice(0, 1).toUpperCase()}</span>
          <div><b>{profile.display_name}</b><small>{profile.role === "teacher" ? "Professor" : "Aluno"}</small></div>
        </div>
        <nav className="navigation">
          <span className="nav-caption">MENU</span>
          {nav.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={tab === item.id ? "nav-item active" : "nav-item"} onClick={() => setTab(item.id)}>
              <Icon size={18}/><span>{item.label}</span>
              {item.id === "submissions" && profile.role === "teacher" && pending > 0 ? <i>{pending}</i> : null}
            </button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><ShieldCheck size={16}/><span>Acesso individual por conta.</span></div>
          <button className="nav-item logout" onClick={signOut}><LogOut size={18}/> Sair</button>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div><span>RoboEduc Game Lab</span><b>/ {title}</b></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Atualizar dados" onClick={() => refresh()} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""}/></button>
            <span className="top-name">{profile.display_name}</span>
          </div>
        </header>

        <div className="content">
          {tab === "overview" && (
            <>
              <div className="page-heading">
                <div><span className="kicker">{profile.role === "teacher" ? "ÁREA DO PROFESSOR" : "ÁREA DO ALUNO"}</span><h1>{profile.role === "teacher" ? "Visão geral" : "Meus projetos"}</h1><p>{profile.role === "teacher" ? "Gerencie turmas, publique atividades e acompanhe as entregas." : "Acesse as atividades da sua turma e envie seus trabalhos."}</p></div>
                {profile.role === "teacher" ? <button className="button primary" onClick={() => setModal("class")}><Plus size={17}/> Nova turma</button> : <button className="button primary" onClick={() => setTab("projects")}><BookOpen size={17}/> Ver projetos</button>}
              </div>
              <div className="metrics">
                <Metric label="Turmas" value={classes.length}/>
                <Metric label="Projetos" value={profile.role === "teacher" ? projects.length : assignedProjects.length}/>
                <Metric label={profile.role === "teacher" ? "Alunos" : "Entregas"} value={profile.role === "teacher" ? students.length : submissions.length}/>
                <Metric label={profile.role === "teacher" ? "Entregas pendentes" : "Em avaliação"} value={profile.role === "teacher" ? pending : submissions.filter(row => row.status === "reviewing").length}/>
              </div>
              <div className="overview-grid">
                <section className="section-card">
                  <div className="section-title"><div><h2>{profile.role === "teacher" ? "Suas turmas" : "Projetos atribuídos"}</h2><p>{profile.role === "teacher" ? "Turmas que você criou." : "Atividades disponíveis para sua conta."}</p></div><button className="text-action" onClick={() => setTab(profile.role === "teacher" ? "classes" : "projects")}>Ver todos <ArrowRight size={15}/></button></div>
                  {profile.role === "teacher"
                    ? classes.length ? <div className="simple-list">{classes.slice(0, 4).map(item => <div className="list-row" key={item.id}><span className="list-icon"><Users size={17}/></span><div className="list-main"><b>{item.name}</b><small>Código {item.access_code} · {memberships.filter(m => m.class_id === item.id).length} aluno(s)</small></div><button className="icon-button" title="Copiar código" onClick={() => copyCode(item.access_code)}><Copy size={15}/></button></div>)}</div>
                      : <EmptyState text="Você ainda não criou nenhuma turma." action="Criar primeira turma" onClick={() => setModal("class")}/>
                    : projects.length ? <div className="simple-list">{assignedProjects.slice(0,4).map(item => <div className="list-row" key={item.id}><span className="list-icon"><Gamepad2 size={17}/></span><div className="list-main"><b>{item.title}</b><small>{item.code} · {item.difficulty}</small></div><button className="icon-button" title="Abrir projetos" onClick={() => setTab("projects")}><ArrowRight size={15}/></button></div>)}</div>
                      : <EmptyState text="Sua turma ainda não recebeu projetos." action="Atualizar" onClick={() => refresh()}/>}
                </section>
                <section className="section-card">
                  <div className="section-title"><div><h2>{profile.role === "teacher" ? "Últimas entregas" : "Meu histórico"}</h2><p>Arquivos enviados para avaliação.</p></div><button className="text-action" onClick={() => setTab("submissions")}>Ver todos <ArrowRight size={15}/></button></div>
                  {submissions.length ? <div className="simple-list">{submissions.slice(0, 4).map(item => <div className="list-row" key={item.id}><span className="list-icon"><FileArchive size={17}/></span><div className="list-main"><b>{item.original_filename}</b><small>{statusNames[item.status]} · {dateLabel(item.submitted_at)}</small></div><Status status={item.status}/></div>)}</div>
                    : <EmptyState text="Ainda não há entregas registradas."/>}
                </section>
              </div>
            </>
          )}

          {tab === "classes" && (
            <>
              <div className="page-heading"><div><span className="kicker">ORGANIZAÇÃO</span><h1>Turmas</h1><p>{profile.role === "teacher" ? "Crie suas turmas e compartilhe o código com os alunos." : "Turmas às quais sua conta está vinculada."}</p></div>{profile.role === "teacher" ? <button className="button primary" onClick={() => setModal("class")}><Plus size={17}/> Nova turma</button> : null}</div>
              {classes.length ? <div className="card-grid">{classes.map(item => <article className="data-card" key={item.id}>
                <div className="data-card-head"><span className="list-icon"><Users size={18}/></span>{profile.role === "teacher" ? <button className="icon-button danger" title="Excluir turma" onClick={() => deleteClass(item)} disabled={busy === "delete:" + item.id}><Trash2 size={16}/></button> : null}</div>
                <h3>{item.name}</h3><p>{item.description || "Sem descrição."}</p>
                <div className="access-code"><div><small>CÓDIGO DA TURMA</small><b>{item.access_code}</b></div><button className="button secondary small" onClick={() => copyCode(item.access_code)}><Copy size={14}/> Copiar</button></div>
              </article>)}</div> : <EmptyState text={profile.role === "teacher" ? "Nenhuma turma criada até agora." : "Sua conta ainda não foi vinculada a uma turma."} action={profile.role === "teacher" ? "Criar turma" : undefined} onClick={() => setModal("class")}/>}
            </>
          )}

          {tab === "projects" && (
            <>
              <div className="page-heading"><div><span className="kicker">BIBLIOTECA</span><h1>Projetos</h1><p>{profile.role === "teacher" ? "Adicione arquivos .zip e atribua atividades às turmas." : "Baixe o arquivo inicial e envie seu projeto concluído."}</p></div>{profile.role === "teacher" ? <button className="button primary" onClick={() => setModal("project")}><Plus size={17}/> Novo projeto</button> : null}</div>
              <div className="search-field"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar projetos..."/></div>
              {filteredProjects.length ? <div className="card-grid">{filteredProjects.map(item => {
                const assigned = assignments.filter(a => a.project_id === item.id).length;
                return <article className="data-card project-card" key={item.id}>
                  <div className="data-card-head"><span className="list-icon"><Gamepad2 size={18}/></span><span className="difficulty">{item.difficulty}</span></div>
                  <h3>{item.title}</h3><p>{item.description || "Sem descrição."}</p>
                  <div className="project-foot"><span>{profile.role === "teacher" ? assigned + " turma(s)" : "Atividade da turma"}</span><span>{item.code}</span></div>
                  {item.file_path ? <button className="button secondary full" onClick={() => downloadFile("project-files", item.file_path!)} disabled={busy === "download"}><Download size={15}/> Baixar projeto</button> : <span className="muted-note">Arquivo indisponível</span>}
                  {profile.role === "student" ? <button className="button primary full" onClick={() => { setSubmissionProject(item.id); setSubmissionClass(assignments.find(a => a.project_id === item.id)?.class_id || ""); setModal("submission"); }}>Enviar meu trabalho</button> : null}
                </article>;
              })}</div> : <EmptyState text={profile.role === "teacher" ? "Sua biblioteca está vazia. Adicione o primeiro projeto." : "Nenhum projeto foi atribuído às suas turmas."} action={profile.role === "teacher" ? "Adicionar projeto" : undefined} onClick={() => setModal("project")}/>}
            </>
          )}

          {tab === "students" && profile.role === "teacher" && (
            <>
              <div className="page-heading"><div><span className="kicker">CONTAS E ACESSO</span><h1>Alunos</h1><p>Cadastre usuários e vincule cada conta a uma turma.</p></div><button className="button primary" onClick={() => setModal("student")} disabled={!classes.length}><Plus size={17}/> Cadastrar aluno</button></div>
              {students.length ? <div className="table-card"><div className="table-heading"><b>{students.length} aluno(s)</b><span>Contas reais cadastradas</span></div><div className="table-scroll"><table><thead><tr><th>ALUNO</th><th>USUÁRIO</th><th>TURMA(S)</th></tr></thead><tbody>{students.map(student => <tr key={student.id}><td><div className="person"><span className="avatar">{student.display_name.slice(0,1).toUpperCase()}</span><b>{student.display_name}</b></div></td><td>{student.username}</td><td>{classes.filter(c => memberships.some(m => m.class_id === c.id && m.student_id === student.id)).map(c => c.name).join(", ") || "—"}</td></tr>)}</tbody></table></div></div> : <EmptyState text={classes.length ? "Ainda não há alunos cadastrados nas suas turmas." : "Crie uma turma antes de cadastrar alunos."} action={classes.length ? "Cadastrar primeiro aluno" : "Criar turma"} onClick={() => setModal(classes.length ? "student" : "class")}/>}
            </>
          )}

          {tab === "submissions" && (
            <>
              <div className="page-heading"><div><span className="kicker">ACOMPANHAMENTO</span><h1>Entregas</h1><p>{profile.role === "teacher" ? "Revise os arquivos enviados pelos alunos." : "Envie seus arquivos e acompanhe a avaliação."}</p></div>{profile.role === "student" ? <button className="button primary" onClick={() => setModal("submission")} disabled={!assignedProjects.length}><Upload size={17}/> Enviar projeto</button> : null}</div>
              {submissions.length ? <div className="table-card"><div className="table-scroll"><table><thead><tr><th>{profile.role === "teacher" ? "ALUNO" : "ARQUIVO"}</th><th>PROJETO</th><th>DATA</th><th>STATUS</th><th>ARQUIVO</th></tr></thead><tbody>{submissions.map(item => {
                const project = projects.find(row => row.id === item.project_id);
                const student = students.find(row => row.id === item.student_id);
                return <tr key={item.id}>
                  <td>{profile.role === "teacher" ? student?.display_name || "Aluno" : item.original_filename}</td>
                  <td>{project?.title || "Projeto"}</td><td>{dateLabel(item.submitted_at)}</td>
                  <td>{profile.role === "teacher" ? <select className="status-select" value={item.status} onChange={e => updateSubmission(item.id, e.target.value as Submission["status"])} disabled={busy === "review:" + item.id}>{Object.entries(statusNames).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select> : <Status status={item.status}/>}</td>
                  <td><button className="text-action" onClick={() => downloadFile("student-submissions", item.file_path)}><Download size={15}/> Baixar</button></td>
                </tr>;
              })}</tbody></table></div></div> : <EmptyState text={profile.role === "teacher" ? "Nenhum aluno enviou um projeto ainda." : "Você ainda não enviou nenhum projeto."} action={profile.role === "student" && assignedProjects.length ? "Enviar primeiro projeto" : undefined} onClick={() => setModal("submission")}/>}
            </>
          )}
          <footer className="page-footer">RoboEduc Game Lab <span>·</span> {loading ? "Atualizando dados..." : "Dados sincronizados com a plataforma"}</footer>
        </div>
      </section>

      {modal === "class" && profile.role === "teacher" && <Modal title="Nova turma" subtitle="Defina o nome e, opcionalmente, uma descrição." onClose={() => setModal(null)}>
        <form className="form-stack" onSubmit={createClass}><label>Nome da turma</label><input autoFocus required maxLength={80} value={className} onChange={e => setClassName(e.target.value)} placeholder="Ex.: GameMaker - F2" /><label>Descrição (opcional)</label><textarea value={classDescription} onChange={e => setClassDescription(e.target.value)} placeholder="Informações sobre a turma"/><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary" disabled={busy === "class"}>{busy === "class" ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} Criar turma</button></div></form>
      </Modal>}

      {modal === "project" && profile.role === "teacher" && <Modal title="Adicionar projeto" subtitle="O projeto será armazenado de forma privada e atribuído à turma selecionada." onClose={() => setModal(null)}>
        <form className="form-stack" onSubmit={createProject}><label>Nome do projeto</label><input required maxLength={100} value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="Ex.: Jogo de plataforma"/><label>Descrição</label><textarea required maxLength={600} value={projectDescription} onChange={e => setProjectDescription(e.target.value)} placeholder="Explique a atividade e o que será desenvolvido."/><label>Nível</label><select value={projectDifficulty} onChange={e => setProjectDifficulty(e.target.value)}><option>Iniciante</option><option>Intermediário</option><option>Avançado</option></select><label>Disponibilizar para</label><select value={projectClass} onChange={e => setProjectClass(e.target.value)}><option value="">Salvar na biblioteca sem atribuir</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label>Arquivo do GameMaker (.zip)</label><input type="file" accept=".zip,application/zip" required onChange={e => setProjectFile(e.target.files?.[0] || null)}/><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary" disabled={busy === "project" || !projectFile}>{busy === "project" ? <LoaderCircle className="spin" size={16}/> : <Upload size={16}/>} Salvar projeto</button></div></form>
      </Modal>}

      {modal === "student" && profile.role === "teacher" && <Modal title="Cadastrar aluno" subtitle="Crie uma conta e vincule o aluno a uma turma. A senha inicial deve ser entregue ao aluno." onClose={() => setModal(null)}>
        <form className="form-stack" onSubmit={createStudent}><label>Nome do aluno</label><input required maxLength={80} value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Nome completo"/><label>Nome de usuário</label><input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" value={studentUsername} onChange={e => setStudentUsername(e.target.value)} placeholder="Ex.: aluno01"/><label>Senha inicial</label><input required minLength={8} maxLength={72} type="password" value={studentPassword} onChange={e => setStudentPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/><label>Turma</label><select required value={studentClass} onChange={e => setStudentClass(e.target.value)}><option value="">Selecione uma turma</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary" disabled={busy === "student" || !classes.length}>{busy === "student" ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} Criar conta</button></div></form>
      </Modal>}

      {modal === "submission" && profile.role === "student" && <Modal title="Enviar projeto" subtitle="Envie o arquivo .zip do seu trabalho para avaliação." onClose={() => setModal(null)}>
        <form className="form-stack" onSubmit={submitProject}><label>Projeto</label><select required value={submissionProject} onChange={e => { setSubmissionProject(e.target.value); setSubmissionClass(assignments.find(a => a.project_id === e.target.value)?.class_id || ""); }}><option value="">Selecione um projeto</option>{assignedProjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><label>Turma</label><select required value={submissionClass} onChange={e => setSubmissionClass(e.target.value)}><option value="">Selecione a turma</option>{assignments.filter(a => a.project_id === submissionProject).map(assignment => <option key={assignment.class_id} value={assignment.class_id}>{classes.find(c => c.id === assignment.class_id)?.name || "Turma"}</option>)}</select><label>Arquivo (.zip)</label><input required type="file" accept=".zip,application/zip" onChange={e => setSubmissionFile(e.target.files?.[0] || null)}/><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button primary" disabled={busy === "submission" || !submissionFile || !submissionProject || !submissionClass}>{busy === "submission" ? <LoaderCircle className="spin" size={16}/> : <Upload size={16}/>} Enviar para avaliação</button></div></form>
      </Modal>}

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function Metric({label,value}:{label:string;value:number}) {
  return <div className="metric"><span>{label}</span><b>{value}</b></div>;
}
function EmptyState({text,action,onClick}:{text:string;action?:string;onClick?:()=>void}) {
  return <div className="empty-state"><span><FolderOpen size={21}/></span><p>{text}</p>{action && onClick ? <button className="button secondary small" onClick={onClick}>{action}</button> : null}</div>;
}
function Status({status}:{status:Submission["status"]}) {
  return <span className={"status status-" + status}>{statusNames[status]}</span>;
}
function Modal({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode}) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="modal-close" aria-label="Fechar" onClick={onClose}><X size={18}/></button><h2 id="dialog-title">{title}</h2><p>{subtitle}</p>{children}</section></div>;
}
