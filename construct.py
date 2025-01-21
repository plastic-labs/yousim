from calls import Constructor, Summary, Identity
from time import sleep
import sys
import os
import re
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path, override=True)

def print_stream(response, color_code="92"):  # Default to green
    if response is None:
        print("\033[91mError: No response received\033[0m")
        return
        
    try:
        for text in response:
            if text:  # Only print non-empty text
                print(f"\033[{color_code}m{text}\033[0m", end="", flush=True)
        print("\n")
    except Exception as e:
        print(f"\033[91mError streaming response: {e}\033[0m")

def extract_summary(streamed_text: str) -> str:
    # Extract text between <summary> tags
    match = re.search(r'<summary>(.*?)</summary>', streamed_text, re.DOTALL)
    return match.group(1).strip() if match else ""

def handle_exit(input_text: str) -> None:
    if input_text.lower() == "exit":
        sys.exit()

def handle_constructor_turn(constructor: Constructor) -> str:
    print("\033[94mCONSTRUCTOR:\033[0m")
    response = constructor.stream()
    
    assistant_response = ""
    for chunk in response:
        assistant_response += chunk
        print(f"\033[94m{chunk}\033[0m", end="", flush=True)
    print("\n")
    
    constructor.history.append({"role": "assistant", "content": assistant_response})
    return assistant_response

def generate_identity_summary(constructor: Constructor) -> str | None:
    print("\033[93mGENERATING SUMMARY...\033[0m")
    summary = Summary(constructor.history)
    response = summary.stream()
    
    summary_text = ""
    try:
        for chunk in response:
            summary_text += chunk
            print(f"\033[93m{chunk}\033[0m", end="", flush=True)
        print("\n")
    except Exception as e:
        print(f"\033[91mError capturing summary: {e}\033[0m")
        return None
    
    extracted_summary = extract_summary(summary_text)
    if not extracted_summary:
        print("\033[91mError: Could not extract summary from response\033[0m")
        return None
    
    return extracted_summary

def handle_identity_conversation(identity: Identity) -> None:
    while True:
        print("\033[95mIDENTITY:\033[0m")
        response = identity.stream()
        identity_response = ""
        for chunk in response:
            identity_response += chunk
            print(f"\033[95m{chunk}\033[0m", end="", flush=True)
        print("\n")
        
        identity.history.append({"role": "assistant", "content": identity_response})
        
        user_input = input(">>> ")
        handle_exit(user_input)
        
        identity.history.append({"role": "user", "content": user_input})
        identity.user_input = user_input

def chat():
    # tell the user to enter a name
    print("\033[94mPlease enter a name for your identity:\033[0m")
    name = input(">>> ")
    handle_exit(name)

    # Initialize constructor
    constructor = Constructor(history=[])
    constructor.history.append({"role": "user", "content": name})
    turns = 1
    
    # Main conversation loop
    while True:
        handle_constructor_turn(constructor)

        if turns >= 5:
            print("\033[93m(threshold reached, type 'summary' to generate a summary of the conversation)\033[0m")
        
        user_input = input(">>> ")
        handle_exit(user_input)
        
        if user_input.lower() == "summary" and turns >= 5:
            extracted_summary = generate_identity_summary(constructor)
            if not extracted_summary:
                continue
                
            print("\033[94mINSTANTIATING IDENTITY...\033[0m")
            print("\033[95mSay hello to your new identity:\033[0m")
            user_input = input(">>> ")
            handle_exit(user_input)
            
            identity = Identity(extracted_summary, user_input)
            handle_identity_conversation(identity)
            break
            
        constructor.history.append({"role": "user", "content": user_input})
        turns += 1

if __name__ == "__main__":
    chat() 