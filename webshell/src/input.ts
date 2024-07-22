import command from "../config.json" assert { type: "json" };
import posthog from "posthog-js";
import { writeLines } from "./display";
import auth, { getJWT } from "./auth";
import { login, verifyOTP } from "./commands/login";
import { setStorage, sanitize } from "./utils";
import {
  newSession,
  getSessionMessages,
  getSessions,
  updateSessionMetadata,
  SessionData
} from "./honcho";
import {
  localManual,
  localAuto,
} from "./sim"
import { HELP } from "./commands/help";
import { BANNER } from "./commands/banner";
import { DEFAULT } from "./commands/default";
import {
  HISTORY,
  COMMANDS,
  USERINPUT,
  TERMINAL,
  PROMPT,
  MAIN_PROMPT,
} from "./constants";

let mutWriteLines = document.getElementById("write-lines");
let historyIdx = 0;
let tempInput = "";
let userInput: string;
let isPasswordInput = false;
let NAME = "";
const WRITELINESCOPY = mutWriteLines;

// Utility Functions related to the state of the terminal

function setName(name: string) {
  NAME = name;
}

const scrollToBottom = () => {
  const MAIN = document.getElementById("main");
  if (!MAIN) return;

  MAIN.scrollTop = MAIN.scrollHeight;
};

function loadSession(data: SessionData) {
  data?.messages.forEach((message) => {
    if (message.is_user) {
      let p = document.createElement("p");
      let span = document.createElement("span");
      span.className = "user";
      p.appendChild(span);
      span.innerHTML = sanitize(message.content)
      mutWriteLines?.parentNode!.insertBefore(p, mutWriteLines);
    } else {
      let p = document.createElement("p");
      let span = document.createElement("span");
      span.className = "simulator";
      p.appendChild(span);
      span.innerHTML = sanitize(message.content)
      mutWriteLines?.parentNode!.insertBefore(p, mutWriteLines);
    }
    scrollToBottom();
  });
}

// Functions corresponding to the different key presses

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

async function enterKey() {
  // console.table({
  //   NAME,
  //   username: command.username,
  //   hostname: command.hostname,
  //   MAIN_PROMPT,
  // });

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
        await newSession();
        window.location.reload();
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
    console.log(session)
    if (email) {
      writeLines([`You are logged in as ${email}`, "<br>"]);
    }
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  // if (userInput.startsWith("sessions")) {
  if (userInput.startsWith("session")) {
    USERINPUT.value = resetInput;

    // if (await isAnon()) {
    //   writeLines(["You are not logged in.", "<br>"]);
    //   return;
    // }

    const components = userInput.split(" ");

    if (components.length === 1) {
      const sessions = await getSessions();
      // console.trace(sessions);
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
      // console.trace(sessionData);
      if (sessionData) {
        setStorage("session_id", session.id);
        if (sessionData.messages.length > 0) {
          setName(sessionData.messages[0].content.slice(8));
        } else {
          setName("")
        }
        loadSession(sessionData);
      }
    }


    // Ensure the prompt matches the state of the loaded session
    if (MAIN_PROMPT) {
      if (NAME === "") {
        MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
      } else {
        MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${command.username}</span>@<span id="host">${command.hostname}</span>:$ ~ `;
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

export { userInputHandler, scrollToBottom, mutWriteLines, NAME, setName, loadSession };
