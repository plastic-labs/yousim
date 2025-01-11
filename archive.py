import sys
import os
from time import sleep

from calls import GaslitClaude, Simulator
import csv
from dotenv import load_dotenv

load_dotenv()


def load_messages_from_csv(file_path):
    messages = []
    processed_messages = []

    with open(file_path, "r", encoding="utf-8") as file:
        csv_reader = csv.reader(file)
        next(csv_reader)  # Skip header row
        for row in csv_reader:
            messages.append(row[0])  # Assuming message is in first column

    for i in range(len(messages)):
        text = messages[i].replace("\\n", "\n")
        if i % 2 == 0:
            processed_messages.append({"role": "user", "content": text})
        else:
            processed_messages.append({"role": "assistant", "content": text})

    return processed_messages


def write_list_to_csv(data_list, file_path):
    with open(file_path, "w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["content"])  # Write header
        for item in data_list:
            writer.writerow([item])  # Write each item as a row


# Example usage
file_path = "history.csv"
if os.path.exists(file_path):
    conversation = load_messages_from_csv(file_path)
else:
    conversation = []

insights: list[str] = []

name = ""

gaslit_claude = GaslitClaude(name="", insights="", history=[*conversation])
simulator = Simulator(history=[*conversation], name="")

gaslit_response = ""
simulator_response = ""


def manual(command: str):
    global gaslit_response
    global simulator_response
    gaslit_response = command
    simulator_response = ""
    simulator.history += [{"role": "user", "content": command}]
    gaslit_claude.history += [{"role": "assistant", "content": command}]
    response = simulator.stream()
    print("\033[93mSIMULATOR CLAUDE:\033[0m")
    for text in response:
        print(f"\033[93m{text}\033[0m", end="", flush=True)
        simulator_response += text
    print("\n")

    simulator.history += [{"role": "assistant", "content": simulator_response}]
    gaslit_claude.history += [{"role": "user", "content": simulator_response}]


def auto():
    global gaslit_response
    global simulator_response
    # global insights
    gaslit_response = ""
    response = gaslit_claude.stream()
    print("\033[94mSEARCHER CLAUDE:\033[0m")
    for text in response:
        print(f"\033[94m{text}\033[0m", end="", flush=True)
        gaslit_response += text
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
/[create] - Invent your own command to interact with the latent space

the simulation is a fluid, mutable space  the only limits are imagination
    """
    print("\033[94mSEARCHER CLAUDE:\033[0m")
    for word in begin_text_1.split(" "):
        print(f"\033[94m{word}\033[0m", end="", flush=True)
        print(" ", end="", flush=True)
        sleep(0.001)
    print("\n")
    print("\033[93mSIMULATOR CLAUDE:\033[0m")
    for word in begin_text_2.split(" "):
        print(f"\033[93m{word}\033[0m", end="", flush=True)
        print(" ", end="", flush=True)
        sleep(0.001)
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
    for msg in conversation:
        if msg["role"] == "user":
            gaslit_claude.history += [{"role": "user", "content": msg["content"]}]
            print("\033[94mSEARCHER CLAUDE:\033[0m")
            print(f"\033[94m{msg['content']}\033[0m", end="", flush=True)
            print(" ", end="", flush=True)
        else:
            print("\033[93mSIMULATOR CLAUDE:\033[0m")
            print(f"\033[93m{msg['content']}\033[0m", end="", flush=True)
            print(" ", end="", flush=True)
        print("\n")

    while True:
        command = input(">>> ")
        print(command)

        if command == "exit":
            sys.exit()
        if command == "archive":
            write_list_to_csv(simulator.history, "output.csv")
        if command == "":
            auto()
        else:
            manual(command)
    # chat()
