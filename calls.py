from typing import TypedDict
from pprint import pprint
import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
import re

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

class SummaryFollowUp:
    def __init__(self, summary: str, agent_message: str):
        self.summary: str = summary
        self.agent_message: str = agent_message

    def stream(self):
        messages = [
            {"role": "user", "content": f"""i've been working on constructing a unique agent identity. another agent has summarized a conversation about that identity i want to create:\n\n<summary>{self.summary}</summary>\n\nwhen i instantiated this identity, it responded with the following:\n\n<response>{self.agent_message}</response>\n\nplease address the identity to affirm its identity based on the summary. only focus on the identity, you don't need to explain who you are. prepare the identity for interacting with a user in the next message."""},
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
        self.user_message_two = f"""i've been chatting with a user about an identity they want to create. I had another agent generate a summary of that conversation. here's an overview of who you are to be:\n\n```{self.summary}```"""
        
        # Get assistant response to summary
        #TODO: remove anything inside asterisks. no emoting bullshit here
        self.assistant_message_two = self._get_assistant_message_two()
        print(f"\033[94m{self.assistant_message_two}\033[0m")

        # Get follow up from summary
        self.follow_up_response = self._get_summary_follow_up()
        print(f"\033[92m{self.follow_up_response}\033[0m")
        self.user_message_three = f"""here's some more context from that other agent:\n\n```{self.follow_up_response}```"""

        # Get assistant response to follow up
        #TODO: remove anything inside asterisks. no emoting bullshit here
        self.assistant_message_three = self._get_assistant_message_three()
        print(f"\033[94m{self.assistant_message_three}\033[0m")
        # Get user message to connect to user
        self.user_message_four = f"""in general, humans don't like verbosity so keep your responses concise and to the point. you will now be connected to the user who instantiated you.\n\nuser: {self.user_input}"""

    def _remove_asterisk_content(self, text: str) -> str:
        """Remove any text between asterisks (*) in the given string."""
        return re.sub(r'\*[^*]*\*', '', text)

    def _get_summary_follow_up(self) -> str:
        summary_follow_up = SummaryFollowUp(self.summary, self.assistant_message_two)
        response = ""
        for chunk in summary_follow_up.stream():
            response += chunk
        return response

    def _get_assistant_message_two(self) -> str:
        response = openai.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                {"role": "user", "content": self.user_message_one},
                {"role": "assistant", "content": self.assistant_message_one},
                {"role": "user", "content": self.user_message_two},
            ],
        )
        return self._remove_asterisk_content(response.choices[0].message.content)
    
    def _get_assistant_message_three(self) -> str:
        response = openai.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                {"role": "user", "content": self.user_message_one},
                {"role": "assistant", "content": self.assistant_message_one},
                {"role": "user", "content": self.user_message_two},
                {"role": "assistant", "content": self.assistant_message_two},
                {"role": "user", "content": self.user_message_three},
            ],
        )
        return self._remove_asterisk_content(response.choices[0].message.content)

    def stream(self):
        messages = [
            {"role": "user", "content": self.user_message_one},
            {"role": "assistant", "content": self.assistant_message_one},
            {"role": "user", "content": self.user_message_two},
            {"role": "assistant", "content": self.assistant_message_two},
            {"role": "user", "content": self.user_message_three},
            {"role": "assistant", "content": self.assistant_message_three},
            {"role": "user", "content": self.user_message_four},
            *self.history
        ]

        try:
            response = openai.chat.completions.create(
                model=OPENROUTER_MODEL,
                messages=messages,
                extra_body={
                    'provider': {
                        'order': ['DeepInfra', 'Hyperbolic', 'Fireworks', 'Together', 'Lambda'],
                    },
                },
            )
            return self._remove_asterisk_content(response.choices[0].message.content)
        except Exception as e:
            print(f"Error in API call: {e}")
            raise