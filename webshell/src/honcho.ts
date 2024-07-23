import * as Sentry from "@sentry/browser";
const API_URL = import.meta.env.VITE_API_URL;
import { getStorage, setStorage } from "./utils";
import { getJWT } from "./auth";

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
  console.log(session_id)
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

interface Message {
  id: string;
  content: string;
  created_at: string;
  is_user: boolean;
}

export interface SessionData {
  session_id: string;
  messages: Message[];
}

export async function getSessionMessages(sessionId?: string) {
  const jwt = await getJWT();

  if (jwt) {
    const url = new URL(`${API_URL}/session`);
    if (sessionId) {
      url.searchParams.append("session_id", sessionId);
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SessionData = await response.json();
      return data;
    } catch (err) {
      Sentry.captureException(err);
      console.error("Failed to fetch session messages:", err);
      alert("Failed to fetch session messages. Please try again.");
    }
  } else {
    Sentry.captureException({ jwt });
    alert("Authentication error. Please try refreshing the page.");
  }
}

interface Session {
  created_at: string;
  id: string;
  is_active: boolean;
  location_id: string;
  metadata: Metadata;
  user_id: string;
}

interface Metadata {
  metadata: Record<string, string>;
}

export async function getSessions() {
  const jwt = await getJWT();

  if (jwt) {
    const url = new URL(`${API_URL}/sessions`);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: Session[] = await response.json();

      // console.trace(data);
      return data;
    } catch (err) {
      Sentry.captureException(err);
      console.error("Failed to fetch sessions:", err);
      alert("Failed to fetch sessions. Please try again.");
    }
  }
}

export async function updateSessionMetadata(metadata: Record<string, any>) {
  const jwt = await getJWT();
  const sessionId = getStorage("session_id");

  if (!sessionId) {
    console.error("No session ID found in local storage");
    alert("No active session found. Please start a new session.");
    return;
  }

  if (jwt) {
    const url = new URL(`${API_URL}/sessions/${sessionId}/metadata`);

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ metadata }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedSession: Session = await response.json();
      console.log("Session metadata updated:", updatedSession);
      return updatedSession;
    } catch (err) {
      Sentry.captureException(err);
      console.error("Failed to update session metadata:", err);
      alert("Failed to update session metadata. Please try again.");
    }
  } else {
    Sentry.captureException({ jwt });
    alert("Authentication error. Please try refreshing the page.");
  }
}

export async function getShareCode() {
  const jwt = await getJWT();
  const sessionId = getStorage("session_id");

  if (!sessionId) {
    console.error("No session ID found in local storage");
    alert("No active session found. Please start a new session.");
    return;
  }
  if (jwt) {
    const url = new URL(`${API_URL}/share/${sessionId}`);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { code } = await response.json();
      return code;
    } catch (err) {
      Sentry.captureException(err);
      console.error("Failed to generate share link:", err);
      alert("Failed to generate share link. Please try again.");
    }
  }
}

export async function getSharedMessages(code: string) {
  const url = new URL(`${API_URL}/share/messages/${code}`);

  try {
    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: SessionData = await response.json();
    return data;
  } catch (err) {
    Sentry.captureException(err);
    console.error("Failed to fetch session messages:", err);
    alert("Failed to fetch session messages. Please try again.");
  }
}
