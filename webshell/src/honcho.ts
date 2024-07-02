import { v4 as uuidv4 } from "uuid";
import * as Sentry from "@sentry/browser";
const API_URL = import.meta.env.VITE_API_URL;
import { getStorage, setStorage } from "./utils";
import auth, { getJWT } from "./auth";

// export async function getUserId() {
//   const sessionResponse = await auth.getSession();
//   const { data: sessionData, error: sessionError } = sessionResponse;
//   if (sessionError) {
//     console.log(sessionError);
//     alert("possible error try refreshing the page");
//     return;
//   }

//   if (sessionData.session?.user?.id) {
//     return sessionData.session.user.id;
//   }

//   const { data: userData, error } = await auth.signInAnonymously();

//   if (error) {
//     console.log(error);
//     alert("possible error try refreshing the page");
//     return;
//   }

//   if (userData.user?.id) {
//     return userData.user.id;
//   }

//   alert("Something went wrong");
//   return;
// }

export async function newSession() {
  const jwt = await getJWT();
  try {
    const response = await fetch(`${API_URL}/reset`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });
    const data = await response.json();
    setStorage("session_id", data.session_id);
    return data;
  } catch (err) {
    console.log(err);
    alert("possible error try refreshing the page");
  }
}

export function checkSession() {
  const session_id = getStorage("session_id");
  if (!session_id) {
    newSession();
  }
  // console.log(session_id)
}

export async function manual(command: string) {
  const jwt = await getJWT();
  const session_id = getStorage("session_id");
  if (jwt && session_id) {
    return fetch(`${API_URL}/manual`, {
      method: "POST",
      body: JSON.stringify({
        command,
        session_id,
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
    })
      .then((res) => {
        const reader = res.body
          ?.pipeThrough(new TextDecoderStream())
          .getReader()!;
        return reader;
      })
      .catch((err) => {
        Sentry.captureException(err);
        console.error(err);
        alert("Something went wrong - we recommend refreshing the page");
      });
  }
  {
    Sentry.captureException({ jwt, session_id });
    alert("possible error try refreshing the page");
    // await setup()
  }
}

export async function auto() {
  const jwt = await getJWT();
  const session_id = getStorage("session_id");
  if (jwt && session_id) {
    return fetch(`${API_URL}/auto`, {
      method: "POST",
      body: JSON.stringify({
        session_id,
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
    })
      .then((res) => {
        const reader = res.body
          ?.pipeThrough(new TextDecoderStream())
          .getReader()!;
        return reader;
      })
      .catch((err) => {
        Sentry.captureException(err);
        console.error(err);
        alert("Something went wrong - we recommend refreshing the page");
      });
  } else {
    Sentry.captureException({ jwt, session_id });
    alert("possible error try refreshing the page");
  }
}
