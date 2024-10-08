import command from "../config.json" assert { type: "json" };
import Swal from "sweetalert2";
import * as Sentry from "@sentry/browser";
import { HELP } from "./commands/help";
import { BANNER } from "./commands/banner";
import posthog from "posthog-js";
import { newSession, getSessionMessages } from "./honcho";
import { getJWT } from "./auth";
import { getStorage } from "./utils";
import { userInputHandler, NAME, setName, loadSession } from "./input";
import {
  USERINPUT,
  MAIN_PROMPT,
  PRE_USER,
  PRE_HOST,
  PASSWORD_INPUT,
} from "./constants";
import { asyncWriteLines } from "./display";

if (
  !window.location.host.includes("127.0.0.1") &&
  !window.location.host.includes("localhost") &&
  import.meta.env?.VITE_POSTHOG_KEY
) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",
    person_profiles: "always", // or 'always' to create profiles for anonymous users as well
  });
}

if (import.meta.env?.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/yourserver\.io\/api/,
      "yousim.ai",
    ],
    // Session Replay
    replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
    replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
  });
}

const initEventListeners = () => {
  if (PRE_HOST) {
    PRE_HOST.innerText = command.hostname;
  }

  if (PRE_USER) {
    PRE_USER.innerText = command.username;
  }

  const setupPromise = getJWT().then(async () => {
    // const sessions = await getSessions();
    const existingSessionId = getStorage("session_id");
    // console.trace(existingSessionId);
    if (existingSessionId) {
      const sessionMessages = await getSessionMessages(existingSessionId);

      // const sessionMessages = await getSessionMessages(sessions[0].id);
      if (sessionMessages) {
        if (sessionMessages.messages.length > 0)
          setName(sessionMessages.messages[0].content.slice(8));

        return () => loadSession(sessionMessages);
      }
    } else {
      return newSession;
    }
  });

  let sweetAlertHTML = `<div id='social-buttons-alert'>
      <a href='https://x.com/plastic_labs' target='_blank'><button><i class='fab fa-twitter'></i></button></a>
          <a href='https://github.com/plastic-labs' target='_blank'><button><i
                class='fa-brands fa-github'></i></button></a>
          <a href='https://discord.gg/plasticlabs' target='_blank'><button><i
                class='fa-brands fa-discord'></i></button></a>
        </div><br>`;
  sweetAlertHTML +=
    "<p>YouSim is a fun open-ended demo to explore the multiverse of identities</p><br>";
  // sweetAlertHTML += "<p>to glimpse a (mere infinite) sliver of the (transfinite) diversity within the latent space.</p><br>"
  // sweetAlertHTML += "<p>Inspired by WorldSim, WebSim, & Infinite Backrooms, YouSim leverages Claude to let you locate, modify, & interact with any entity you can imagine.</p><br>"
  sweetAlertHTML +=
    "<p> It’s a game that can simulate anyone you like.</p><br>";
  sweetAlertHTML += "<p>Who will you summon?</p><br>";
  sweetAlertHTML +=
    "<a href='https://blog.plasticlabs.ai/blog/YouSim;-Explore-The-Multiverse-of-Identity' target='_blank'>Read more on our blog</a><br>";
  sweetAlertHTML +=
    "<a href='https://www.loom.com/share/b2fe578b183b400b88845656d7ceb232?sid=6cf3f677-6d42-45a7-bfa8-244626e6ebfe' target='_blank'>Watch a video tutorial</a><br>";

  document.addEventListener("DOMContentLoaded", async () => {
    if (USERINPUT) {
      USERINPUT.disabled = true;
    }

    // await newSession();
    const welcomePromises = asyncWriteLines(BANNER)
      .then(() => asyncWriteLines(HELP))
      .then(() => setupPromise)
      .then((sessionLoader) => {
        if (typeof sessionLoader === "function") {
          sessionLoader();
        }
      });

    const swalPromise = Swal.fire({
      title: "Welcome to YouSim",
      html: sweetAlertHTML,
      icon: "info",
      heightAuto: false,
    });
    await Promise.all([welcomePromises, swalPromise]);
    if (NAME === "") {
      if (MAIN_PROMPT) {
        MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
      }
    } else {
      if (MAIN_PROMPT) {
        MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${command.username}</span>@<span id="host">${command.hostname}</span>:$ ~ `;
      }
    }

    if (USERINPUT) {
      USERINPUT.disabled = false;
      USERINPUT.focus();
    }
  });

  USERINPUT.addEventListener("keypress", userInputHandler);
  USERINPUT.addEventListener("keydown", userInputHandler);
  PASSWORD_INPUT.addEventListener("keypress", userInputHandler);

  window.addEventListener("keydown", (event) => {
    console.log("Key pressed:", event.key);
    if (window && USERINPUT && event.target !== USERINPUT) {
      const selection = window.getSelection()?.toString();
      const isKeyboardShortcut =
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        ["Control", "Meta", "Alt"].includes(event.key);
      if (
        !selection ||
        (selection && selection.length === 0) ||
        !isKeyboardShortcut
      ) {
        USERINPUT.focus();
      }
    }
  });
};

initEventListeners();
