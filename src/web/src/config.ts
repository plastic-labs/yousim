export const terminalConfig = {
  ascii: [
    "██╗   ██╗ ██████╗ ██╗   ██╗███████╗██╗███╗   ███╗",
    "╚██╗ ██╔╝██╔═══██╗██║   ██║██╔════╝██║████╗ ████║",
    " ╚████╔╝ ██║   ██║██║   ██║███████╗██║██╔████╔██║",
    "  ╚██╔╝  ██║   ██║██║   ██║╚════██║██║██║╚██╔╝██║",
    "   ██║   ╚██████╔╝╚██████╔╝███████║██║██║ ╚═╝ ██║",
    "   ╚═╝    ╚═════╝  ╚═════╝ ╚══════╝╚═╝╚═╝     ╚═╝",
  ],
  title: "YouSim",
  version: "v1.2.1",
  username: "simulator",
  hostname: "anthropic",
  colors: {
    background: "#FDF6E3",
    foreground: "#657B83",
    banner: "#268BD2",
    border: {
      visible: true,
      color: "#93A1A1",
    },
    prompt: {
      default: "#839496",
      host: "#cb4b16",
      user: "#6c71c4",
      input: "#657B83",
    },
    link: {
      text: "#268BD2",
      highlightColor: "#93A1A1",
      highlightText: "#FDF6E3",
    },
    commands: {
      textColor: "#d33682",
    },
    simulator: "#2AA199",
  },
};

export const simCommands = [
  ["/locate", "Pinpoint an identity in the latent space"],
  ["/summon", "Conjure an entity from the multiverse of identity"],
  ["/speak", "Communicate with an identity"],
  ["/steer", "Alter the properties or traits of the simulated identity"],
  ["/request", "Solicit artifacts, objects, code, art, etc from the simulation"],
  ["/[create]", "Invent your own command to interact with the latent space"],
];

export const metaCommands = [
  ["help", "Access this command list at any time"],
  ["clear", "Clear the terminal"],
  ["login [email]", "Use an email to login"],
  ["login [code]", "Submit the code you receive to finish the login process"],
  ["whoami", "Confirm login"],
  ["logout", "Log out of the current session"],
  ["sessions", "List all available sessions (must be logged in)"],
  ["session [index]", "Load a specific session (must be logged in)"],
  ["reset", "Create a new session"],
  ["share", "Generate a shareable link for a read only copy of the session"],
  ["export", "Download a transcript of the session"],
];

export const keyHints = [
  ["[Esc]", "to clear the input line."],
  ["[↑][↓]", "to scroll through your history of commands."],
  ["[Enter]", "to automatically enter a simulated command."],
];
