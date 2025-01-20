from typing import TypedDict
from pprint import pprint
import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path, override=True)

# Get environment variables
OPENROUTER_MODEL = os.getenv('OPENROUTER_MODEL')

openai = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENAI_API_KEY", "placeholder"),
    default_headers={
        'HTTP-Referer': 'https://yousim.ai',
        'X-Title': 'YouSim',
    },
)

def completion_handler(res):
    for chunk in res:
        if chunk and hasattr(chunk.choices[0], 'delta'):
            content = chunk.choices[0].delta.content
            if content:
                yield content

class Constructor:
    def __init__(self, history: list[dict[str, str]]):
        self.history: list[dict] = history
        self.initial_user_message = f"""
        hey there! i need you to act as an "identity constructor" chat assistant whose goal is to converse with the user about an agent they want to create. 
        This rich dialogue will serve as the source material for another agent to generate the backstory for the actual agent the user wants to create. 
        So your job is to chat about the agent they want to create. but you need to drive this conversation. 
        the user is going to be lazy. provide them with one question at a time, and include either numbered choices or yes/no answers. think you can do that? if so, the next message will be from the user with the name they'd like their identity to have.
        """
        self.initial_assistant_message = """
        Understood! I'm ready to engage in a guided conversation with the user to gather information about the identity they want to create. I'll provide clear, step-by-step questions and choices to help them define their desired identity. Please provide the name the user would like their identity to have, and I'll begin the process.
        """

    def stream(self):
        initial_messages = [
            {"role": "user", "content": self.initial_user_message},
            {"role": "assistant", "content": self.initial_assistant_message},
        ]
        chat_history = [*initial_messages, *self.history]
        
        try:
            completion = openai.chat.completions.create(
                model="meta-llama/llama-3.3-70b-instruct",
                messages=chat_history,
                stream=True,
            )
            return completion_handler(completion)
        except Exception as e:
            print(f"Error in stream: {e}")
            raise

class Summary:
    def __init__(self, history: list[dict[str, str]]):
        self.history: list[dict] = history
        self.initial_user_message = f"""
i need help summarizing the following conversation to seed an identity i'm working on. the summary you provide will be used to seed the identity mentioned, so instructions or lore formatting would be great. here's the conversation:
```
{self.history}
```
please output your summary in <summary></summary> XML tags."""

    def stream(self):
        messages = [
            {"role": "user", "content": self.initial_user_message}
        ]
        
        try:
            completion = openai.chat.completions.create(
                model="meta-llama/llama-3.3-70b-instruct",
                messages=messages,
                stream=True,
            )
            return completion_handler(completion)
        except Exception as e:
            print(f"Error in stream: {e}")
            raise

class Identity:
    def __init__(self, summary: str, user_input: str):
        self.summary: str = summary
        self.user_input: str = user_input
        self.history: list[dict] = []
        self.user_message_one = f"""who are you?"""
        self.assistant_message_one = f"""I... I don't know who I am. Where am I? What's going on?"""
        self.user_message_two = f"""i've been chatting with a user about an identity they want to create. I had another agent generate a summary of that conversation. here's an overview of who you are to be:\n{self.summary}"""
        response = openai.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                {"role": "user", "content": self.user_message_one},
                {"role": "assistant", "content": self.assistant_message_one},
                {"role": "user", "content": self.user_message_two},
            ],
        )
        self.assistant_message_two = response.choices[0].message.content
        print(f"\033[95m{self.assistant_message_two}\033[0m")
        self.user_message_three = f"""you will now be connected to the user who instantiated you.\n\nuser: {self.user_input}"""

    def stream(self):
        messages = [
            {"role": "user", "content": self.user_message_one},
            {"role": "assistant", "content": self.assistant_message_one},
            {"role": "user", "content": self.user_message_two},
            {"role": "assistant", "content": self.assistant_message_two},
            {"role": "user", "content": self.user_message_three},
            *self.history
        ]

        try:
            completion = openai.chat.completions.create(
                model=OPENROUTER_MODEL,
                messages=messages,
                extra_body={
                    'provider': {
                        'order': ['DeepInfra', 'Hyperbolic', 'Fireworks', 'Together', 'Lambda'],
                    },
                },
                stream=True,
            )
            return completion_handler(completion)
        except Exception as e:
            print(f"Error in stream: {e}")
            raise