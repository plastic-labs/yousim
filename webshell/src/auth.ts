import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL or Key is missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const auth = supabase.auth;

export default auth;

export async function getJWT() {
  const { data: sessionData, error: sessionError } = await auth.getSession();
  if (sessionError) {
    console.log(sessionError);
    alert("possible error try refreshing the page");
    return;
  }

  let jwt = sessionData.session?.access_token;

  if (!jwt) {
    const { data: userData, error } = await auth.signInAnonymously();

    if (error) {
      console.log(error);
      alert("possible error try refreshing the page");
      return;
    }

    jwt = userData.session?.access_token;

    if (!jwt) {
      alert("Something went wrong");
      return;
    }
  }

  return jwt;
}

export async function isAnon(): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await auth.getUser();

  if (error) {
    console.error("Error fetching user:", error.message);
    return true; // Consider anonymous if there's an error
  }

  if (!user) {
    return true; // Anonymous if no user
  }

  return !user.email; // Anonymous if no email, otherwise authenticated
}
