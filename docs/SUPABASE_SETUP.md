# RoboEduc Game Lab — configuração do ambiente

## Banco de dados e armazenamento

O projeto Supabase já foi criado na região South America (São Paulo), com as tabelas, políticas RLS e buckets privados aplicados.

## Criar a conta inicial do professor

Esta é a única etapa que precisa ser feita no painel do Supabase, porque a criação de uma credencial administrativa exige que o responsável defina a senha.

1. Abra o projeto `roboeduc-game-lab` no Supabase.
2. Entre em **Authentication → Users → Add user**.
3. Use o e-mail interno `roboeduc@roboeduc.local`.
4. Defina a senha que será usada para o login `ROBOEDUC` e marque a conta como confirmada.
5. No **SQL Editor**, execute:

```sql
update public.profiles
set username = 'ROBOEDUC',
    display_name = 'Administrador RoboEduc',
    role = 'teacher'
where id = (
  select id
  from auth.users
  where lower(email) = 'roboeduc@roboeduc.local'
);
```

O trigger cria todas as contas novas como aluno. A função de professor só pode ser atribuída por uma operação administrativa no banco. Não há cadastro público de professores.

## Variáveis da Vercel

As variáveis públicas já foram cadastradas em Production, Preview e Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publicável `sb_publishable_...`)

Não coloque uma chave `service_role` ou `sb_secret` na Vercel nem no navegador. A criação de contas de alunos é feita pela Edge Function protegida do Supabase, que usa o segredo interno do próprio ambiente.

## Cadastro de alunos

Depois de entrar como `ROBOEDUC`, abra **Alunos → Cadastrar aluno**. O professor define nome, usuário, senha inicial e turma. O servidor valida a sessão, verifica que a conta é professor, cria a conta como aluno e associa o aluno à turma selecionada.

Os alunos entram com o nome de usuário e a senha fornecidos pelo professor.

## Arquivos

- Projetos: bucket privado `project-files`.
- Entregas: bucket privado `student-submissions`.

As políticas de Storage e RLS restringem os arquivos às contas autorizadas e às turmas correspondentes.
