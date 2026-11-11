import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") || "";

  if (!url || !publicKey) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Sessão não encontrada. Entre novamente." }, { status: 401 });
  }

  try {
    const upstream = await fetch(url + "/functions/v1/create-student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": publicKey,
        "Authorization": authorization,
      },
      body: await request.text(),
      cache: "no-store",
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível conectar ao serviço de cadastro." }, { status: 502 });
  }
}
