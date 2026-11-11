# RoboEduc Game Lab — configuração do ambiente

## 1. Banco de dados

1. Crie um projeto Supabase na região **South America (São Paulo)**.
2. Execute todo o conteúdo de `supabase/schema.sql` no SQL Editor.
3. Em Authentication → Providers → Email, desative **Confirm email**. O Game Lab usa nomes de usuário com e-mails internos, que não recebem mensagens.
4. Em Project Settings → API, copie a Project URL e a chave publicável.

## 2. Conta inicial do professor

A conta administrativa é criada diretamente no painel do Supabase, não pelo cadastro público.

1. Abra Authentication → Users → Add user.
2. Crie o usuário com e-mail `roboeduc@roboeduc.local` e defina ali a senha administrativa.
3. Confirme a conta.
4. No SQL Editor, execute:

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


O trigger cria todas as contas novas com a função `student`. A permissão de professor não é selecionável na tela de cadastro e não pode ser alterada pelo próprio usuário.

## 3. Publicação na Vercel

Configure as duas variáveis abaixo em Production, Preview e Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (pode receber a chave publicável do projeto)

Depois de alterar as variáveis, faça um novo deploy. A chave `service_role` não é necessária neste fluxo e nunca deve ser exposta ao navegador.

## 4. Cadastro e entrada dos alunos

O aluno cria a própria conta usando nome, usuário e senha e informa o código compartilhado pelo professor. O banco valida o código e associa a conta exclusivamente como aluno. Também é possível entrar em outra turma depois, pela seção Turmas.

O usuário `ROBOEDUC` fica reservado. O cadastro público não permite criá-lo nem escolher a função de professor.

## 5. Arquivos privados

- Projetos: `project-files/teacher/{teacher-id}/{project-id}/{arquivo}.zip`
- Entregas: `student-submissions/student/{student-id}/{submission-id}/{arquivo}.zip`

Os dois buckets são privados. As regras de Storage e RLS limitam o acesso a professores responsáveis e alunos vinculados à atividade.
