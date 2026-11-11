# RoboEduc Game Lab — configuração do ambiente

## 1. Banco de dados

1. Crie um projeto Supabase na região **South America (São Paulo)**.
2. Execute todo o conteúdo de `supabase/schema.sql` no SQL Editor.
3. Em Project Settings → API, copie a Project URL, a chave publicável e a chave `service_role`.

## 2. Conta inicial do professor

A primeira conta é criada diretamente no painel do Supabase.

1. Abra Authentication → Users → Add user.
2. Crie o usuário com o e-mail `roboeduc@roboeduc.local` e defina a senha administrativa diretamente no painel.
3. Confirme a conta.
4. No SQL Editor, execute:

```sql
update public.profiles
set username = 'ROBOEDUC',
    display_name = 'Administrador RoboEduc',
    role = 'teacher'
where id = (
  select id from auth.users
  where lower(email) = 'roboeduc@roboeduc.local'
);
```

A role de professor é atribuída somente por essa operação administrativa. Ela não pode ser escolhida no navegador nem alterada pelo próprio usuário.

## 3. Variáveis da Vercel

Configure em Production, Preview e Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (pode receber a chave publicável)
- `SUPABASE_SERVICE_ROLE_KEY` (tipo **Sensitive**, somente servidor)

A chave `service_role` permite operações administrativas. Ela é usada exclusivamente pela rota server-side de criação de alunos e **nunca** deve ser enviada ao navegador, colocada em variável `NEXT_PUBLIC_` ou commitada no GitHub. Depois de salvar as variáveis, faça um novo deploy.

## 4. Contas de alunos

Não existe cadastro público. O professor entra na seção Alunos, escolhe Cadastrar aluno, define nome, usuário, senha inicial e turma. O servidor valida a sessão e a função do professor, cria uma conta Auth com role `student` e vincula a conta à turma selecionada.

O aluno entra usando o nome de usuário e a senha entregues pelo professor. O usuário `ROBOEDUC` é reservado para a conta administrativa.

## 5. Arquivos privados

- Projetos: `project-files/teacher/{teacher-id}/{project-id}/{arquivo}.zip`
- Entregas: `student-submissions/student/{student-id}/{submission-id}/{arquivo}.zip`

Os buckets são privados. As políticas de Storage e RLS restringem arquivos às contas autorizadas, aos responsáveis pelas turmas e aos alunos vinculados aos projetos.
