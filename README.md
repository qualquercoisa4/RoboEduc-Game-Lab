# RoboEduc Game Lab

Plataforma educacional da RoboEduc para organizar turmas, distribuir projetos editáveis do GameMaker e receber entregas dos alunos.

## Stack
- Next.js App Router
- React + TypeScript
- CSS responsivo com identidade visual RoboEduc
- Supabase Auth, Postgres e Storage (integração na próxima etapa)

## Desenvolvimento
```bash
npm install
npm run dev
```

Configure as variáveis do Supabase em `.env.local` quando a integração estiver habilitada:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Nunca coloque senhas de alunos ou credenciais administrativas no código-fonte. Contas devem ser provisionadas com autenticação segura e permissões no servidor.
