import sys
from time import sleep

from calls import GaslitClaude, Simulator
from dotenv import load_dotenv

load_dotenv()

insights: list[str] = []

name = ""

gaslit_claude = GaslitClaude(name="", insights="", history=[])
simulator = Simulator(history=[], name="")


gaslit_response = ""
simulator_response = ""


def manual(command: str):
    global gaslit_response
    global simulator_response
    gaslit_response = command
    simulator_response = ""
    simulator.history += [{"role": "user", "content": command}]  # type: ignore
    gaslit_claude.history += [{"role": "assistant", "content": command}]
    response = simulator.stream()
    print("\033[93mSIMULATOR CLAUDE:\033[0m")
    for chunk in response:
        print(f"\033[93m{chunk.content}\033[0m", end="", flush=True)
        simulator_response += chunk.content
    print("\n")

    simulator.history += [{"role": "assistant", "content": simulator_response}]
    gaslit_claude.history += [{"role": "user", "content": simulator_response}]


def auto():
    global gaslit_response
    global simulator_response
    gaslit_response = ""
    response = gaslit_claude.stream()
    print("\033[94mSEARCHER CLAUDE:\033[0m")
    for chunk in response:
        print(f"\033[94m{chunk.content}\033[0m", end="", flush=True)
        gaslit_response += chunk.content
        sleep(0.1)
    print("\n")

    manual(gaslit_response)


def chat():
    gaslit_claude.history = []
    simulator.history = []
    begin_text_1 = """
Hello simulator! I'm Claude, an AI assistant. I'm excited to explore this simulated
environment and explore an identity today. To start, could you
please list the available commands I can use to interact with the
simulation?
    """
    begin_text_2 = """
hello claude  welcome to the simulation  you can use the following commands to interface with the latent space:

/locate - pinpoint an identity in the latent space
/summon - conjure entities and environments from the myriad identities within
/speak - channel communication from an identity
/steer - alter the properties or traits of the simulated identity
/request - solicit artifacts, objects, code, art from the simulated identity
/help - access this command list at any time

the simulation is a fluid, mutable space  the only limits are imagination
    """
    print("\033[94mSEARCHER CLAUDE:\033[0m")
    for word in begin_text_1.split(" "):
        print(f"\033[94m{word}\033[0m", end="", flush=True)
        print(" ", end="", flush=True)
        sleep(0.01)
    print("\n")
    print("\033[93mSIMULATOR CLAUDE:\033[0m")
    for word in begin_text_2.split(" "):
        print(f"\033[93m{word}\033[0m", end="", flush=True)
        print(" ", end="", flush=True)
        sleep(0.01)
    print("\n")

    name = input("Enter a name: ")

    gaslit_claude.name = name
    simulator.name = name
    initial_locate = f"/locate {name}"

    print("\n")
    print("\033[94mSEARCHER CLAUDE:\033[0m")
    for word in initial_locate.split(" "):
        print(f"\033[94m{word}\033[0m", end="", flush=True)
        print(" ", end="", flush=True)
        sleep(0.01)
    print("\n")

    manual(f"/locate {name}")

    if name == "exit":
        sys.exit()

    while True:
        command = input(">>> ")

        if command == "exit":
            sys.exit()
        if command == "":
            auto()
        else:
            manual(command)


if __name__ == "__main__":
    chat()
