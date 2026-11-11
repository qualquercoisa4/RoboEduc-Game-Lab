# RoboEduc Game Lab — configuração do ambiente

## 1. Banco de dados

1. Crie um projeto Supabase na região South America (São Paulo).
2. Execute o conteúdo de `supabase/schema.sql` no SQL Editor.
3. Em Project Settings → API, copie a Project URL e a chave publicável para as variáveis do Vercel.
4. Copie também a chave `service_role` para uma variável de servidor chamada `SUPABASE_SERVICE_ROLE_KEY`. Nunca a publique no navegador ou no GitHub.

## 2. Conta inicial do professor

No Supabase → Authentication → Users, crie o primeiro usuário com:

- E-mail interno: `roboeduc@roboeduc.local`
- Senha: defina a senha administrativa desejada diretamente no Supabase.
- Confirme o usuário ao criá-lo.

O gatilho do banco cria o perfil como aluno por padrão. Em seguida, no SQL Editor, execute o comando abaixo para promover **somente essa conta inicial**:

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


Não existe cadastro público de professor. Os alunos são criados dentro do painel do professor, sempre com a função `student` definida pelo servidor.

## 3. Variáveis do Vercel

Configure em Production, Preview e Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (somente servidor)

Depois de adicionar ou alterar variáveis, faça um novo deploy.

## 4. Fluxo de arquivos

- Projetos: `project-files/teacher/{teacher-id}/{project-id}/{arquivo}.zip`
- Entregas: `student-submissions/student/{student-id}/{submission-id}/{arquivo}.zip`

Os buckets são privados. A interface gera links temporários somente depois da autorização pelas políticas RLS.

## 5. Acesso dos alunos

O professor cadastra nome, usuário, senha inicial e turma. O servidor cria a conta Auth, marca o e-mail interno como confirmado e associa a conta à turma. Não existe formulário de cadastro público de alunos ou professores.
