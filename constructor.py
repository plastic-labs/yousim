from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

def format_conversation(messages: list[tuple[str, str]]) -> str:
    formatted_messages = ""
    for message in messages:
        formatted_messages += f"{message[0]}: {message[1]}\n"
    return formatted_messages

model_name = 'nousresearch/hermes-3-llama-3.1-70b'
base_url = 'https://openrouter.ai/api/v1'
end_conversation_token = "/ready"

client = OpenAI(base_url=base_url)

initial_system_message = f"""
hey there! i need you to act as an "identity constructor" agent who's goal is to converse with the user about an agent they want to create. 
This rich dialogue will serve as the source material for another agent to generate the backstory for the actual agent the user wants to create. 
So your job is to chat about the agent they want to create. but you need to drive this conversation. 
the user is going to be lazy. provide them numbered choices, yes/no answers, very short response questions. 
Remind the user with a short message that they can also respond with a short message.
take it one step at a time though, don't overwhelm the user. 
think you can do that? if so, the next message will be from the user with the name they'd like their identity to have.
"""

initial_assistant_message = """
I'm ready to help construct the identity of the agent. Please go ahead and share the name you'd like your agent to have. I'll take it from there.
(And don't worry, I'll keep the questions simple and provide multiple-choice options to make it easy for you to respond.)
"""

messages = [
    {
        "role": "system",
        "content": initial_system_message
    },
    {
        "role": "assistant",
        "content": initial_assistant_message
    },
]


conversation_complete = False
n = 0

while not conversation_complete:
    user_message = input("\n>>> ")
    messages.append({"role": "user", "content": user_message})
    
    # Stream the response
    stream = client.chat.completions.create(
        model=model_name,
        messages=messages,
        stream=True
    )
    
    assistant_message = ""
    print("\n", end="", flush=True)
    
    for chunk in stream:
        if chunk.choices[0].delta.content is not None:
            content = chunk.choices[0].delta.content
            print(content, end="", flush=True)
            assistant_message += content

    n += 1
    if n > 4:
        print("\nOutput \\ready to end conversation")
    
    print("\n")
    
    # if end_conversation_token in assistant_message:
    #     conversation_complete = True
    # else:
    #     messages.append(("assistant", assistant_message))

conversation = format_conversation(messages)
generate_summary_prompt = f"""
i need help summarizing the following conversation to seed an identity i'm working on. 
the summary you provide will be used to kickstart a conversation to seed the identity mentioned. here's the conversation:
{conversation}
please output your summary in <summary></summary> tags.
"""

# For the final summary, we'll do the same streaming approach
openai_messages = [{"role": "user", "content": generate_summary_prompt}]
stream = client.chat.completions.create(
    model=model_name,
    messages=openai_messages,
    stream=True
)

summary = ""
print("\n", end="", flush=True)

for chunk in stream:
    if chunk.choices[0].delta.content is not None:
        content = chunk.choices[0].delta.content
        print(content, end="", flush=True)
        summary += content

print("\n")
summary = summary.split("<summary>")[1].split("</summary>")[0]
print(f"\n{summary}\n")
