import command from "../config.json" assert { type: "json" };
import Swal from "sweetalert2";
import * as Sentry from "@sentry/browser";
import { HELP } from "./commands/help";
import { BANNER } from "./commands/banner";
// import { ABOUT } from "./commands/about"
import { DEFAULT } from "./commands/default";
// import { PROJECTS } from "./commands/projects";
// import { createWhoami } from "./commands/whoami";
import posthog from "posthog-js";
import {
  newSession,
  manual,
  auto,
  getSessionMessages,
  getSessions,
  SessionData,
  updateSessionMetadata,
} from "./honcho";
import auth, { getJWT } from "./auth";
import { login, verifyOTP } from "./commands/login";
import { getStorage, setStorage } from "./utils";

if (
  !window.location.host.includes("127.0.0.1") &&
  !window.location.host.includes("localhost")
) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",
    person_profiles: "always", // or 'always' to create profiles for anonymous users as well
  });
}

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

//mutWriteLines gets deleted and reassigned
let mutWriteLines = document.getElementById("write-lines");
let historyIdx = 0;
let tempInput = "";
let userInput: string;
// let isSudo = false;
let isPasswordInput = false;
// let passwordCounter = 0;
let NAME = "";

//WRITELINESCOPY is used to during the "clear" command
const WRITELINESCOPY = mutWriteLines;
const TERMINAL = document.getElementById("terminal");
const USERINPUT = document.getElementById("user-input") as HTMLInputElement;
// const INPUT_HIDDEN = document.getElementById("input-hidden");
// const PASSWORD = document.getElementById("password-input");
const PASSWORD_INPUT = document.getElementById(
  "password-field"
) as HTMLInputElement;
const PRE_HOST = document.getElementById("pre-host");
const PRE_USER = document.getElementById("pre-user");
// const HOST = document.getElementById("host");
// const USER = document.getElementById("user");
const PROMPT = document.getElementById("prompt");
const MAIN_PROMPT = document.querySelector("#input-hidden > span#prompt");
const COMMANDS = [
  "help",
  "about",
  "projects",
  "whoami",
  "repo",
  "banner",
  "clear",
];
const HISTORY: string[] = [];
// const SUDO_PASSWORD = command.password;
// const REPO_LINK = command.repoLink;

const scrollToBottom = () => {
  const MAIN = document.getElementById("main");
  if (!MAIN) return;

  MAIN.scrollTop = MAIN.scrollHeight;
};

function userInputHandler(e: KeyboardEvent) {
  const key = e.key;

  switch (key) {
    case "Enter":
      e.preventDefault();
      if (!isPasswordInput) {
        enterKey();
      } else {
        // passwordHandler();
      }

      scrollToBottom();
      break;
    case "Escape":
      USERINPUT.value = "";
      break;
    case "ArrowUp":
      arrowKeys(key);
      e.preventDefault();
      break;
    case "ArrowDown":
      arrowKeys(key);
      break;
    case "Tab":
      tabKey();
      e.preventDefault();
      break;
  }
}

async function enterKey() {
  console.table({
    NAME,
    username: command.username,
    hostname: command.hostname,
    MAIN_PROMPT,
  });

  if (!mutWriteLines || !PROMPT) return;
  const resetInput = "";
  let newUserInput;
  userInput = USERINPUT.value;

  posthog.capture("command sent", { command: userInput });

  newUserInput = `<span class='output'>${userInput}</span>`;

  HISTORY.push(userInput);
  historyIdx = HISTORY.length;

  if (userInput.startsWith("login")) {
    const components = userInput.split(" ");
    if (components.length !== 2) {
      writeLines(["Usage: login &lt;email&gt; or login &lt;code&gt;", "<br>"]);
      return;
    }
    const emailRegex =
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    const codeRegex = /^\d{6}$/;

    switch (true) {
      case emailRegex.test(components[1]):
        const emailResponse = await login(components[1]);
        writeLines([emailResponse, "<br>"]);
        break;
      case codeRegex.test(components[1]):
        const codeResponse = await verifyOTP(components[1]);
        writeLines([codeResponse, "<br>"]);
        break;
      default:
        writeLines([
          "Invalid usage. Please provide an email address or a 6 digit numeric code.",
          "<br>",
        ]);
        break;
    }

    USERINPUT.value = resetInput;
    userInput = resetInput;
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  if (userInput.startsWith("logout")) {
    auth.signOut();
    await getJWT();
    writeLines(["You have been logged out.", "<br>"]);
    setStorage("session_id", "");
    window.location.reload();
    return;
  }

  if (userInput.startsWith("whoami")) {
    USERINPUT.value = resetInput;
    const session = await auth.getSession();
    const email = session.data.session?.user.email;
    if (email) {
      writeLines([`You are logged in as ${email}`, "<br>"]);
    }
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  if (userInput.startsWith("sessions")) {
    USERINPUT.value = resetInput;

    // if (await isAnon()) {
    //   writeLines(["You are not logged in.", "<br>"]);
    //   return;
    // }

    const components = userInput.split(" ");

    if (components.length === 1) {
      const sessions = await getSessions();
      console.trace(sessions);
      if (sessions && sessions.length > 0) {
        const sessionList = sessions.map((session, index) => {
          const date = new Date(session.created_at).toLocaleString();
          let sessionName = "UNKNOWN";
          if (session.metadata.metadata) {
            sessionName = session.metadata.metadata.name;
          }
          return `${index}: ${date} - ${sessionName}`;
        });
        writeLines(["Available sessions:", ...sessionList, "<br>"]);
      } else {
        writeLines(["No sessions found.", "<br>"]);
      }
    }

    if (components.length === 2) {
      const sessionIdx = parseInt(components[1]);
      const sessions = await getSessions();

      if (!sessions || sessions.length === 0) {
        writeLines(["No sessions found.", "<br>"]);
        return;
      }

      const session = sessions[sessionIdx];

      if (!session) {
        writeLines(["Session not found.", "<br>"]);
        return;
      }

      commandHandler("clear");
      const sessionData = await getSessionMessages(session.id);
      console.trace(sessionData);
      if (sessionData) {
        setStorage("session_id", session.id);
        loadSession(sessionData);
      }
    }

    userInput = resetInput;
    return;
  }

  if (userInput === "reset") {
    await newSession();
    window.location.reload();
    return;
  }

  //if clear then early return
  if (userInput === "clear") {
    commandHandler(userInput.toLowerCase().trim());
    USERINPUT.value = resetInput;
    userInput = resetInput;
    return;
  }

  if (userInput === "help") {
    commandHandler(userInput.toLowerCase().trim());
    USERINPUT.value = resetInput;
    userInput = resetInput;
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  const div = document.createElement("div");
  div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;

  if (mutWriteLines.parentNode) {
    mutWriteLines.parentNode.insertBefore(div, mutWriteLines);
  }

  USERINPUT.value = resetInput;

  USERINPUT.disabled = true;
  if (MAIN_PROMPT) {
    MAIN_PROMPT.innerHTML = "LOADING...";
  }
  if (NAME === "") {
    if (userInput) {
      NAME = userInput;
      const updatePromise = updateSessionMetadata({ name: userInput });
      const responsePromise = localManual(`/locate ${userInput}`);
      await Promise.all([updatePromise, responsePromise]);
      if (MAIN_PROMPT) {
        MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${command.username}</span>@<span id="host">${command.hostname}</span>:$ ~ `;
      }
    }
  } else if (userInput === "") {
    await localAuto();
  } else {
    await localManual(userInput);
  }
  if (MAIN_PROMPT) {
    if (NAME === "") {
      MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
    } else {
      MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${command.username}</span>@<span id="host">${command.hostname}</span>:$ ~ `;
    }
  }
  USERINPUT.disabled = false;
  USERINPUT.focus();

  userInput = resetInput;
}

async function localManual(command: string) {
  let acc = "SEARCHER CLAUDE:\n";
  acc += command.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  if (!mutWriteLines) return;
  let p = document.createElement("p");
  let span = document.createElement("span");
  span.className = "searcher";
  p.appendChild(span);
  span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  acc = "\nSIMULATOR CLAUDE:\n";
  if (!mutWriteLines) return;
  p = document.createElement("p");
  span = document.createElement("span");
  p.appendChild(span);
  span.className = "simulator";
  span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  const reader: ReadableStreamDefaultReader<string> | void = await manual(
    command
  );
  let more = true;
  if (reader) {
    while (more) {
      const { done, value } = await reader.read();
      if (done) {
        more = false;
      }
      if (value) {
        // console.log(value)
        acc += value;
        // if (!mutWriteLines) return
        // let p = document.createElement("p");
        span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
        // mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
        scrollToBottom();
      }
    }
  }
  console.log(acc);
}

async function localAuto() {
  let preamble = "SEARCHER CLAUDE:\n";
  let acc = "";
  if (!mutWriteLines) return;
  let p = document.createElement("p");
  let span = document.createElement("span");
  span.className = "searcher";
  p.appendChild(span);
  span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");

  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  let reader: ReadableStreamDefaultReader<string> | void = await auto();
  let more = true;
  let count = 0;
  while (more) {
    if (reader) {
      const { done, value } = await reader.read();
      if (done) {
        if (count > 0) {
          more = false;
          continue;
        }
        count += 1;
        console.log(acc);
        reader = await manual(acc);
        preamble = "\nSIMULATOR CLAUDE:\n";
        acc = "";
        p = document.createElement("p");
        span = document.createElement("span");
        p.appendChild(span);
        span.className = "simulator";
        span.innerHTML = (preamble + acc)
          .replace(/\n/g, "<br>")
          .replace(/ /g, "&nbsp;");
        mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
        scrollToBottom();
      } else if (value) {
        // console.log(value)
        acc += value;
        // if (!mutWriteLines) return
        // let p = document.createElement("p");
        span.innerHTML = (preamble + acc)
          .replace(/\n/g, "<br>")
          .replace(/ /g, "&nbsp;");
        // mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
        scrollToBottom();
      }
    } else {
      more = false;
    }
  }

  console.log(acc);
}

function tabKey() {
  let currInput = USERINPUT.value;

  for (const ele of COMMANDS) {
    if (ele.startsWith(currInput)) {
      USERINPUT.value = ele;
      return;
    }
  }
}

function arrowKeys(e: string) {
  switch (e) {
    case "ArrowDown":
      if (historyIdx !== HISTORY.length) {
        historyIdx += 1;
        USERINPUT.value = HISTORY[historyIdx];
        if (historyIdx === HISTORY.length) USERINPUT.value = tempInput;
      }
      break;
    case "ArrowUp":
      if (historyIdx === HISTORY.length) tempInput = USERINPUT.value;
      if (historyIdx !== 0) {
        historyIdx -= 1;
        USERINPUT.value = HISTORY[historyIdx];
      }
      break;
  }
}

function commandHandler(input: string) {
  switch (input) {
    case "clear":
      setTimeout(() => {
        if (!TERMINAL || !WRITELINESCOPY) return;
        TERMINAL.innerHTML = "";
        TERMINAL.appendChild(WRITELINESCOPY);
        mutWriteLines = WRITELINESCOPY;
      });
      break;
    case "banner":
      writeLines(BANNER);
      break;
    case "help":
      writeLines(HELP);
      break;
    default:
      writeLines(DEFAULT);
      break;
  }
}

function writeLines(message: string[]) {
  message.forEach((item, idx) => {
    displayText(item, idx);
  });
}

function displayText(item: string, idx: number) {
  setTimeout(() => {
    if (!mutWriteLines) return;
    const p = document.createElement("p");
    p.innerHTML = item;
    mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
    scrollToBottom();
  }, 40 * idx);
}

async function asyncWriteLines(message: string[]): Promise<void> {
  const promises = message.map((item, idx) => asyncDisplayText(item, idx));
  return Promise.all(promises).then(() => {});
}

function asyncDisplayText(item: string, idx: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!mutWriteLines) {
        resolve();
        return;
      }
      const p = document.createElement("p");
      p.innerHTML = item;
      mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
      scrollToBottom();
      resolve();
    }, 40 * idx);
  });
}

function loadSession(data: SessionData) {
  data?.messages.forEach((message) => {
    if (message.is_user) {
      let p = document.createElement("p");
      let span = document.createElement("span");
      span.className = "user";
      p.appendChild(span);
      span.innerHTML = message.content
        .replace(/\n/g, "<br>")
        .replace(/ /g, "&nbsp;");
      mutWriteLines?.parentNode!.insertBefore(p, mutWriteLines);
    } else {
      let p = document.createElement("p");
      let span = document.createElement("span");
      span.className = "simulator";
      p.appendChild(span);
      span.innerHTML = message.content
        .replace(/\n/g, "<br>")
        .replace(/ /g, "&nbsp;");
      mutWriteLines?.parentNode!.insertBefore(p, mutWriteLines);
    }
    scrollToBottom();
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
    // console.trace(sessions);
    if (existingSessionId) {
      const sessionMessages = await getSessionMessages(existingSessionId);

      // const sessionMessages = await getSessionMessages(sessions[0].id);
      if (sessionMessages) {
        if (sessionMessages.messages.length > 0) NAME = "something";

        loadSession(sessionMessages);
      }
    } else {
      return newSession();
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
    "<a href='https://blog.plasticlabs.ai/blog/YouSim;-Explore-The-Multiverse-of-Identity' target='_blank'>Read more on our blog</a>";

  window.addEventListener("load", async () => {
    if (USERINPUT) {
      USERINPUT.disabled = true;
    }

    // await newSession();
    const welcomePromises = asyncWriteLines(BANNER)
      .then(() => {
        return asyncWriteLines(HELP);
      })
      .then(() => {
        return setupPromise;
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
      // if (USERINPUT) {
      //   USERINPUT.focus()
      // }
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

  window.addEventListener("click", () => {
    if (window && USERINPUT) {
      const selection = window.getSelection()?.toString();
      if (!selection || (selection && selection.length === 0)) {
        USERINPUT.focus();
      }
    }
  });

  // console.log(`%cPassword: ${command.password}`, "color: red; font-size: 20px;");
};

initEventListeners();
