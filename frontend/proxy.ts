// frontend/proxy.ts
// 保护 /chat/* 路由，自动刷新过期 token

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the session token if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isChatRoute = request.nextUrl.pathname.startsWith("/chat");
  if (isChatRoute && !user) {
    // 用 new URL 构造干净的 /login URL，避免携带原始请求的 query params
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // 匹配除静态资源和 API 代理之外的所有路径
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
