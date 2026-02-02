import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
// NOTE: /workspace is NOT protected - freemium flow handles auth internally
// This allows anonymous users to see workspace and use 1 free message
const protectedRoutes: string[] = [];

// Routes that should redirect to workspace if already authenticated
const authRoutes = ["/login", "/signup"];

export async function middleware(req: NextRequest) {
    let res = NextResponse.next({
        request: {
            headers: req.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        req.cookies.set(name, value);
                    });
                    res = NextResponse.next({
                        request: {
                            headers: req.headers,
                        },
                    });
                    cookiesToSet.forEach(({ name, value, options }) => {
                        res.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    const {
        data: { session },
    } = await supabase.auth.getSession();

    const path = req.nextUrl.pathname;

    // If user is not authenticated and trying to access protected route
    if (!session && protectedRoutes.some((route) => path.startsWith(route))) {
        const redirectUrl = new URL("/login", req.url);
        redirectUrl.searchParams.set("redirect", path);
        return NextResponse.redirect(redirectUrl);
    }

    // If user is authenticated and trying to access auth routes, redirect to workspace
    if (session && authRoutes.includes(path)) {
        return NextResponse.redirect(new URL("/workspace", req.url));
    }

    return res;
}

export const config = {
    matcher: ["/login", "/signup"],
};
