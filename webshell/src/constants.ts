const TERMINAL = document.getElementById("terminal");
const USERINPUT = document.getElementById("user-input") as HTMLInputElement;
const PASSWORD_INPUT = document.getElementById(
  "password-field"
) as HTMLInputElement;
const PRE_HOST = document.getElementById("pre-host");
const PRE_USER = document.getElementById("pre-user");
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
  "share"
];
const HISTORY: string[] = [];

export {
  TERMINAL,
  USERINPUT,
  PASSWORD_INPUT,
  PRE_HOST,
  PRE_USER,
  PROMPT,
  MAIN_PROMPT,
  COMMANDS,
  HISTORY,
}
